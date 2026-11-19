"""Shared state for the main graph."""

from typing import Literal

from langgraph.graph import MessagesState


# Which branch handles the current turn.
Route = Literal["chat", "research", "coding"]


class AgentState(MessagesState):
    """
    Main graph state.

    - messages: full conversation (inherited, persisted by the checkpointer)
    - route: decided by the router for the latest user message
    """

    route: Route
