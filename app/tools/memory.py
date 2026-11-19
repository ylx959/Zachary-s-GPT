from langchain_core.tools import tool

from app.memory.database import save_memory, search_memory
from app.tools.context import get_current_thread_id


@tool
def remember_this(memory: str) -> str:
    """
    Save an important user preference or fact into long-term memory.
    Use this when the user asks you to remember something.
    """

    return save_memory(
        thread_id=get_current_thread_id(),
        memory=memory
    )


@tool
def recall_memory(query: str) -> str:
    """
    Recall saved long-term memories about the user or this conversation.
    """

    return search_memory(
        thread_id=get_current_thread_id(),
        query=query
    )
