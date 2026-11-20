# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech stack and layout

| Layer | Technology | Location |
|---|---|---|
| UI | TypeScript + React / Next.js 16 | `frontend/` |
| API | Python + FastAPI | `backend/app/main.py`, `backend/app/api/` |
| Agent | Python + LangGraph | `backend/app/agents/` |

- **This is a monorepo.** The Python project lives entirely in `backend/`, with its own `pyproject.toml`, `uv.lock`, `.venv`, `.env` and `Dockerfile`. The Next.js app lives in `frontend/`, with npm and its own `.env.local`. The repo root only holds `README.md`, this file, `.github/` and `.gitignore`.
- **Paths are relative to `backend/`.** All Python paths below (`app/...`, `tests/...`) are relative to `backend/`.
- **The frontend talks to the API cross-origin.** CORS origins come from `FRONTEND_ORIGINS` in `.env` (default `http://localhost:3000`).
- **Keep the agent in Python.** Don't move agent, tool or RAG logic into Next.js. The frontend only renders the UI and calls the API (see API below).

## Commands

The backend uses **uv**. There is no `requirements.txt`; dependencies live in `pyproject.toml` and `uv.lock`.

```bash
cd backend
uv sync                              # install deps into .venv
uv add <pkg> / uv remove <pkg>       # change deps (updates pyproject.toml + uv.lock)
uv run python -m app.main            # run the API (http://127.0.0.1:8080, docs at /docs, reload=True)
uv run pytest                        # API tests (fake agent + indexer, temp storage, no API calls)
uv run pytest tests/test_api.py::test_health   # a single test
uv run pytest -m integration         # real Gemini turn (needs a real GOOGLE_API_KEY)
uv run --group eval python -m evals.rag.run   # RAG eval: vector vs rerankers → evals/rag/results/ (real GOOGLE_API_KEY)
docker build -t zacharygpt . && docker run -p 8080:8080 --env-file .env zacharygpt   # from backend/
```

- **Run from `backend/` as a module (`-m`).** Imports are absolute (`from app.tools import ...`). Storage paths are resolved against `backend/` by `app/core/config.py`, not the cwd.
- **Tests isolate storage.** `tests/conftest.py` points `DATA_DIR`, `UPLOADS_DIR` and `CHROMA_DIR` at a temp dir before the app is imported. Keep that order when adding fixtures. No linter is configured.
- **Real API keys are needed.** Importing `app.tools.rag` creates the Gemini embeddings client and `app.tools.search` creates Tavily at import time. With `GOOGLE_API_KEY=dummy TAVILY_API_KEY=dummy` you can check that modules import, but nothing more.
- **All settings live in `app/core/config.py`** (`Settings`, read from `.env`): the model (`GEMINI_MODEL`, default `gemini-3.1-flash-lite`), `allowed_models`, CORS origins, storage dirs, upload limits and `RERANK_*`. It also loads `.env` into `os.environ` for the LangChain clients and sets the certifi CA bundle. Don't add `load_dotenv()` or `os.getenv` elsewhere.
- **Unknown models fall back silently.** `normalize_model_name` in `app/agents/graph.py` replaces any model not in `allowed_models` with the default. Keep the frontend's model options in sync with that list.

### Frontend (`frontend/`)

```bash
cd frontend
npm run dev          # http://localhost:3000 (backend must be on NEXT_PUBLIC_API_URL, default :8080)
npm test             # vitest (jsdom), no server needed
npx vitest run tests/features/chat/use-chat.test.ts -t "stop"   # a single test
npm run typecheck && npm run lint && npx next build
```

