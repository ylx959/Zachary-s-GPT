"""API tests. The agent and the RAG indexer are faked, so no model or network calls are made."""

import json
import uuid

import pytest
from langchain_core.messages import AIMessageChunk, ToolMessage

from app.core.config import get_settings


def new_thread() -> str:
    return f"test-{uuid.uuid4().hex[:12]}"


def parse_sse(body: str) -> list[dict]:
    return [json.loads(line[len("data: "):]) for line in body.splitlines() if line.startswith("data: ")]


class FakeAgent:
    """Mimics agent.stream(..., stream_mode="messages") with answer, tool and tool-call chunks."""

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.config = None

    def stream(self, inputs, config, stream_mode):
        self.config = config
        yield AIMessageChunk(content="", tool_calls=[{"name": "calculator", "args": {}, "id": "1"}]), {"langgraph_node": "chatbot"}
        yield ToolMessage(content="raw tool output", tool_call_id="1"), {"langgraph_node": "tools"}
        yield AIMessageChunk(content="6 * 7 "), {"langgraph_node": "chatbot"}
        yield AIMessageChunk(content=[{"type": "text", "text": "= 42"}]), {"langgraph_node": "chatbot"}
        if self.fail:
            raise RuntimeError("model exploded")


@pytest.fixture
def fake_agent(monkeypatch):
    agent = FakeAgent()
    monkeypatch.setattr("app.services.chat_stream.get_agent", lambda model=None: agent)
    return agent


@pytest.fixture
def fake_indexer(monkeypatch):
    calls = []

    def fake_add(file_path: str, thread_id: str):
        calls.append({"file_path": file_path, "thread_id": thread_id})
        return {"filename": file_path, "chunks": 3}

    monkeypatch.setattr("app.services.documents.add_document_to_rag", fake_add)
    return calls


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_chat_streams_only_answer_text_and_persists(client, fake_agent):
    thread = new_thread()

    response = client.post("/api/chat/stream", json={"message": "what is 6*7", "thread_id": thread})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    assert events == [{"token": "6 * 7 "}, {"token": "= 42"}, {"done": True}]
    assert fake_agent.config["configurable"] == {"thread_id": thread}
    # LangSmith: turns of one conversation group into one thread; a missing model falls back to the default.
    assert fake_agent.config["metadata"] == {"thread_id": thread, "model": get_settings().gemini_model}

    messages = client.get(f"/api/conversations/{thread}/messages").json()["messages"]
    assert messages == [
        {"role": "user", "content": "what is 6*7", "charts": []},
        {"role": "assistant", "content": "6 * 7 = 42", "charts": []},
    ]

    threads = [c["thread_id"] for c in client.get("/api/conversations").json()["conversations"]]
    assert thread in threads


def test_chat_reports_errors_and_keeps_partial_answer(client, monkeypatch):
    monkeypatch.setattr("app.services.chat_stream.get_agent", lambda model=None: FakeAgent(fail=True))
    thread = new_thread()

    events = parse_sse(client.post("/api/chat/stream", json={"message": "hi", "thread_id": thread}).text)

    assert "error" in events[-2]
    assert "exploded" not in events[-2]["error"]  # internal details stay in the server log
    assert events[-1] == {"done": True}
    assert client.get(f"/api/conversations/{thread}/messages").json()["messages"][-1]["content"] == "6 * 7 = 42"


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "", "thread_id": "abc"},
        {"message": "hi", "thread_id": "../etc"},
        {"thread_id": "abc"},
    ],
)
def test_chat_rejects_invalid_requests(client, fake_agent, payload):
    assert client.post("/api/chat/stream", json=payload).status_code == 422


def test_unknown_conversation_has_no_messages(client):
    assert client.get(f"/api/conversations/{new_thread()}/messages").json() == {"messages": []}


def test_upload_indexes_document(client, fake_indexer):
    thread = new_thread()

    response = client.post(
        f"/api/conversations/{thread}/documents",
        files={"file": ("my notes.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 201
    assert response.json() == {
        "filename": "my_notes.txt",
        "chunks": 3,
        "message": "Uploaded my_notes.txt and created 3 chunks.",
    }
    assert fake_indexer[0]["thread_id"] == thread


def test_upload_cannot_escape_uploads_dir(client, fake_indexer):
    response = client.post(
        f"/api/conversations/{new_thread()}/documents",
        files={"file": ("../../evil.txt", b"x", "text/plain")},
    )

    assert response.status_code == 201
    saved = fake_indexer[0]["file_path"]
    assert saved.startswith(str(get_settings().uploads_dir))
    assert ".." not in saved


@pytest.mark.parametrize(
    ("filename", "content", "status"),
    [
        ("malware.exe", b"x", 415),
        ("empty.txt", b"", 422),
        ("big.txt", b"x" * (1024 * 1024 + 1), 413),
    ],
)
def test_upload_rejects_bad_files(client, fake_indexer, filename, content, status):
    response = client.post(
        f"/api/conversations/{new_thread()}/documents",
        files={"file": (filename, content, "application/octet-stream")},
    )

    assert response.status_code == status
    assert response.json()["detail"]
    assert fake_indexer == []


def test_rename_conversation(client, fake_agent):
    thread = new_thread()
    client.post("/api/chat/stream", json={"message": "first message", "thread_id": thread})

    response = client.patch(f"/api/conversations/{thread}", json={"title": "  Lighthouse notes  "})

    assert response.status_code == 200
    assert response.json()["title"] == "Lighthouse notes"
    titles = {c["thread_id"]: c["title"] for c in client.get("/api/conversations").json()["conversations"]}
    assert titles[thread] == "Lighthouse notes"

    # Later messages must not overwrite the custom title.
    client.post("/api/chat/stream", json={"message": "another one", "thread_id": thread})
    titles = {c["thread_id"]: c["title"] for c in client.get("/api/conversations").json()["conversations"]}
    assert titles[thread] == "Lighthouse notes"


def test_rename_unknown_conversation_is_404(client):
    assert client.patch(f"/api/conversations/{new_thread()}", json={"title": "x"}).status_code == 404


@pytest.mark.parametrize("title", ["", "   ", "x" * 81])
def test_rename_rejects_bad_titles(client, fake_agent, title):
    thread = new_thread()
    client.post("/api/chat/stream", json={"message": "hi", "thread_id": thread})

    assert client.patch(f"/api/conversations/{thread}", json={"title": title}).status_code == 422


CHART = {"type": "price", "title": "AAPL", "dates": ["2026-01-02"], "series": []}


class ChartAgent:
    """A tool returns a chart artifact (as analyze_stock does), then the model answers."""

    def stream(self, inputs, config, stream_mode):
        yield ToolMessage(content="text for the model only", tool_call_id="1", artifact=CHART), {"langgraph_node": "research"}
        yield AIMessageChunk(content="AAPL is up."), {"langgraph_node": "research"}


def test_tool_chart_is_streamed_and_saved_with_the_answer(client, monkeypatch):
    monkeypatch.setattr("app.services.chat_stream.get_agent", lambda model=None: ChartAgent())
    thread = new_thread()

    events = parse_sse(client.post("/api/chat/stream", json={"message": "how is AAPL", "thread_id": thread}).text)

    assert events == [{"chart": CHART}, {"token": "AAPL is up."}, {"done": True}]
    saved = client.get(f"/api/conversations/{thread}/messages").json()["messages"][-1]
    assert saved == {"role": "assistant", "content": "AAPL is up.", "charts": [CHART]}
