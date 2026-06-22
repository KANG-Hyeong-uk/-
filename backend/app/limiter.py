"""Simple in-memory rate limiter middleware for FastAPI."""

import re
import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Per-path rate limit config: (max_requests, window_seconds)
# Supports {param} placeholders for path parameters
RATE_LIMITS = {
    "POST /api/scan": (5, 60),
    "POST /api/analyze": (10, 60),
    "GET /api/scan/{id}/export": (10, 60),
    "POST /api/scheduled-scans": (10, 60),
    "DELETE /api/scheduled-scans/{id}": (10, 60),
    "POST /api/repo-scan": (3, 60),
    "GET /api/repo-scan/{id}": (30, 60),
    "POST /api/repo-scan/{id}/analyze": (10, 60),
}
DEFAULT_LIMIT = (60, 60)  # 60 requests per 60 seconds

# Compile pattern routes once at import time
_COMPILED_PATTERNS: list[tuple[re.Pattern, str, tuple[int, int]]] = []
_EXACT_LIMITS: dict[str, tuple[int, int]] = {}

for key, limit in RATE_LIMITS.items():
    if "{" in key:
        # Escape the key for regex, then replace escaped {param} with wildcard
        regex = re.escape(key)
        regex = re.sub(r"\\{[^}]+\\}", r"[^/]+", regex)
        _COMPILED_PATTERNS.append((re.compile(f"^{regex}$"), key, limit))
    else:
        _EXACT_LIMITS[key] = limit

# Max window across all configured limits (for periodic full cleanup)
_MAX_WINDOW = max(w for _, w in RATE_LIMITS.values())


def _normalize_path(path: str) -> str:
    """Strip /v1 prefix so /api/v1/scan matches /api/scan rules."""
    if path.startswith("/api/v1/"):
        return "/api/" + path[len("/api/v1/"):]
    return path


def _match_rate_limit(route_key: str) -> tuple[str, tuple[int, int]]:
    """Match a route key to its rate limit config, returning (normalized_key, limit)."""
    # Try exact match first
    if route_key in _EXACT_LIMITS:
        return route_key, _EXACT_LIMITS[route_key]
    # Try pattern match
    for pattern, pattern_key, limit in _COMPILED_PATTERNS:
        if pattern.match(route_key):
            return pattern_key, limit
    return route_key, DEFAULT_LIMIT


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        # {client_ip: {route_key: [timestamp, ...]}}
        self._requests: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        self._request_count = 0

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _full_cleanup(self) -> None:
        """Periodic full cleanup of all stale entries."""
        now = time.time()
        empty_ips = []
        for client_ip, routes in self._requests.items():
            empty_routes = []
            for route_key, timestamps in routes.items():
                routes[route_key] = [t for t in timestamps if now - t < _MAX_WINDOW]
                if not routes[route_key]:
                    empty_routes.append(route_key)
            for route_key in empty_routes:
                del routes[route_key]
            if not routes:
                empty_ips.append(client_ip)
        for client_ip in empty_ips:
            del self._requests[client_ip]

    async def dispatch(self, request: Request, call_next):
        client_ip = self._get_client_ip(request)
        raw_key = f"{request.method} {_normalize_path(request.url.path)}"

        # Match against rate limit config (exact or pattern)
        limit_key, (max_requests, window) = _match_rate_limit(raw_key)
        now = time.time()

        # Use the normalized pattern key for counting (so all /scan/{id}/export share one bucket)
        timestamps = self._requests[client_ip][limit_key]
        self._requests[client_ip][limit_key] = [t for t in timestamps if now - t < window]

        # Remove empty route_key entries after filtering expired timestamps
        if not self._requests[client_ip][limit_key]:
            del self._requests[client_ip][limit_key]
            # Remove empty client_ip entries
            if not self._requests[client_ip]:
                del self._requests[client_ip]

        current_count = len(self._requests.get(client_ip, {}).get(limit_key, []))
        if current_count >= max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(window)},
            )

        self._requests[client_ip][limit_key].append(now)

        # Periodic full cleanup every 100 requests
        self._request_count += 1
        if self._request_count >= 100:
            self._request_count = 0
            self._full_cleanup()

        return await call_next(request)
