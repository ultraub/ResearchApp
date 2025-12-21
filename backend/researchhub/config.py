"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, PostgresDsn, RedisDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "Pasteur"
    app_version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # API
    api_prefix: str = "/api/v1"
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # Database
    database_url: PostgresDsn = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/researchhub"
    )
    database_pool_size: int = 20
    database_max_overflow: int = 10
    database_pool_timeout: int = 30

    # Redis
    redis_url: RedisDsn = Field(default="redis://localhost:6379/0")
    redis_cache_ttl: int = 3600  # 1 hour default

    # Google OAuth Authentication
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")

    # JWT Settings (for guest access tokens)
    jwt_secret_key: SecretStr = SecretStr("change-me-in-production")
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7
    guest_token_expire_days: int = 30

    # Azure Storage
    azure_storage_account_name: str = ""
    azure_storage_container_name: str = "attachments"
    azure_storage_connection_string: SecretStr = SecretStr("")

    # AI Providers
    ai_primary_provider: Literal["anthropic", "azure_openai", "gemini"] = "anthropic"
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    azure_openai_endpoint: str = ""
    azure_openai_api_key: SecretStr = SecretStr("")
    azure_openai_deployment: str = "gpt-4"
    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = "gemini-2.5-flash"

    # Feature Flags
    feature_ai_enabled: bool = True
    feature_guest_access_enabled: bool = True
    feature_document_reviews_enabled: bool = True

    # Rate Limiting
    rate_limit_requests_per_minute: int = 60
    rate_limit_ai_requests_per_minute: int = 20

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Monitoring
    sentry_dsn: str = ""
    prometheus_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
