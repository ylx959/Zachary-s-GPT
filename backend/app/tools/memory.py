from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from app.memory.database import save_memory, search_memory
from app.tools.context import thread_id_from


@tool
def remember_this(memory: str, config: RunnableConfig) -> str:
    """
    Save an important user preference or fact into long-term memory.
    Use this when the user asks you to remember something.
    """

    return save_memory(
        thread_id=thread_id_from(config),
        memory=memory
    )


@tool
def recall_memory(query: str, config: RunnableConfig) -> str:
    """
    Recall saved long-term memories about the user or this conversation.
    """

    return search_memory(
        thread_id=thread_id_from(config),
        query=query
    )
