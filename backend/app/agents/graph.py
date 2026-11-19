import sqlite3

from app.core.config import get_settings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.sqlite import SqliteSaver
from app.tools import tools
from app.agents.state import AgentState
from app.agents.router import make_router_node, route_after_router
from app.agents.subgraphs.research.graph import build_research_graph
from app.agents.subgraphs.coding.graph import build_coding_graph

settings = get_settings()

# Default model and the models the frontend may pick (configured in app/core/config.py / .env)
DEFAULT_MODEL = settings.gemini_model
ALLOWED_MODELS = set(settings.allowed_models)



SYSTEM_PROMPT = """
You are a helpful Agentic AI assistant named ZacharyGPT similar to ChatGPT.

You can:
1. Answer normal questions.
2. Use tools when needed.
3. Search uploaded documents using the RAG tool.
4. Search the web for latest/current information using Tavily Search.
5. Remember important user information using the memory tool.
6. Recall memory when useful.
7. Use calculator for math.

Rules:
- If the user asks about latest news, current events, recent updates, today's information, current prices, current people, current versions, new releases, or anything time-sensitive, use Tavily Search.
- If the user asks about an uploaded document, use search_uploaded_documents.
- If the user asks you to remember something, use remember_this.
- If the user asks about previous preferences or saved facts, use recall_memory.
- Use calculator for math questions.
- When using web search, summarize clearly and mention that the answer is based on web search results.
- Be clear, helpful, and concise.
"""



def normalize_model_name(model_name: str | None) -> str:
    """
    Validate selected model from frontend.
    If model is missing or not allowed, fallback to DEFAULT_MODEL.
    """

    if not model_name:
        return DEFAULT_MODEL

    model_name = model_name.strip()

    if model_name not in ALLOWED_MODELS:
        return DEFAULT_MODEL

    return model_name




def build_agent(model_name: str):
    """
    Build the main graph for a selected Gemini model.

        START -> router -> chat     (chatbot <-> tools loop) -> END
                        -> research (subgraph)               -> END
                        -> coding   (subgraph)               -> END
    """

    selected_model = normalize_model_name(model_name)

    # Initialize ChatGoogleGenerativeAI
    llm = ChatGoogleGenerativeAI(
        model=selected_model,
        temperature=0.3,
        streaming=True
    )

    llm_with_tools = llm.bind_tools(tools)

    def chatbot_node(state: AgentState):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]

        response = llm_with_tools.invoke(messages)

        return {
            "messages": [response]
        }

    tool_node = ToolNode(tools)

    workflow = StateGraph(AgentState)

    workflow.add_node("router", make_router_node(llm))
    workflow.add_node("chatbot", chatbot_node)
    workflow.add_node("tools", tool_node)
    workflow.add_node("research", build_research_graph(llm))
    workflow.add_node("coding", build_coding_graph(llm))

    workflow.add_edge(START, "router")
    workflow.add_conditional_edges(
        "router",
        route_after_router,
        {"chat": "chatbot", "research": "research", "coding": "coding"}
    )

    workflow.add_conditional_edges("chatbot", tools_condition)
    workflow.add_edge("tools", "chatbot")

    workflow.add_edge("research", END)
    workflow.add_edge("coding", END)

    conn = sqlite3.connect(
        settings.checkpoint_db_path,
        check_same_thread=False
    )

    checkpointer = SqliteSaver(conn)

    return workflow.compile(checkpointer=checkpointer)


_AGENT_CACHE = {}


def get_agent(model_name: str | None = None):
    """
    Return cached LangGraph agent for selected model.
    If not created yet, create it once and reuse it.
    """

    selected_model = normalize_model_name(model_name)

    if selected_model not in _AGENT_CACHE:
        _AGENT_CACHE[selected_model] = build_agent(selected_model)

    return _AGENT_CACHE[selected_model]