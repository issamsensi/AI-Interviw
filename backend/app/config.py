from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/ai_interview"
    redis_url: str = "redis://localhost:6379/0"
    groq_api_key: str = ""
    elevenlabs_api_key: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
