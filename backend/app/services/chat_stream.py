"""Run one chat turn through the agent and turn it into server-sent events."""

import json
import logging
from collections.abc import Iterator

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage

from app.agents.graph import get_agent, normalize_model_name
from app.memory.database import create_or_update_conversation, save_chat_message

logger = logging.getLogger(__name__)


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


CHART_TYPES = {"price", "compare"}


def chart_from(chunk) -> dict | None:
    """The chart spec a tool attached to its ToolMessage (content_and_artifact), if any."""
    if not isinstance(chunk, ToolMessage):
        return None
    artifact = getattr(chunk, "artifact", None)
    if isinstance(artifact, dict) and artifact.get("type") in CHART_TYPES:
        return artifact
    return None


def should_stream_chunk(chunk, metadata: dict | None) -> bool:
    """
    Only stream normal AI answer text to the UI.

    Skipped: tool messages, chunks from tool nodes, and tool-call chunks
    (raw tool/search/RAG output must not appear in the chat).
    Router output is already excluded by its "nostream" tag.
    """

    node_name = str((metadata or {}).get("langgraph_node", "")).lower()

    if "tool" in node_name:
        return False

    if isinstance(chunk, ToolMessage):
        return False

    if not isinstance(chunk, (AIMessage, AIMessageChunk)):
        return False

    if getattr(chunk, "tool_calls", None) or getattr(chunk, "invalid_tool_calls", None):
        return False

    if (getattr(chunk, "additional_kwargs", None) or {}).get("tool_calls"):
        return False

    return True


def extract_text(chunk) -> str:
    """Gemini returns either a string or a list of content parts; keep only the text."""

    content = getattr(chunk, "content", "")

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts = []

        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text", item.get("content"))
                if isinstance(text, str):
                    parts.append(text)

        return "".join(parts)

    return ""


def run_config(thread_id: str, model: str | None) -> dict:
    """
    Config for one agent run.

    run_name, tags and metadata only matter when LangSmith tracing is on:
    metadata["thread_id"] groups the turns of a conversation into one LangSmith
    thread, and the model tag lets you filter traces by model.
    """
    model_name = normalize_model_name(model)
    return {
        "configurable": {"thread_id": thread_id},
        "run_name": "chat_turn",
        "tags": ["chat", f"model:{model_name}"],
        "metadata": {"thread_id": thread_id, "model": model_name},
    }


def stream_chat(message: str, thread_id: str, model: str | None) -> Iterator[str]:
    """
    Yield SSE events for one turn and persist the exchange.

    This is a sync generator on purpose: the agent and its SQLite checkpointer are
    synchronous, and Starlette iterates sync generators in a worker thread.
    """

    create_or_update_conversation(thread_id, message)
    save_chat_message(thread_id, "user", message)

    agent = get_agent(model)
    config = run_config(thread_id, model)
    inputs = {"messages": [HumanMessage(content=message)]}
    answer = ""
    charts: list[dict] = []

    try:
        for chunk, metadata in agent.stream(inputs, config=config, stream_mode="messages"):
            # Tool charts go to the UI as their own event (the tool's text stays hidden).
            chart = chart_from(chunk)
            if chart is not None:
                charts.append(chart)
                yield sse({"chart": chart})
                continue

            if not should_stream_chunk(chunk, metadata):
                continue

            token = extract_text(chunk)

            if token:
                answer += token
                yield sse({"token": token})

    except Exception:
        logger.exception("Chat run failed for thread %s", thread_id)
        yield sse({"error": "The assistant failed to answer. Check the server logs and try again."})

    finally:
        if answer.strip() or charts:
            save_chat_message(thread_id, "assistant", answer, charts)

    yield sse({"done": True})
