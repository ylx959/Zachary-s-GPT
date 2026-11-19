"""State for the coding subgraph."""

from langgraph.graph import MessagesState


class CodingState(MessagesState):
    """
    Shares `messages` with the main graph, so results flow back automatically.

    Add coding-only fields here later (e.g. language, files, test results).
    """
