import logging
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Path, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.schemas.documents import DocumentUploadResult
from app.services.documents import EmptyDocument, FileTooLarge, UnsupportedFileType, ingest_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["documents"])

ThreadId = Annotated[str, Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]


@router.post(
    "/{thread_id}/documents",
    response_model=DocumentUploadResult,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document so the agent can search it in this conversation",
    responses={
        413: {"description": "File too large"},
        415: {"description": "Unsupported file type"},
        422: {"description": "No text could be extracted"},
    },
)
async def upload_document(thread_id: ThreadId, file: Annotated[UploadFile, File()]) -> DocumentUploadResult:
    settings = get_settings()

    # Read one byte past the limit so oversized files are rejected without loading them whole.
    data = await file.read(settings.max_upload_bytes + 1)

    try:
        result = await run_in_threadpool(ingest_document, file.filename, data, thread_id)
    except UnsupportedFileType as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from exc
    except FileTooLarge as exc:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, str(exc)) from exc
    except EmptyDocument as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except Exception as exc:
        logger.exception("Indexing %s failed for thread %s", file.filename, thread_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Indexing failed. Check the server logs and try again.") from exc

    return DocumentUploadResult(
        filename=result["filename"],
        chunks=result["chunks"],
        message=f"Uploaded {result['filename']} and created {result['chunks']} chunks.",
    )
