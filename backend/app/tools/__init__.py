from app.tools.calculator import calculator
from app.tools.finance import analyze_stock, compare_stocks
from app.tools.memory import recall_memory, remember_this
from app.tools.retrieval import search_uploaded_documents
from app.tools.search import web_search


tools = [
    calculator,
    search_uploaded_documents,
    remember_this,
    recall_memory,
    web_search,
    analyze_stock,
    compare_stocks,
]

__all__ = ["tools"]
