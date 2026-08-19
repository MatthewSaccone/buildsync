from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "BuildSync"
    environment: str = "development"  # "development", "staging", or "production"
    database_url_dev: str = "sqlite:///./buildsync.db"
    database_url_staging: str = ""
    database_url_prod: str = ""
    secret_key: str = "change-me-in-prod"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    password_reset_token_expire_minutes: int = 30
    upload_dir: str = "app/static/uploads"
    max_upload_size_bytes: int = 15 * 1024 * 1024
    cors_origins: str = "http://localhost:3000"
    allowed_hosts: str = ""  # comma-separated; empty disables TrustedHostMiddleware (dev default)
    debug: bool = True
    clamav_enabled: bool = True
    clamav_socket: str = "/var/run/clamav/clamd.ctl"
    clamav_host: str = ""  # set instead of clamav_socket to use TCP (e.g. a clamav-daemon container)
    clamav_port: int = 3310
    # If the AV daemon is unreachable, should uploads be rejected (fail closed,
    # safer) or allowed through with just extension/content-type checks
    # (fail open, more available)? Default fails closed in production.
    clamav_fail_open: bool = False
    field_encryption_key: str = ""

    @property
    def database_url(self) -> str:
        if self.environment == "production":
            if not self.database_url_prod:
                raise ValueError("ENVIRONMENT=production but DATABASE_URL_PROD is not set")
            return self.database_url_prod
        if self.environment == "staging":
            if not self.database_url_staging:
                raise ValueError("ENVIRONMENT=staging but DATABASE_URL_STAGING is not set")
            return self.database_url_staging
        return self.database_url_dev

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",") if h.strip()]

    def validate_production_safety(self) -> None:
        """Fail loudly at startup rather than silently running an insecure
        production deployment."""
        if self.environment != "production":
            return
        if self.secret_key == "change-me-in-prod" or len(self.secret_key) < 32:
            raise ValueError(
                "ENVIRONMENT=production but SECRET_KEY is missing/default/too short. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        if self.debug:
            raise ValueError("ENVIRONMENT=production but DEBUG=true — set DEBUG=false in production.")
        if not self.allowed_hosts:
            raise ValueError("ENVIRONMENT=production but ALLOWED_HOSTS is not set.")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
settings.validate_production_safety()
