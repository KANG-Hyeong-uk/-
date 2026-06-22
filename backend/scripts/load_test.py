"""
Trust Backend stress test.

Ramps concurrent /api/scan submissions, polls each scan to completion,
and reports submission latency, success rate, and error breakdown.

Usage:
    python scripts/load_test.py --phase baseline
    python scripts/load_test.py --phase ramp
    python scripts/load_test.py --n 100 --concurrency 100
"""

import argparse
import asyncio
import statistics
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

import httpx

BASE_URL = "https://trust-backend-knnd76vaqq-du.a.run.app"

# Confirmed-live targets (verified via curl 2026-04-20)
TARGETS = [
    "http://demo.testfire.net",              # IBM Altoro Mutual (bank demo)
    "https://public-firing-range.appspot.com", # Google XSS firing range
    "https://badssl.com",                    # Bad SSL/TLS configs
]

SCAN_MODE = "full"            # full DAST sweep (~5-10 min)
POLL_INTERVAL = 15            # seconds between status polls
MAX_WAIT = 900                # 15 min per scan max
SUBMIT_TIMEOUT = 30           # scan POST should return fast


@dataclass
class ScanResult:
    idx: int
    target: str
    submitted: bool = False
    submit_latency_ms: float = 0.0
    submit_status: int = 0
    submit_error: Optional[str] = None
    scan_id: Optional[str] = None
    final_status: Optional[str] = None          # completed/failed/timeout
    total_duration_s: float = 0.0
    poll_count: int = 0


@dataclass
class PhaseReport:
    name: str
    requested: int
    submit_accepted: int = 0
    submit_rejected: int = 0
    completed: int = 0
    failed: int = 0
    timed_out: int = 0
    submit_latencies_ms: list = field(default_factory=list)
    scan_durations_s: list = field(default_factory=list)
    error_counter: Counter = field(default_factory=Counter)
    submit_http_status: Counter = field(default_factory=Counter)
    wall_time_s: float = 0.0


async def submit_scan(client: httpx.AsyncClient, idx: int, target: str, retry_429: bool = True) -> ScanResult:
    result = ScanResult(idx=idx, target=target)
    attempts = 0
    while True:
        attempts += 1
        t0 = time.monotonic()
        try:
            r = await client.post(
                f"{BASE_URL}/api/scan",
                json={"target_url": target, "scan_mode": SCAN_MODE},
                timeout=SUBMIT_TIMEOUT,
            )
            result.submit_latency_ms = (time.monotonic() - t0) * 1000
            result.submit_status = r.status_code
            if r.status_code == 200:
                data = r.json()
                result.scan_id = data.get("scan_id")
                result.submitted = True
                return result
            if r.status_code == 429 and retry_429 and attempts < 3:
                # Respect Retry-After (or default 65s) then retry once
                wait = int(r.headers.get("Retry-After", "65"))
                print(f"  [{idx}] 429 for {target}, waiting {wait}s and retrying…")
                await asyncio.sleep(wait + 2)
                continue
            result.submit_error = f"HTTP {r.status_code}: {r.text[:120]}"
            return result
        except Exception as e:
            result.submit_latency_ms = (time.monotonic() - t0) * 1000
            result.submit_error = f"{type(e).__name__}: {str(e)[:120]}"
            return result


async def poll_until_done(client: httpx.AsyncClient, result: ScanResult) -> ScanResult:
    if not result.scan_id:
        result.final_status = "not_submitted"
        return result
    t0 = time.monotonic()
    while True:
        elapsed = time.monotonic() - t0
        if elapsed > MAX_WAIT:
            result.final_status = "timeout"
            result.total_duration_s = elapsed
            return result
        try:
            r = await client.get(
                f"{BASE_URL}/api/scan/{result.scan_id}",
                timeout=15,
            )
            result.poll_count += 1
            if r.status_code == 200:
                data = r.json()
                status = data.get("status")
                if status in ("completed", "failed"):
                    result.final_status = status
                    result.total_duration_s = time.monotonic() - t0
                    return result
            # else: transient, keep polling
        except Exception:
            pass
        await asyncio.sleep(POLL_INTERVAL)


