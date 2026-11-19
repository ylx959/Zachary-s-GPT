from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000, description="The user's message.")
    thread_id: str = Field(
        default="default",
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Conversation id. A new id starts a new conversation.",
    )
    model: str | None = Field(
        default=None,
        description="Gemini model name. Unknown or missing values fall back to the default model.",
    )


# Server-sent events emitted by POST /api/chat/stream, one JSON object per `data:` line:
#   {"token": "..."}   a piece of the answer text
#   {"error": "..."}   the run failed; a {"done": true} event follows
#   {"done": true}     the stream is finished
