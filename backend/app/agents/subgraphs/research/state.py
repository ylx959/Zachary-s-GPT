"""State for the research subgraph."""

from langgraph.graph import MessagesState


class ResearchState(MessagesState):
    """
    Shares `messages` with the main graph, so results flow back automatically.

    Add research-only fields here later (e.g. sources, plan, draft).
    """
