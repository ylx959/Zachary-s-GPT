# ZacharyGPT

ZacharyGPT is an open-source **agentic AI chatbot** built with **Python, FastAPI, LangGraph, LangChain, Google Gemini, Tavily, ChromaDB, and SQLite**.

It supports real-time streaming chat, document uploads, retrieval-augmented generation (RAG), web search, conversation memory, and a simple web UI.

### Tech stack

| Layer | Technology | Location |
|---|---|---|
| UI | TypeScript + React / Next.js | `frontend/` |
| API | Python + FastAPI | `backend/app/main.py` |
| Agent | Python + LangGraph | `backend/app/agents/` |

---

## Highlights

* Chat with an AI agent powered by Google Gemini
* Stream responses in real time
* Upload documents such as PDF, DOCX, TXT, MD, PY, and CSV
* Use uploaded files as context through RAG
* Search the web with Tavily for current information
* Store and recall conversation history
* Simple FastAPI-based web interface
* Docker-ready deployment
* AWS CI/CD support using GitHub Actions, ECR, and EC2

---

## Project Overview

This project combines:

* **FastAPI** for the backend server and API endpoints
* **Next.js + React + TypeScript** for the frontend UI
* **LangGraph** for agent orchestration
* **LangChain** for tools, messages, and RAG workflow
* **Google Gemini** as the LLM provider
* **Tavily** for web search
* **ChromaDB** for vector search over uploaded documents
* **SQLite** for conversation and persistence
* **Docker** for containerized deployment

---

## Agent Graph

Every user message goes through the router first, which sends it to one of three branches.
Each branch is an LLM ⇄ tools loop: the LLM keeps calling tools until it has enough to answer, then the turn ends.

```bash
                                 __start__
                                     │
                                     ▼
                              ┌─────────────┐
                              │   router    │   LLM picks: chat / research / coding
                              └──────┬──────┘
               ┌─────────────────────┼─────────────────────┐
             chat                 research               coding
               │                     │                     │
               ▼                     ▼                     ▼
     ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
     │     chatbot      │  │ research subgraph│  │ coding subgraph  │
     │        ⇅         │  │                  │  │                  │
     │      tools       │  │    researcher    │  │      coder       │
     │                  │  │        ⇅         │  │        ⇅         │
     │                  │  │      tools       │  │      tools       │
     └─────────┬────────┘  └─────────┬────────┘  └─────────┬────────┘
               └─────────────────────┼─────────────────────┘
                                     ▼
                                  __end__

# Tools available in each branch
#   chat     : calculator, search_uploaded_documents, remember_this, recall_memory, web_search
#   research : web_search, search_uploaded_documents
#   coding   : search_uploaded_documents, web_search, calculator
```

| Part | File |
|---|---|
| Main graph (wiring) | `backend/app/agents/graph.py` |
| Shared state (`messages`, `route`) | `backend/app/agents/state.py` |
| Router | `backend/app/agents/router.py` |
| Research subgraph | `backend/app/agents/subgraphs/research/` |
| Coding subgraph | `backend/app/agents/subgraphs/coding/` |
| Tools | `backend/app/tools/` |

---

## Built With

Make sure you have the following installed:

