from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.chat import ChatRequest
from app.services.chat_stream import stream_chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post(
    "/stream",
    summary="Send a message and stream the answer as server-sent events",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": 'Events: {"token": str} … then {"done": true}; {"error": str} on failure.',
        }
    },
)
def chat_stream(body: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_chat(body.message, body.thread_id, body.model),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
