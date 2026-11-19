"""
Integration test: one real agent turn against Gemini. Needs a real GOOGLE_API_KEY.

Skipped by default. Run with:  uv run pytest -m integration
"""

import os
import uuid

import pytest
from langchain_core.messages import HumanMessage

pytestmark = pytest.mark.integration


@pytest.mark.skipif(os.getenv("GOOGLE_API_KEY", "test-key") == "test-key", reason="needs a real GOOGLE_API_KEY")
def test_agent_answers_a_math_question():
    from app.agents.graph import get_agent
    from app.memory.database import init_db

    init_db()
    agent = get_agent()
    config = {"configurable": {"thread_id": f"it-{uuid.uuid4().hex[:8]}"}}

    result = agent.invoke({"messages": [HumanMessage(content="What is 37*12? Use the calculator.")]}, config)

    assert "444" in result["messages"][-1].text
