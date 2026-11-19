"""Store an uploaded file and index it into the RAG vector store."""

import uuid
from pathlib import Path

from app.core.config import get_settings
from app.memory.database import create_or_update_conversation
from app.tools.rag import add_document_to_rag


class UnsupportedFileType(ValueError):
    pass


class FileTooLarge(ValueError):
    pass


class EmptyDocument(ValueError):
    pass


def safe_filename(filename: str | None) -> str:
    """Drop any directory part (blocks ../ path traversal) and spaces."""

    name = Path(filename or "").name.replace(" ", "_")
    return name or "uploaded_file"


def ingest_document(filename: str | None, data: bytes, thread_id: str) -> dict:
    """
    Validate, save and index one document for a conversation.

    Blocking (file IO + embedding calls): run it in a worker thread.
    Returns {"filename": str, "chunks": int}.
    """

    settings = get_settings()
    name = safe_filename(filename)
    suffix = Path(name).suffix.lower()

    if suffix not in settings.allowed_upload_extensions:
        allowed = ", ".join(ext.lstrip(".").upper() for ext in settings.allowed_upload_extensions)
        raise UnsupportedFileType(f"Unsupported file type '{suffix or name}'. Upload {allowed}.")

    if len(data) > settings.max_upload_bytes:
        raise FileTooLarge(f"File is larger than {settings.max_upload_mb} MB.")

    if not data:
        raise EmptyDocument("The file is empty.")

    file_path = settings.uploads_dir / f"{uuid.uuid4()}_{name}"
    file_path.write_bytes(data)

    try:
        result = add_document_to_rag(file_path=str(file_path), thread_id=thread_id)
    except ValueError as exc:
        file_path.unlink(missing_ok=True)
        raise EmptyDocument(str(exc)) from exc

    create_or_update_conversation(thread_id, "Uploaded document")

    return {"filename": name, "chunks": result["chunks"]}
