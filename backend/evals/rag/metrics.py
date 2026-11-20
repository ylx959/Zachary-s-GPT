"""Retrieval metrics. Pure functions, no model calls, so they are unit-tested in tests/."""

import re
from collections.abc import Sequence


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def first_hit_rank(chunks: Sequence[str], evidence: str) -> int | None:
    """1-based rank of the first chunk that contains the evidence, or None if none does."""
    needle = _normalize(evidence)
    for rank, chunk in enumerate(chunks, start=1):
        if needle in _normalize(chunk):
            return rank
    return None


def hit_at_k(ranks: Sequence[int | None], k: int) -> float:
    """Share of questions whose evidence appears in the top k."""
    if not ranks:
        return 0.0
    return sum(1 for r in ranks if r is not None and r <= k) / len(ranks)


def mrr_at_k(ranks: Sequence[int | None], k: int) -> float:
    """Mean reciprocal rank, counting misses (or hits below k) as 0."""
    if not ranks:
        return 0.0
    return sum(1 / r for r in ranks if r is not None and r <= k) / len(ranks)
