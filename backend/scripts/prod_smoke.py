"""Post-deploy smoke test against production.

Picks a handful of vibe-coder-style targets, runs each through the
production scan API (no GitHub hint — verifies legacy flow survives),
and reports per-target score/duration plus any anomalies.

Usage:
    .venv/bin/python3 scripts/prod_smoke.py
"""

import argparse
import asyncio
import time
from statistics import median

import httpx

BASE_URL = "https://trust-backend-knnd76vaqq-du.a.run.app"

# Vibe-coder-style targets: real Next.js/Astro/SvelteKit sites. Chosen
# because they are public documentation/marketing pages that can handle
# a light security scan without issue.
TARGETS = [
    "https://www.trust-scan.me",         # dogfood — our own site
    "https://nextjs.org",                # Next.js marketing
    "https://astro.build",               # Astro marketing
    "https://ui.shadcn.com",             # shadcn/ui (popular vibe-coder tool)
    "https://resend.com",                # Resend (Next.js SaaS)
]

SCAN_MODE = "quick"
POLL_INTERVAL = 10
MAX_WAIT = 600


async def submit(client: httpx.AsyncClient, url: str) -> dict:
    t0 = time.monotonic()
    r = await client.post(
        f"{BASE_URL}/api/scan",
        json={"target_url": url, "scan_mode": SCAN_MODE},
        timeout=30,
    )
    return {
        "url": url,
        "submit_ms": round((time.monotonic() - t0) * 1000),
        "http": r.status_code,
        "scan_id": r.json().get("scan_id") if r.status_code == 200 else None,
        "error": None if r.status_code == 200 else r.text[:200],
    }


async def poll(client: httpx.AsyncClient, entry: dict) -> dict:
    if not entry.get("scan_id"):
        return {**entry, "final": "not_submitted"}
    t0 = time.monotonic()
    while True:
        if time.monotonic() - t0 > MAX_WAIT:
            return {**entry, "final": "timeout"}
        try:
            r = await client.get(f"{BASE_URL}/api/scan/{entry['scan_id']}", timeout=15)
            if r.status_code == 200:
                data = r.json()
                status = data.get("status")
                if status in ("completed", "failed"):
                    return {
                        **entry,
                        "final": status,
                        "score": data.get("score"),
                        "grade": data.get("grade"),
                        "duration_s": round(time.monotonic() - t0),
                        "error_message": data.get("error_message"),
                    }
        except Exception:
            pass
        await asyncio.sleep(POLL_INTERVAL)


def render(rows: list[dict]) -> None:
    print("\n━━━ Prod smoke results ━━━")
    widths = {"url": 36, "http": 4, "final": 10, "grade": 5, "score": 5, "dur": 5}
    header = f"{'target':<36} {'http':>4}  {'status':<10} {'grade':>5}  {'score':>5}  {'dur':>5}"
    print(header)
    print("-" * len(header))
    for r in rows:
        print(
            f"{(r['url'][:36]):<36} "
            f"{r['http']:>4}  "
            f"{r.get('final','?'):<10} "
            f"{(r.get('grade') or '-'):>5}  "
            f"{str(r.get('score') or '-'):>5}  "
            f"{str(r.get('duration_s') or '-'):>5}"
        )
        if r.get("error_message"):
            print(f"    ! {r['error_message'][:100]}")
        if r.get("error"):
            print(f"    ! {r['error'][:100]}")

    completed = [r for r in rows if r.get("final") == "completed"]
    if completed:
        durations = [r["duration_s"] for r in completed]
        scores = [r["score"] for r in completed if r.get("score") is not None]
        print()
        print(f"completed: {len(completed)}/{len(rows)}")
        if durations:
            print(f"duration median/max: {median(durations)}s / {max(durations)}s")
        if scores:
            print(f"score range: {min(scores)}–{max(scores)}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets", nargs="*", help="Override target list")
    args = parser.parse_args()
    targets = args.targets or TARGETS

    print(f"Submitting {len(targets)} scans against {BASE_URL}…")
    async with httpx.AsyncClient() as client:
        submissions = await asyncio.gather(*(submit(client, t) for t in targets))
        for s in submissions:
            print(f"  [{s['http']}] {s['url']} scan_id={s.get('scan_id','-')} {s['submit_ms']}ms")

        print("\nPolling to completion…")
        results = await asyncio.gather(*(poll(client, s) for s in submissions))

    render(results)


if __name__ == "__main__":
    asyncio.run(main())
