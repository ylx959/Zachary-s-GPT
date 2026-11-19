from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status

from app.memory.database import get_chat_history, list_conversations, rename_conversation
from app.schemas.conversations import ConversationList, ConversationOut, ConversationRename, MessageList

router = APIRouter(prefix="/conversations", tags=["conversations"])

ThreadId = Annotated[str, Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]


@router.get("", response_model=ConversationList, summary="List conversations, newest first")
def get_conversations() -> ConversationList:
    return ConversationList(conversations=list_conversations())


@router.get(
    "/{thread_id}/messages",
    response_model=MessageList,
    summary="Get a conversation's messages, oldest first",
)
def get_messages(thread_id: ThreadId) -> MessageList:
    # An unknown thread simply has no messages yet (the UI creates ids client-side).
    return MessageList(messages=get_chat_history(thread_id))


@router.patch(
    "/{thread_id}",
    response_model=ConversationOut,
    summary="Rename a conversation",
    responses={404: {"description": "No conversation with this id"}},
)
def update_conversation(thread_id: ThreadId, body: ConversationRename) -> ConversationOut:
    conversation = rename_conversation(thread_id, body.title)

    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")

    return ConversationOut.model_validate(conversation)