- **Read `frontend/AGENTS.md` first.** This is Next.js 16 / React 19 / Tailwind 4, so check `frontend/node_modules/next/dist/docs/` before using Next APIs from memory.
- **`features/chat/use-chat.ts` is the deep module.** Components under `features/chat/components/` only render props. All chat behaviour lives in `useChat`: streaming, abort, thread ids, history, uploads and localStorage. Add behaviour there, and test it through its interface in `tests/features/chat/use-chat.test.ts`.
- **`features/chat/use-sidebar.ts` owns the sidebar layout.** It handles drag-resize (220–480 px), snap-to-collapse, keyboard, ⌘B / Ctrl+B and localStorage. `chat-screen.tsx` only applies its width and spreads `handleProps` on the drag handle.
- **`features/chat/use-typewriter.ts` types answers out on screen.** Gemini streams in large chunks (~100 chars), so `MessageList` reveals the text gradually instead of pasting each chunk in. It types at about 80 chars/s and speeds up to clear any backlog in about 1.2 s. Answers loaded from history and reduced-motion users get the full text at once. Don't "fix" this by changing the backend stream: the backend is already token-level.
- **Tests live in `frontend/tests/`.** They mirror the source paths (`tests/lib/…`, `tests/features/chat/…`), import via `@/…`, and use `tests/setup.ts` (RTL cleanup).
- **The Next.js dev indicator is off** (`devIndicators: false` in `next.config.ts`).
- **`lib/api.ts` is the backend seam.** The `ChatApi` interface has two adapters: `httpChatApi`, and the in-memory fake in tests. Keep it in sync with the backend API table below. SSE parsing is in `lib/sse.ts`.
- **Design tokens live in `app/globals.css`.** They're CSS variables on `:root` with a dark-mode block, exposed to Tailwind via `@theme inline` (`bg-sidebar`, `text-muted`, `bg-user-bubble`, …). Use the tokens, not raw hex values. Global element styles go inside `@layer base`, or they beat Tailwind utilities.
- **Charts render in `features/chat/components/stock-chart.tsx`.** It is a hand-written SVG using the `--chart-*`, `--up` and `--down` tokens, with geometry helpers in `lib/chart.ts`. `useChat` appends `{chart}` events to the streaming assistant message's `charts`.
- **Keep the model list in sync.** `lib/models.ts` must match `allowed_models` in `backend/app/core/config.py`.

## Architecture

FastAPI streams answers over SSE from a LangGraph agent built in `app/agents/graph.py`.

### API layers

```
app/main.py            create_app(): lifespan (dirs + init_db), CORS, routers
app/api/router.py      mounts every route module under /api
app/api/routes/*.py    thin HTTP layer: validation, status codes, response models
app/schemas/*.py       Pydantic request/response models
app/services/*.py      logic: chat_stream.py (agent run → SSE), documents.py (save + index upload)
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness |
| GET | `/api/conversations` | Conversation list, newest first |
| GET | `/api/conversations/{thread_id}/messages` | Chat history `{"role","content","charts"}` (empty list for unknown ids) |
| PATCH | `/api/conversations/{thread_id}` | Rename: `{"title"}` (trimmed, 1–80 chars). 404 if unknown. Titles are only auto-set on creation, so renames stick. |
| POST | `/api/conversations/{thread_id}/documents` | Multipart `file` upload. 201, or 413/415/422/502 with `{"detail"}`. |
| POST | `/api/chat/stream` | `{"message","thread_id","model"}` → SSE `{"chart"}`/`{"token"}`… `{"done": true}` (`{"error"}` before done on failure) |

- **`/api/chat/stream` is a POST SSE endpoint.** Read it with `fetch` plus a stream reader, not `EventSource`.
- **`thread_id` format.** It must match `^[A-Za-z0-9_-]+$`; the UIs generate UUIDs.
- **Routes stay sync where the work is.** `stream_chat` is a sync generator because the agent and SqliteSaver are sync. Upload indexing runs via `run_in_threadpool`.

### Agent graph

```
START → router → chat     (chatbot ⇄ tools)                      → END
               → research (subgraph: researcher ⇄ tools)         → END
               → coding   (subgraph: coder ⇄ tools)              → END
