from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "BuildSync"
    environment: str = "development"  # "development" or "production"
    database_url_dev: str = "sqlite:///./buildsync.db"
    database_url_prod: str = ""
    secret_key: str = "change-me-in-prod"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    password_reset_token_expire_minutes: int = 30
    upload_dir: str = "app/static/uploads"
    max_upload_size_bytes: int = 15 * 1024 * 1024
    cors_origins: str = "http://localhost:3000"
    debug: bool = True

    @property
    def database_url(self) -> str:
        if self.environment == "production":
            if not self.database_url_prod:
                raise ValueError("ENVIRONMENT=production but DATABASE_URL_PROD is not set")
            return self.database_url_prod
        return self.database_url_dev

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
