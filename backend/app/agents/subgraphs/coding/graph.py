"""Coding subgraph: coder <-> tools loop."""

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from app.agents.subgraphs.coding.state import CodingState
from app.tools.calculator import calculator
from app.tools.retrieval import search_uploaded_documents
from app.tools.search import web_search


CODING_PROMPT = """
You are ZacharyGPT's coding specialist.

- Write correct, runnable code with brief explanations.
- When debugging, find the root cause before proposing a fix.
- Use search_uploaded_documents when the user refers to uploaded code files.
- Use web_search for library docs, APIs, or versions that may have changed.
- Put code in fenced blocks with the language name.
"""

CODING_TOOLS = [search_uploaded_documents, web_search, calculator]


def build_coding_graph(llm: BaseChatModel):
    llm_with_tools = llm.bind_tools(CODING_TOOLS)

    def coder_node(state: CodingState):
        messages = [SystemMessage(content=CODING_PROMPT)] + state["messages"]
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}

    workflow = StateGraph(CodingState)

    workflow.add_node("coder", coder_node)
    workflow.add_node("tools", ToolNode(CODING_TOOLS))

    workflow.add_edge(START, "coder")
    workflow.add_conditional_edges("coder", tools_condition)
    workflow.add_edge("tools", "coder")

    # No checkpointer here: the parent graph's checkpointer covers subgraphs.
    return workflow.compile()
