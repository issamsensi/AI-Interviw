from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/ai_interview"
    # Supabase Auth: project URL (e.g. https://xyz.supabase.co). User JWTs
    # are verified against the project's JWKS; no service-role key is used.
    supabase_url: str = ""
    # Guest (no-account) trial limits. Signed-in users are not clamped.
    guest_max_questions: int = 5
    guest_max_duration_minutes: int = 10
    redis_url: str = "redis://localhost:6379/0"
    elevenlabs_api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    max_resume_size_bytes: int = 5 * 1024 * 1024
    max_resume_text_chars: int = 50000
    max_job_description_chars: int = 12000
    database_startup_retries: int = 10
    database_startup_retry_seconds: float = 2.0
    # Meta AI text generation (Meta Model API, key sent in request header).
    # Base URL and paths are configurable because the exact endpoint
    # layout must be confirmed against credentialed official docs.
    meta_api_key: str = ""
    meta_api_base: str = "https://api.meta.ai/v1"
    meta_chat_path: str = "/chat/completions"
    meta_model_dev: str = "muse-spark-1.3"
    meta_model_prod: str = "muse-spark-1.3"
    meta_env: str = "dev"
    # Reasoning models can take a while to generate plans/evaluations;
    # the frontend allows 120s, so 60s leaves headroom without hanging.
    meta_request_timeout_seconds: float = 60.0
    # Meta Muse Voice Transcribe. Only the buffered batch endpoint is
    # used; realtime streaming is not claimed (see services/stt.py).
    meta_stt_model: str = "muse-voice-transcribe-1.0"
    meta_stt_url: str = ""
    meta_stt_max_bytes: int = 10 * 1024 * 1024

    # extra="ignore" keeps stale entries (e.g. legacy provider keys in an
    # existing .env) from crashing the app after provider migrations.
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def supabase_issuer(self) -> str:
        return self.supabase_url.rstrip("/") + "/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return self.supabase_issuer + "/.well-known/jwks.json"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def meta_model(self) -> str:
        if self.meta_env.strip().lower() == "prod":
            return self.meta_model_prod
        return self.meta_model_dev

    @property
    def meta_chat_url(self) -> str:
        return self.meta_api_base.rstrip("/") + "/" + self.meta_chat_path.lstrip("/")

    @property
    def meta_stt_endpoint(self) -> str:
        if self.meta_stt_url.strip():
            return self.meta_stt_url.strip()
        return self.meta_api_base.rstrip("/") + "/asr/transcribe"

    @property
    def tts_enabled(self) -> bool:
        return bool(self.elevenlabs_api_key.strip())


settings = Settings()
