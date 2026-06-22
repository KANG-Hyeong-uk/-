"""
Trust Backend - Structured Logging Configuration
Uses structlog for JSON-formatted, Cloud Logging compatible output.
"""

import logging
import sys

import structlog


def setup_logging(environment: str = "development") -> None:
    """Configure structlog and stdlib logging for the application.

    Args:
        environment: "production" for JSON output, otherwise console-friendly output.
    """
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if environment == "production":
        # JSON renderer for Cloud Logging / structured log aggregation
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        # Human-readable console output for local development
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)

    # Quiet noisy third-party loggers
    for noisy in ("httpx", "httpcore", "uvicorn.access", "supabase"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structlog logger, optionally bound to *name*."""
    return structlog.get_logger(name)
