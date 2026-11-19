"""
Central settings for the backend.

Every environment variable is read here, once. Paths are resolved relative to
the backend directory, so the app works no matter which directory it starts from.
"""

#read through all the .env

import os
from functools import lru_cache
from pathlib import Path

import certifi
from dotenv import load_dotenv
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]

# Load .env into os.environ so LangChain integrations (GOOGLE_API_KEY,
# TAVILY_API_KEY, LANGSMITH_*) can read their keys directly.
load_dotenv(BACKEND_DIR / ".env")

# Use certifi's CA bundle for outgoing HTTPS (fixes SSL errors on macOS Python builds).
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
    )

    # Models
    gemini_model: str = "gemini-3.1-flash-lite"
    allowed_models: tuple[str, ...] = (
        "gemini-3.1-flash-lite",
        "gemini-2.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
    )

    # CORS: comma-separated origins allowed to call the API (the Next.js frontend)
    frontend_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Storage (relative paths are resolved against the backend directory)
    data_dir: Path = Path("data")
    uploads_dir: Path = Path("uploads")
    chroma_dir: Path = Path("chroma_db")

    # Uploads
    max_upload_mb: int = 20
    allowed_upload_extensions: tuple[str, ...] = (".pdf", ".docx", ".txt", ".md", ".py", ".csv")

    # RAG reranking
    rerank_model: str = "ms-marco-MultiBERT-L-12"
    rerank_fetch_k: int = 20
    rerank_min_score: float = 0.0

    @field_validator("data_dir", "uploads_dir", "chroma_dir")
    @classmethod
    def _resolve_dir(cls, value: Path) -> Path:
        return value if value.is_absolute() else BACKEND_DIR / value

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def chat_db_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'chatbot_memory.db'}"

    @property
    def checkpoint_db_path(self) -> Path:
        return self.data_dir / "langgraph_checkpoints.sqlite"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def ensure_dirs(self) -> None:
        for directory in (self.data_dir, self.uploads_dir, self.chroma_dir):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings
