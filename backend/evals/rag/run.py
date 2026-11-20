"""
RAG retrieval eval: plain vector search vs. vector search + cross-encoder rerank.

Indexes evals/rag/corpus/ with the app's own ingestion (same 900/150 chunking,
same Gemini embeddings, same Chroma setup), asks every question in
questions.jsonl, and records at which rank a chunk containing the question's
`evidence` string shows up. Each method reorders the same RERANK_FETCH_K (20)
vector candidates, exactly like app.tools.rag.retrieve_docs():

    vector                  candidates in vector order (retrieve_docs(use_rerank=False))
    rerank:<model>          candidates reranked by a FlashRank model (the app's
                            model is RERANK_MODEL in app/core/config.py)

Run from backend/ (needs a real GOOGLE_API_KEY in .env):

    uv run --group eval python -m evals.rag.run
    uv run --group eval python -m evals.rag.run --rerankers ms-marco-MiniLM-L-12-v2
    uv run --group eval python -m evals.rag.run --trace     # also send traces to LangSmith

The index and the query candidates are cached in evals/rag/.cache/ (rebuilt
when the corpus or a question changes), so re-runs make no embedding calls.
"""

import argparse
import hashlib
import json
import os
import statistics
import time
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
CORPUS_DIR = EVAL_DIR / "corpus"
QUESTIONS_FILE = EVAL_DIR / "questions.jsonl"
RESULTS_DIR = EVAL_DIR / "results"
CACHE_DIR = EVAL_DIR / ".cache"

PRODUCTION_K = 4  # what search_uploaded_documents passes to retrieve_from_rag
MAX_K = 10
EXTRA_RERANKERS = ["ms-marco-MiniLM-L-12-v2", "ms-marco-TinyBERT-L-2-v2"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--rerankers",
        nargs="*",
        default=None,
        help=f"FlashRank models to compare (default: the app's RERANK_MODEL + {', '.join(EXTRA_RERANKERS)})",
    )
    parser.add_argument("--trace", action="store_true", help="send traces to LangSmith (off by default)")
    return parser.parse_args()


def configure_env(trace: bool) -> None:
    """Must run before importing app.*: settings and the vector store read these at import."""
    os.environ["CHROMA_DIR"] = str(CACHE_DIR / "chroma_db")
    os.environ["DATA_DIR"] = str(CACHE_DIR / "data")
    os.environ["UPLOADS_DIR"] = str(CACHE_DIR / "uploads")
    # load_dotenv() never overrides variables that are already set.
    os.environ["LANGSMITH_TRACING"] = "true" if trace else "false"
    if trace:
        os.environ["LANGSMITH_PROJECT"] = "zacharygpt-evals"


def corpus_files() -> list[Path]:
    return sorted(CORPUS_DIR.glob("*.md"))


def corpus_thread_id() -> str:
    """A content hash, so editing the corpus automatically gives a fresh index."""
    digest = hashlib.sha256()
    for path in corpus_files():
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return f"eval-{digest.hexdigest()[:12]}"


def load_questions() -> list[dict]:
    with QUESTIONS_FILE.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def check_questions(questions: list[dict], chunks: list[str]) -> None:
    """Every evidence string must sit in one source file and inside one chunk, or the eval is meaningless."""
    from evals.rag.metrics import first_hit_rank

    texts = {p.name: p.read_text(encoding="utf-8") for p in corpus_files()}
    problems = []
    for q in questions:
        if q["source"] not in texts or first_hit_rank([texts[q["source"]]], q["evidence"]) is None:
            problems.append(f"{q['id']}: evidence not found in {q['source']}")
        elif first_hit_rank(chunks, q["evidence"]) is None:
            problems.append(f"{q['id']}: evidence is split across a chunk boundary")
        others = [n for n, t in texts.items() if n != q["source"] and first_hit_rank([t], q["evidence"])]
        if others:
            problems.append(f"{q['id']}: evidence is ambiguous, also in {others}")
    if problems:
        raise SystemExit("Bad questions:\n  " + "\n  ".join(problems))


def build_index(thread_id: str) -> list[str]:
    from app.tools import rag

    existing = rag.vectorstore.get(where={"thread_id": thread_id})
    if not existing["ids"]:
        print(f"Indexing {len(corpus_files())} documents (thread {thread_id})...")
        for path in corpus_files():
            info = rag.add_document_to_rag(str(path), thread_id)
            print(f"  {info['filename']}: {info['chunks']} chunks")
        existing = rag.vectorstore.get(where={"thread_id": thread_id})
    return existing["documents"]


def fetch_candidates(questions: list[dict], thread_id: str) -> dict[str, dict]:
    """Vector candidates per question (chunk texts in distance order + search time), cached on disk."""
    from app.tools import rag

    fetch_k = max(MAX_K, rag.RERANK_FETCH_K)
    cache_file = CACHE_DIR / f"candidates-{thread_id}-k{fetch_k}.json"
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}

    missing = [q for q in questions if cache.get(q["id"], {}).get("question") != q["question"]]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for i, q in enumerate(missing, start=1):
        t0, docs = search_with_retry(rag, q["question"], fetch_k, thread_id)
        cache[q["id"]] = {
            "question": q["question"],
            "chunks": [d.page_content for d in docs],
            "sources": [d.metadata.get("source") for d in docs],
            "ms": round((time.perf_counter() - t0) * 1000, 1),
        }
        print(f"  embedded query {i}/{len(missing)}")
        # Save as we go, so a quota error never throws away finished queries.
        cache_file.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    return cache


