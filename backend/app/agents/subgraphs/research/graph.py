"""Research subgraph: researcher <-> tools loop."""

from langchain_core.language_models import BaseChatModel
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from app.agents.subgraphs.research.nodes import RESEARCH_TOOLS, make_researcher_node
from app.agents.subgraphs.research.state import ResearchState


def build_research_graph(llm: BaseChatModel):
    workflow = StateGraph(ResearchState)

    workflow.add_node("researcher", make_researcher_node(llm))
    workflow.add_node("tools", ToolNode(RESEARCH_TOOLS))

    workflow.add_edge(START, "researcher")
    workflow.add_conditional_edges("researcher", tools_condition)
    workflow.add_edge("tools", "researcher")

    # No checkpointer here: the parent graph's checkpointer covers subgraphs.
    return workflow.compile()
