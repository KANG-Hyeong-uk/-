"""
Trust Backend Configuration
Environment variables and settings via pydantic-settings
"""

import os
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env files."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # PostgreSQL
    database_url: str = ""  # postgresql://user:pass@host:5432/dbname

    # JWT (self-signed, no Supabase)
    jwt_secret: str = ""

    # Gemini API
    gemini_api_key: str = ""

    # Application
    environment: str = "development"
    debug: bool = False

    # Nuclei
    nuclei_timeout: int = 600
    nuclei_rate_limit: int = 200
    nuclei_concurrency: int = 35
    nuclei_templates_dir: str = "/root/nuclei-templates"

    # Scan output directory
    scan_output_dir: str = "/tmp/trust_scans"

    # Notifications
    resend_api_key: str = ""

    # GitHub (for private repo scanning)
    github_token: Optional[str] = None

    # GitHub OAuth App (for PR Auto-Fix)
    github_app_client_id: str = ""
    github_app_client_secret: str = ""

    # GitHub Webhook (for PR merge/close tracking)
    github_webhook_secret: str = ""

    # Vercel OAuth (for production URL lookup on URL scans)
    vercel_oauth_client_id: str = Field(default="", alias="VERCEL_OAUTH_CLIENT_ID")
    vercel_oauth_client_secret: str = Field(default="", alias="VERCEL_OAUTH_CLIENT_SECRET")

    # Repo scan
    repo_scan_timeout: int = 600

    # Paddle
    paddle_api_key: str = ""
    paddle_webhook_secret: str = ""
    paddle_price_monthly: str = ""
    paddle_price_yearly: str = ""
    paddle_discount_id: str = ""

    # Web Push (VAPID)
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_email: str = "mailto:contact@trust-scan.me"

    # Admin
    admin_secret: str = ""

    # CORS allowed origins (comma-separated string in env, mapped from ALLOWED_ORIGINS)
    allowed_origins_str: str = Field(default="", alias="ALLOWED_ORIGINS")

    @property
    def allowed_origins(self) -> list[str]:
        if not self.allowed_origins_str:
            return []
        return [o.strip() for o in self.allowed_origins_str.split(",") if o.strip()]

    def model_post_init(self, __context: object) -> None:
        os.makedirs(self.scan_output_dir, exist_ok=True)

    def validate(self) -> list[str]:
        """Validate required settings"""
        errors = []
        if not self.database_url:
            errors.append("DATABASE_URL is required")
        if not self.jwt_secret:
            errors.append("JWT_SECRET is required")
        if not self.gemini_api_key:
            errors.append("GEMINI_API_KEY is required")
        return errors


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
