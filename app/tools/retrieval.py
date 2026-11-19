from langchain_core.tools import tool

from app.tools.context import get_current_thread_id
from app.tools.rag import retrieve_from_rag


@tool
def search_uploaded_documents(query: str) -> str:
    """
    Search uploaded documents for relevant information.
    Use this when the user asks about uploaded PDFs, DOCX, TXT, notes, files, or documents.
    """

    return retrieve_from_rag(
        query=query,
        thread_id=get_current_thread_id()
    )
