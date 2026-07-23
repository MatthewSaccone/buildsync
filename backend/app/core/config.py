from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "BuildSync"
    database_url: str = "sqlite:///./buildsync.db"
    secret_key: str = "change-me-in-prod"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    password_reset_token_expire_minutes: int = 30
    upload_dir: str = "app/static/uploads"
    max_upload_size_bytes: int = 15 * 1024 * 1024  # 15 MB
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()