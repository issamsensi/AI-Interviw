from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/ai_interview"
    redis_url: str = "redis://localhost:6379/0"
    groq_api_key: str = ""
    elevenlabs_api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    max_resume_size_bytes: int = 5 * 1024 * 1024
    max_resume_text_chars: int = 50000
    max_job_description_chars: int = 12000
    database_startup_retries: int = 10
    database_startup_retry_seconds: float = 2.0

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