async def run_phase(name: str, count: int, concurrency: int) -> PhaseReport:
    report = PhaseReport(name=name, requested=count)
    print(f"\n━━━ Phase {name}: {count} scans, concurrency={concurrency} ━━━")
    t_phase = time.monotonic()

    # Share a connection pool; allow many concurrent connections
    limits = httpx.Limits(max_connections=concurrency + 20, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(limits=limits, http2=False) as client:
        # Phase 1: submit all scans concurrently (bounded)
        sem = asyncio.Semaphore(concurrency)

        async def _submit(i: int):
            async with sem:
                return await submit_scan(client, i, TARGETS[i % len(TARGETS)])

        print(f"[{name}] submitting {count} scans…")
        t_submit = time.monotonic()
        submissions = await asyncio.gather(*(_submit(i) for i in range(count)))
        submit_wall = time.monotonic() - t_submit
        print(f"[{name}] submit wall-time: {submit_wall:.1f}s")

        for r in submissions:
            report.submit_http_status[r.submit_status] += 1
            report.submit_latencies_ms.append(r.submit_latency_ms)
            if r.submitted:
                report.submit_accepted += 1
            else:
                report.submit_rejected += 1
                if r.submit_error:
                    report.error_counter[r.submit_error.split(":")[0]] += 1

        accepted = [r for r in submissions if r.submitted]
        print(f"[{name}] accepted {len(accepted)}/{count}; polling to completion…")

        # Phase 2: poll all accepted scans in parallel
        poll_results = await asyncio.gather(*(poll_until_done(client, r) for r in accepted))

        for r in poll_results:
            if r.final_status == "completed":
                report.completed += 1
                report.scan_durations_s.append(r.total_duration_s)
            elif r.final_status == "failed":
                report.failed += 1
                report.scan_durations_s.append(r.total_duration_s)
            elif r.final_status == "timeout":
                report.timed_out += 1

    report.wall_time_s = time.monotonic() - t_phase
    print_report(report)
    return report


def pct(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    k = int(len(values) * p / 100)
    k = min(k, len(values) - 1)
    return values[k]


def print_report(r: PhaseReport):
    print(f"\n┌── Phase {r.name} results ──")
    print(f"│ Requested:        {r.requested}")
    print(f"│ Submit accepted:  {r.submit_accepted}")
    print(f"│ Submit rejected:  {r.submit_rejected}")
    print(f"│ HTTP status mix:  {dict(r.submit_http_status)}")
    if r.submit_latencies_ms:
        print(f"│ Submit latency:   p50={pct(r.submit_latencies_ms,50):.0f}ms "
              f"p95={pct(r.submit_latencies_ms,95):.0f}ms "
              f"p99={pct(r.submit_latencies_ms,99):.0f}ms "
              f"max={max(r.submit_latencies_ms):.0f}ms")
    print(f"│ Scan completed:   {r.completed}")
    print(f"│ Scan failed:      {r.failed}")
    print(f"│ Scan timed out:   {r.timed_out}")
    if r.scan_durations_s:
        print(f"│ Scan duration:    p50={pct(r.scan_durations_s,50):.0f}s "
              f"p95={pct(r.scan_durations_s,95):.0f}s "
              f"max={max(r.scan_durations_s):.0f}s")
    if r.error_counter:
        print(f"│ Errors:           {dict(r.error_counter)}")
    print(f"│ Total wall time:  {r.wall_time_s:.0f}s")
    print(f"└────────────────────────")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["baseline", "ramp", "single"], default="ramp")
    parser.add_argument("--n", type=int, default=100, help="scan count (single phase)")
    parser.add_argument("--concurrency", type=int, default=100, help="max concurrent submissions")
    args = parser.parse_args()

    if args.phase == "baseline":
        await run_phase("baseline", count=5, concurrency=1)
    elif args.phase == "single":
        await run_phase(f"single-{args.n}", count=args.n, concurrency=args.concurrency)
    else:  # ramp
        await run_phase("ramp-10", count=10, concurrency=10)
        await asyncio.sleep(30)   # cooldown
        await run_phase("ramp-30", count=30, concurrency=30)
        await asyncio.sleep(30)
        await run_phase("ramp-60", count=60, concurrency=60)
        await asyncio.sleep(30)
        await run_phase("ramp-100", count=100, concurrency=100)


if __name__ == "__main__":
    asyncio.run(main())
