"""Run one chat turn through the agent and turn it into server-sent events."""

import json
import logging
from collections.abc import Iterator

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage

from app.agents.graph import get_agent
from app.memory.database import create_or_update_conversation, save_chat_message

logger = logging.getLogger(__name__)


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


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


def stream_chat(message: str, thread_id: str, model: str | None) -> Iterator[str]:
    """
    Yield SSE events for one turn and persist the exchange.

    This is a sync generator on purpose: the agent and its SQLite checkpointer are
    synchronous, and Starlette iterates sync generators in a worker thread.
    """

    create_or_update_conversation(thread_id, message)
    save_chat_message(thread_id, "user", message)

    agent = get_agent(model)
    config = {"configurable": {"thread_id": thread_id}}
    inputs = {"messages": [HumanMessage(content=message)]}
    answer = ""

    try:
        for chunk, metadata in agent.stream(inputs, config=config, stream_mode="messages"):
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
        if answer.strip():
            save_chat_message(thread_id, "assistant", answer)

    yield sse({"done": True})
