"""Task routing: decide which branch should handle the latest user message."""

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agents.state import AgentState, Route


ROUTER_PROMPT = """
You are a router. Read the recent conversation and pick ONE route for the latest user message.

- research: needs gathering and synthesising information from several sources
  (in-depth web research, comparing sources, summarising or analysing uploaded documents).
- coding: writing, explaining, reviewing, or debugging code.
- chat: everything else (small talk, simple questions, quick facts, math,
  remembering or recalling user info).

When unsure, choose chat.
"""

# How many recent messages the router looks at (for follow-up questions).
ROUTER_HISTORY = 6


class RouteDecision(BaseModel):
    route: Route = Field(description="Which branch should handle the latest user message.")


def _message_text(message) -> str:
    content = message.content

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        return "".join(
            part if isinstance(part, str) else str(part.get("text", ""))
            for part in content
        )

    return ""


def _recent_transcript(state: AgentState) -> str:
    lines = []

    for message in state["messages"][-ROUTER_HISTORY:]:
        if isinstance(message, HumanMessage):
            role = "User"
        elif isinstance(message, AIMessage):
            role = "Assistant"
        else:
            continue  # skip tool messages

        text = _message_text(message).strip()
        if text:
            lines.append(f"{role}: {text}")

    return "\n".join(lines)


def make_router_node(llm: BaseChatModel):
    # "nostream" keeps the router's output out of the chat token stream.
    classifier = llm.with_structured_output(RouteDecision).with_config(
        tags=["nostream"],
        run_name="router",
    )

    def router_node(state: AgentState):
        try:
            decision = classifier.invoke([
                SystemMessage(content=ROUTER_PROMPT),
                HumanMessage(content=_recent_transcript(state)),
            ])
            route = decision.route
        except Exception as e:
            print(f"[router] failed, falling back to chat: {e}")
            route = "chat"

        return {"route": route}

    return router_node


def route_after_router(state: AgentState) -> Route:
    return state.get("route", "chat")
