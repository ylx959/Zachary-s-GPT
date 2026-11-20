from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    thread_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationList(BaseModel):
    conversations: list[ConversationOut]


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: Literal["user", "assistant"]
    content: str
    # Chart specs from tools (see app/tools/finance.py); empty for most messages.
    charts: list[dict[str, Any]] = []


class MessageList(BaseModel):
    messages: list[MessageOut]


class ConversationRename(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
