"""
FastAPI application: wires settings, middleware and routers together.
The UI is the Next.js app in frontend/; this server only serves the API.

Run from backend/:  uv run python -m app.main   (or: uv run uvicorn app.main:app --reload --port 8080)
API docs:           http://127.0.0.1:8080/docs
"""

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.router import api_router
from app.memory.database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings().ensure_dirs()
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="ZacharyGPT API",
        version="0.1.0",
        summary="Agentic chatbot API: streaming chat, conversations and document RAG.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
