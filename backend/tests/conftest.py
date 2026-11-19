"""
Test setup: point all storage at a throwaway directory BEFORE the app is imported,
so tests never touch backend/data, backend/uploads or backend/chroma_db.
"""

import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv

_TMP = Path(tempfile.mkdtemp(prefix="zgpt-tests-"))
os.environ["DATA_DIR"] = str(_TMP / "data")
os.environ["UPLOADS_DIR"] = str(_TMP / "uploads")
os.environ["CHROMA_DIR"] = str(_TMP / "chroma_db")
os.environ["MAX_UPLOAD_MB"] = "1"

# Real keys from backend/.env when present (needed by integration tests);
# otherwise placeholders, enough for clients that are only constructed at import.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
os.environ.setdefault("GOOGLE_API_KEY", "test-key")
os.environ.setdefault("TAVILY_API_KEY", "test-key")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
