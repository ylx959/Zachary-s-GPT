"""Unit tests for the retrieval metrics used by evals/run_rag_eval.py."""

import pytest

from evals.rag.metrics import first_hit_rank, hit_at_k, mrr_at_k


def test_first_hit_rank_ignores_case_and_whitespace():
    chunks = ["nothing here", "Leave:\n18 days   of paid annual leave", "18 days of paid annual leave"]
    assert first_hit_rank(chunks, "18 days of paid annual leave") == 2


def test_first_hit_rank_miss():
    assert first_hit_rank(["a", "b"], "c") is None


def test_hit_at_k_and_mrr():
    ranks = [1, 3, None, 5]
    assert hit_at_k(ranks, 1) == 0.25
    assert hit_at_k(ranks, 4) == 0.5
    assert mrr_at_k(ranks, 4) == pytest.approx((1 + 1 / 3) / 4)


def test_empty_ranks():
    assert hit_at_k([], 3) == 0.0
    assert mrr_at_k([], 3) == 0.0
