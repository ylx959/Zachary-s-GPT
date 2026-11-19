"""Shared per-request context for tools (which conversation is active)."""

_current_thread_id = "default"


def set_current_thread_id(thread_id: str):
    global _current_thread_id
    _current_thread_id = thread_id


def get_current_thread_id() -> str:
    return _current_thread_id