* Python 3.11
* [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh` or `brew install uv`)
* Git
* Google API key for Gemini
* Tavily API key for web search

Optional for deployment:

* Docker
* AWS account
* Amazon ECR repository
* EC2 instance
* GitHub Actions self-hosted runner

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/<your-github-username>/ZacharyGPT.git
```

### 2. Navigate to the backend directory

```bash
cd ZacharyGPT/backend
```

### 3. Install dependencies

uv creates the virtual environment (`.venv`) and installs the locked dependencies from `uv.lock`:

```bash
uv sync
```

To add or remove a package later:

```bash
uv add <package>
uv remove <package>
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory.

```env
GOOGLE_API_KEY=your_google_api_key
GEMINI_MODEL=gemini-3.1-flash-lite

TAVILY_API_KEY=your_tavily_api_key

LANGSMITH_TRACING=false
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_PROJECT=zacharygpt

# Origins allowed to call the API (the Next.js frontend), comma-separated
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

If you do not want to use LangSmith tracing, keep:

```env
LANGSMITH_TRACING=false
```

---

## Run Locally

Start the FastAPI backend (from `backend/`):

```bash
cd backend
uv run python -m app.main
```

In a second terminal, start the Next.js frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The API runs at `http://127.0.0.1:8080` (interactive docs at `/docs`).

---

## API

Interactive docs: `http://127.0.0.1:8080/docs`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Check that the API is running |
| GET | `/api/conversations` | List conversations, newest first |
| GET | `/api/conversations/{thread_id}/messages` | Get a conversation's messages |
| POST | `/api/conversations/{thread_id}/documents` | Upload a document (multipart field `file`, max 20 MB) |
| POST | `/api/chat/stream` | Send `{"message", "thread_id", "model"}`; streams server-sent events |

`/api/chat/stream` emits one JSON object per `data:` line: `{"token": "..."}` for answer text, `{"error": "..."}` on failure, then `{"done": true}`.

---

## Project Structure

```text
ZacharyGPT/
│
├── backend/                        # API + Agent (Python, managed by uv)
│   ├── app/
│   │   ├── main.py                 # create_app(): lifespan, CORS, routers
│   │   │
│   │   ├── core/
│   │   │   └── config.py           # All settings from .env (models, CORS, paths, upload limits, RAG)
│   │   │
│   │   ├── api/
│   │   │   ├── router.py           # Mounts every route module under /api
│   │   │   └── routes/
│   │   │       ├── health.py       # GET  /api/health
│   │   │       ├── conversations.py# GET  /api/conversations, /api/conversations/{id}/messages
│   │   │       ├── documents.py    # POST /api/conversations/{id}/documents
│   │   │       └── chat.py         # POST /api/chat/stream (SSE)
│   │   │
│   │   ├── schemas/                # Pydantic request/response models
│   │   │   ├── chat.py
│   │   │   ├── conversations.py
│   │   │   └── documents.py
│   │   │
│   │   ├── services/
│   │   │   ├── chat_stream.py      # Runs the agent and turns it into SSE events
│   │   │   └── documents.py        # Validates, saves and indexes uploads
│   │   │
│   │   ├── agents/
│   │   │   ├── graph.py            # Main graph: router -> chat / research / coding
│   │   │   ├── state.py            # Shared state (messages + route)
│   │   │   ├── router.py           # Task routing (LLM classifier)
│   │   │   └── subgraphs/
│   │   │       ├── research/       # Research agent: graph.py, state.py, nodes.py
│   │   │       └── coding/         # Coding agent: graph.py, state.py
│   │   │
│   │   ├── tools/
│   │   │   ├── __init__.py         # Collects all tools into the `tools` list
│   │   │   ├── context.py          # Reads the conversation id from the run config
│   │   │   ├── search.py           # Web search tool (Tavily)
│   │   │   ├── calculator.py       # Math tool
│   │   │   ├── retrieval.py        # Uploaded-document search tool
│   │   │   ├── memory.py           # Long-term memory tools (remember / recall)
│   │   │   └── rag.py              # Embeddings, ingestion, vector search + reranking
│   │   │
│   │   ├── memory/
│   │   │   └── database.py         # Conversation and memory persistence (SQLite)
│   │
│   ├── tests/
│   │   ├── conftest.py             # Temp storage + test client
│   │   ├── test_api.py             # API tests (fake agent, no API calls)
│   │   └── test_agent.py           # Integration test against real Gemini
│   │
│   ├── uploads/                    # Uploaded documents
│   ├── data/                       # SQLite database and LangGraph checkpoints (gitignored)
│   ├── chroma_db/                  # ChromaDB vector database storage (gitignored)
│   │
│   ├── .env                        # API keys (gitignored)
│   ├── pyproject.toml              # Project metadata and dependencies (uv)
│   ├── uv.lock                     # Locked dependency versions
│   ├── .python-version             # Python version pinned for uv
│   ├── Dockerfile                  # Backend Docker image
│   └── .dockerignore               # Docker ignore rules
│
├── frontend/                       # UI: Next.js 16 + TypeScript + React 19 + Tailwind 4
│   ├── app/                        # Layout, page, design tokens (globals.css)
│   ├── features/chat/
│   │   ├── use-chat.ts             # Chat state + actions (streaming, uploads, history)
│   │   ├── chat-screen.tsx         # Composes the screen
│   │   └── components/             # Sidebar, header, messages, empty state, composer
│   ├── lib/                        # API client (ChatApi), SSE parser, models, formatting
│   └── package.json
│
├── .github/workflows/cicd.yaml     # AWS deploy workflow (manual only)
├── CLAUDE.md
└── README.md
```

---

## Docker Deployment

### 1. Build the Docker image

```bash
docker build -t zacharygpt backend
```

### 2. Run the Docker container

```bash
docker run -d \
  --name zacharygpt \
  --restart always \
  -p 8080:8080 \
  --env-file backend/.env \
  zacharygpt
```

The app will be available at:

```text
http://localhost:8080
```

---

## AWS CI/CD Deployment with GitHub Actions

This project can be deployed to AWS using:

* GitHub Actions
* Amazon ECR
* Amazon EC2
* Docker
* GitHub self-hosted runner

---

### 1. Create an IAM User

Create an IAM user for deployment and attach the following policies:

```text
AmazonEC2ContainerRegistryFullAccess
AmazonEC2FullAccess
```

You can also use a more restricted custom IAM policy for production.

---

### 2. Create an ECR Repository

Create an Amazon ECR repository.

Example full ECR image URI:

```text
315865595366.dkr.ecr.us-east-1.amazonaws.com/zacharygpt
```

For GitHub Secrets, only save the repository name:

```text
ECR_REPO=zacharygpt
```

Do not save the full ECR URI as `ECR_REPO`.

---

### 3. Create an EC2 Instance

Create an Ubuntu EC2 instance.

Recommended inbound security group rule:

```text
Type: Custom TCP
Port: 8080
Source: 0.0.0.0/0
```

---

### 4. Install Docker on EC2

Connect to your EC2 instance and run:

```bash
sudo apt-get update -y
sudo apt-get upgrade -y
```

Install Docker:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

Add the Ubuntu user to the Docker group:

```bash
sudo usermod -aG docker ubuntu
newgrp docker
```

Check Docker:

```bash
docker --version
```

---

### 5. Configure EC2 as a GitHub Self-Hosted Runner

Go to your GitHub repository:

```text
Settings → Actions → Runners → New self-hosted runner
```

Select Linux and follow the commands shown by GitHub.

After setup, start the runner:

```bash
./run.sh
```

For production, you can configure the runner as a service:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

---

## GitHub Secrets

Add the following secrets in your GitHub repository:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_DEFAULT_REGION
ECR_REPO

GOOGLE_API_KEY
GEMINI_MODEL
TAVILY_API_KEY
LANGSMITH_TRACING
LANGSMITH_ENDPOINT
LANGSMITH_API_KEY
LANGSMITH_PROJECT
```

Path:

```text
GitHub Repository → Settings → Secrets and variables → Actions → New repository secret
```

Example:

```text
AWS_DEFAULT_REGION=us-east-1
ECR_REPO=zacharygpt
GEMINI_MODEL=gemini-3.1-flash-lite
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_PROJECT=zacharygpt
```

---

## GitHub Actions Workflow

Create this file:

```text
.github/workflows/cicd.yaml
```

This workflow will:

1. Build your Docker image
2. Push the image to Amazon ECR
3. Pull the latest image on EC2
4. Stop the old container
5. Run the new container

---

## Run Tests

```bash
cd backend
uv run pytest                  # API tests: fake agent and indexer, temp storage, no API calls
uv run pytest -m integration   # one real agent turn (needs a real GOOGLE_API_KEY)

cd ../frontend
npm test                       # useChat + SSE parser tests (no server needed)
```

---

## Usage

After running locally or deploying to AWS:

1. Open the app in your browser.
2. Start chatting with the AI assistant.
3. Upload documents to use them as context.
4. Ask questions about uploaded files.
5. Ask current-information questions to trigger web search.
6. Continue conversations with saved chat history.

---

## Example Questions

```text
Summarize the uploaded PDF.
```

```text
Search the web for the latest AI agent news.
```

```text
Based on my uploaded document, what are the key points?
```

```text
Calculate 125 * 48 / 6.
```

---

## Notes

* Do not commit your `.env` file to GitHub.
* Keep API keys inside GitHub Secrets for deployment.
* For production, avoid using `reload=True` in Uvicorn.
* Make sure port `8080` is open in your EC2 security group.
* Rotate any API keys that were accidentally exposed publicly.

---

## Contributing

Contributions are welcome.

To contribute:

1. Fork the repository.
2. Create a new branch.
3. Make your changes.
4. Submit a pull request.

---

## License

This project is open source. Please check the repository license for usage terms.