def search_with_retry(rag, query: str, k: int, thread_id: str, attempts: int = 4):
    """Vector search that waits out the free-tier embedding limit (100 requests/minute)."""
    for attempt in range(attempts):
        t0 = time.perf_counter()
        try:
            return t0, rag.vectorstore.similarity_search(query, k=k, filter={"thread_id": thread_id})
        except Exception as e:  # the Gemini client raises its own error type for 429
            if "RESOURCE_EXHAUSTED" not in str(e) or attempt == attempts - 1:
                raise
            print("  embedding quota hit, waiting 60 s...")
            time.sleep(60)


def run(questions: list[dict], candidates: dict[str, dict], rerankers: list[str]) -> list[dict]:
    """Rank of the first evidence-bearing chunk for every (question, method)."""
    from flashrank import Ranker, RerankRequest

    from evals.rag.metrics import first_hit_rank

    flashrank_cache = Path.home() / ".cache" / "flashrank"  # same cache as app.tools.rag.get_ranker
    rows = [
        {
            **q,
            "ranks": {"vector": first_hit_rank(candidates[q["id"]]["chunks"][:MAX_K], q["evidence"])},
            "ms": {"vector": candidates[q["id"]]["ms"]},
        }
        for q in questions
    ]

    for model in rerankers:
        print(f"Reranking with {model}...")
        ranker = Ranker(model_name=model, cache_dir=str(flashrank_cache))
        for row in rows:
            chunks = candidates[row["id"]]["chunks"]
            t0 = time.perf_counter()
            ranked = ranker.rerank(
                RerankRequest(query=row["question"], passages=[{"id": i, "text": c} for i, c in enumerate(chunks)])
            )
            row["ms"][f"rerank:{model}"] = round((time.perf_counter() - t0) * 1000, 1)
            reordered = [chunks[item["id"]] for item in ranked][:MAX_K]
            row["ranks"][f"rerank:{model}"] = first_hit_rank(reordered, row["evidence"])

    return rows


def summarize(rows: list[dict], chunk_count: int, methods: list[str]) -> dict:
    from app.core.config import get_settings
    from evals.rag.metrics import hit_at_k, mrr_at_k

    def block(subset: list[dict]) -> dict:
        out: dict = {"n": len(subset)}
        for method in methods:
            ranks = [r["ranks"][method] for r in subset]
            out[method] = {
                "hit_at_k": {k: round(hit_at_k(ranks, k), 4) for k in range(1, MAX_K + 1)},
                "mrr_at_k": round(mrr_at_k(ranks, PRODUCTION_K), 4),
            }
        return out

    settings = get_settings()
    return {
        "setup": {
            "documents": len(corpus_files()),
            "chunks": chunk_count,
            "questions": len(rows),
            "embedding_model": "gemini-embedding-001",
            "app_rerank_model": settings.rerank_model,
            "rerank_fetch_k": settings.rerank_fetch_k,
            "production_k": PRODUCTION_K,
        },
        "methods": methods,
        "all": block(rows),
        # vector: query embedding + Chroma search; rerank: extra time on top of that.
        "latency_ms_median": {m: statistics.median(r["ms"][m] for r in rows) for m in methods},
    }


def main() -> None:
    args = parse_args()
    configure_env(args.trace)

    from app.core.config import get_settings

    app_model = get_settings().rerank_model
    rerankers = args.rerankers if args.rerankers is not None else [app_model, *[m for m in EXTRA_RERANKERS if m != app_model]]
    methods = ["vector", *[f"rerank:{m}" for m in rerankers]]

    questions = load_questions()
    thread_id = corpus_thread_id()
    chunks = build_index(thread_id)
    check_questions(questions, chunks)

    candidates = fetch_candidates(questions, thread_id)
    rows = run(questions, candidates, rerankers)
    summary = summarize(rows, len(chunks), methods)

    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "per_question.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (RESULTS_DIR / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    from evals.rag.plots import plot_all

    plot_all(summary, RESULTS_DIR)

    print(f"\n{'method':<36} Hit@1   Hit@{PRODUCTION_K}   MRR@{PRODUCTION_K}  median ms")
    for m in methods:
        a = summary["all"][m]
        print(
            f"{m:<36} {a['hit_at_k'][1]:>5.1%}  {a['hit_at_k'][PRODUCTION_K]:>6.1%}  "
            f"{a['mrr_at_k']:.3f}  {summary['latency_ms_median'][m]:>8.0f}"
        )
    print(f"\nWrote {RESULTS_DIR.relative_to(EVAL_DIR.parent.parent)}/")


if __name__ == "__main__":
    main()