```

- **`app/agents/state.py`:** `AgentState` = `MessagesState` plus `route`.
- **`app/agents/router.py`:** an LLM structured-output classifier over the last 6 messages. It falls back to `chat` on error.
- **`app/agents/graph.py`:** the main wiring. `get_agent()` caches one compiled graph per model.
- **Subgraphs** (`app/agents/subgraphs/<name>/`) each own their `state.py` and `graph.py`. They are compiled **without** a checkpointer, because the parent's SQLite checkpointer covers them. Each binds its own subset of tools.
- **Adding a branch:** add the route value to `Route` in `state.py`, describe it in `ROUTER_PROMPT`, add the node and the conditional-edge mapping in `graph.py`, then update the README diagram (see below).

### Streaming contract (`app/services/chat_stream.py` → `should_stream_chunk`)

The UI receives every AI token streamed with `stream_mode="messages"`, except tool messages and tool-call chunks.

- **Hide internal LLM calls.** Any LLM call that is not the final answer (like the router) must be tagged `nostream`, e.g. `.with_config(tags=["nostream"])`, or its output leaks into the chat.
- **Charts ride on tool artifacts.** A tool declared with `response_format="content_and_artifact"` returns `(text for the LLM, chart spec)`. `chart_from()` turns a `ToolMessage.artifact` whose `type` is in `CHART_TYPES` into an SSE `{"chart"}` event and saves it in `chat_messages.charts` (JSON). The spec's shape is `ChartSpec` in `frontend/lib/chart.ts`; keep it in sync with `app/tools/finance.py`. It works inside subgraphs too.
- **Trace metadata.** `run_config()` sets `run_name="chat_turn"`, `metadata.thread_id` (LangSmith threads) and a `model:` tag. Tracing itself is switched by `LANGSMITH_TRACING` in `.env`.
- **Subgraph metadata uses the parent node name.** Inside subgraphs, `metadata["langgraph_node"]` is the parent node name (`research`, `coding`), not `tools`. Filtering there relies on the ToolMessage and `tool_calls` checks.

### Tools (`app/tools/`)

- **One file per tool group:** `search.py`, `calculator.py`, `retrieval.py`, `memory.py`, `finance.py`. `__init__.py` assembles the `tools` list used by the chat branch.
- **Conversation ID comes from the run config.** Tools that need the conversation declare a `config: RunnableConfig` parameter (injected by LangChain, hidden from the model) and call `thread_id_from(config)` in `app/tools/context.py`. It reads `configurable.thread_id`, so concurrent requests stay isolated. Never reintroduce a global for this.
- **`finance.py` uses Alpha Vantage's free tier:** ~25 requests/day and ~1/second, cached 15 min in-process. `OVERVIEW` (fundamentals) is premium on this key, so only `TIME_SERIES_DAILY` (compact, ~100 days) is used. Its tests fake `_fetch`.
- **`rag.py` is the RAG engine, not a tool.** It reads PDF/DOCX/TXT/MD/PY/CSV and chunks it (900/150) into Chroma (`chroma_db/`), filtered by `thread_id`. `retrieve_docs(..., use_rerank=)` returns Documents (traced as a retriever run). Retrieval is two-stage: Chroma returns `RERANK_FETCH_K` (20) candidates, then a local FlashRank cross-encoder (`ms-marco-MultiBERT-L-12`, cached in `~/.cache/flashrank`) reranks them to top k. On reranker failure it falls back to vector order. Tunable via the `RERANK_*` env vars.

### Persistence (two separate SQLite stores in `data/`)

- **`langgraph_checkpoints.sqlite`:** the LangGraph checkpointer, holding the graph state per `thread_id`.
- **`chatbot_memory.db`:** a SQLAlchemy store (`app/memory/database.py`) holding the conversation list and plain chat history for the UI sidebar, plus long-term memories for `remember_this` / `recall_memory`.

### Evals (`backend/evals/<name>/`)

- One folder per eval (`evals/rag/` today). Each has its own data, `run.py`, `results/` (committed) and a gitignored `.cache/`.
- `evals/rag/run.py` points `CHROMA_DIR` / `DATA_DIR` / `UPLOADS_DIR` at its `.cache/` before importing `app`, so it never touches the app's stores. It reuses `add_document_to_rag` and the same reranking as `retrieve_docs`.
- Result: on its corpus, the default `ms-marco-MultiBERT-L-12` reranker scores *below* plain vector search (see README). Re-run the eval before changing `RERANK_*` defaults.

`data/`, `chroma_db/` and `uploads/` are runtime data and change whenever the app or tests run. `backend/data/` and `backend/chroma_db/` are gitignored.

## Rules

- **Keep the README graph diagram in sync.** After any change to the graph structure (nodes, edges, routes, subgraphs, or which tools a branch binds), update the "Agent Graph" diagram and the tools-per-branch list in `README.md`. Check against `get_agent().get_graph(xray=1).draw_mermaid()`. The diagram is ASCII art inside a ```` ```bash ```` block, so keep that format.
- **Keep the README project structure in sync** when files move.
- **A stale dev server can miss new folders.** If a `next dev` started before a new source folder was added, Tailwind may not pick up classes from it. Restart `npm run dev`, or verify with `npx next build`.
- **Don't commit.** The user commits themselves.
- **Leave AWS deployment alone.** `.github/workflows/cicd.yaml` (manual `workflow_dispatch` only) and its README section are unused: the user won't set up AWS. Don't re-enable the push trigger.
