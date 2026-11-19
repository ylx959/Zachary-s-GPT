from app.tools.calculator import calculator
from app.tools.context import set_current_thread_id
from app.tools.memory import recall_memory, remember_this
from app.tools.retrieval import search_uploaded_documents
from app.tools.search import web_search


tools = [
    calculator,
    search_uploaded_documents,
    remember_this,
    recall_memory,
    web_search
]

__all__ = ["tools", "set_current_thread_id"]
