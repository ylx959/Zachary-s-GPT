from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from app.tools.context import thread_id_from
from app.tools.rag import retrieve_from_rag


@tool
def search_uploaded_documents(query: str, config: RunnableConfig) -> str:
    """
    Search uploaded documents for relevant information.
    Use this when the user asks about uploaded PDFs, DOCX, TXT, notes, files, or documents.
    """

    return retrieve_from_rag(
        query=query,
        thread_id=thread_id_from(config)
    )
