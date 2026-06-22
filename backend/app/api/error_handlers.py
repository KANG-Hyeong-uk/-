"""
RFC 7807 Problem Details error handling for Trust API.
See: https://www.rfc-editor.org/rfc/rfc7807
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.logging_config import get_logger

logger = get_logger(__name__)


def problem_response(
    status: int,
    title: str,
    detail: str,
    instance: str = "",
    type_uri: str = "about:blank",
) -> JSONResponse:
    """Build an RFC 7807 Problem Details JSON response."""
    return JSONResponse(
        status_code=status,
        content={
            "type": type_uri,
            "title": title,
            "status": status,
            "detail": detail,
            "instance": instance,
        },
        media_type="application/problem+json",
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register RFC 7807-compliant exception handlers on the FastAPI app."""

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        title_map = {
            400: "Bad Request",
            401: "Unauthorized",
            403: "Forbidden",
            404: "Not Found",
            409: "Conflict",
            422: "Unprocessable Entity",
            429: "Too Many Requests",
            500: "Internal Server Error",
        }
        return problem_response(
            status=exc.status_code,
            title=title_map.get(exc.status_code, "Error"),
            detail=exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            instance=str(request.url.path),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        details = "; ".join(
            f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        return problem_response(
            status=422,
            title="Validation Error",
            detail=details,
            instance=str(request.url.path),
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error("unhandled_exception", error=str(exc), path=str(request.url.path), exc_info=True)
        return problem_response(
            status=500,
            title="Internal Server Error",
            detail="An unexpected error occurred",
            instance=str(request.url.path),
        )
