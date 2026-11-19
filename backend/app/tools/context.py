"""
Per-request context for tools.

The conversation id travels with each graph run in its RunnableConfig
(`config["configurable"]["thread_id"]`, set by the API when it calls the agent).
Tools declare a `config: RunnableConfig` parameter; LangChain injects it and hides
it from the model. This keeps concurrent requests isolated, unlike a global variable.
"""

from langchain_core.runnables import RunnableConfig


def thread_id_from(config: RunnableConfig | None) -> str:
    thread_id = ((config or {}).get("configurable") or {}).get("thread_id")

    if not thread_id:
        raise ValueError("No thread_id in the run config; call the agent with configurable.thread_id.")

    return str(thread_id)
