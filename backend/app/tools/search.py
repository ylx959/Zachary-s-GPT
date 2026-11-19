import app.core.config  # noqa: F401  (loads .env so Tavily finds TAVILY_API_KEY)
from langchain_tavily import TavilySearch


web_search = TavilySearch(
    max_results=5,
    topic="general",
    search_depth="advanced"
)
