"""Charts for the RAG eval. Reads the summary dict written by evals/rag/run.py."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # file output only, no display needed
import matplotlib.pyplot as plt  # noqa: E402

VECTOR_COLOR = "#2F6FEB"
RERANK_COLORS = ["#E5534B", "#F0A030", "#8B949E", "#A371F7"]


def _label(method: str, app_model: str) -> str:
    if method == "vector":
        return "Vector search only"
    model = method.removeprefix("rerank:")
    return f"+ rerank {model}" + ("  (app default)" if model == app_model else "")


def _colors(methods: list[str]) -> dict[str, str]:
    rerankers = [m for m in methods if m != "vector"]
    return {"vector": VECTOR_COLOR, **{m: RERANK_COLORS[i % len(RERANK_COLORS)] for i, m in enumerate(rerankers)}}


def _get(d: dict, k: int):
    return d[k] if k in d else d[str(k)]  # JSON turns int keys into strings


def _style(ax) -> None:
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", color="#E5E7EB", linewidth=0.8)
    ax.set_axisbelow(True)


def plot_hit_curve(summary: dict, out: Path) -> None:
    setup, methods, data = summary["setup"], summary["methods"], summary["all"]
    colors = _colors(methods)
    ks = sorted(int(k) for k in data["vector"]["hit_at_k"])

    fig, ax = plt.subplots(figsize=(8, 4.6), dpi=150)
    for method in methods:
        ys = [_get(data[method]["hit_at_k"], k) * 100 for k in ks]
        is_vector = method == "vector"
        ax.plot(ks, ys, marker="o", markersize=4 if not is_vector else 5, color=colors[method],
                linewidth=2.6 if is_vector else 1.8, label=_label(method, setup["app_rerank_model"]),
                zorder=3 if is_vector else 2)

    prod_k = setup["production_k"]
    ax.axvline(prod_k, color="#6B7280", linestyle="--", linewidth=1)
    ax.text(prod_k - 0.12, 8, f"k={prod_k}: what\nthe agent gets", color="#6B7280", fontsize=8.5, ha="right")

    ax.set_xticks(ks)
    ax.set_ylim(0, 105)
    ax.set_xlabel("k (chunks returned)")
    ax.set_ylabel("Hit@k (%)")
    ax.set_title(f"Is the answer in the top k chunks?  ({setup['questions']} questions, {setup['chunks']} chunks)", fontsize=11)
    ax.legend(frameon=False, loc="lower right", bbox_to_anchor=(1, 0.04), fontsize=8.5)
    _style(ax)
    fig.tight_layout()
    fig.savefig(out)
    plt.close(fig)


def plot_ranking_quality(summary: dict, out: Path) -> None:
    setup, methods, data = summary["setup"], summary["methods"], summary["all"]
    colors = _colors(methods)
    prod_k = setup["production_k"]
    metrics = [
        ("Hit@1", lambda m: _get(data[m]["hit_at_k"], 1) * 100),
        ("Hit@3", lambda m: _get(data[m]["hit_at_k"], 3) * 100),
        (f"Hit@{prod_k}", lambda m: _get(data[m]["hit_at_k"], prod_k) * 100),
        (f"MRR@{prod_k} ×100", lambda m: data[m]["mrr_at_k"] * 100),
    ]

    fig, ax = plt.subplots(figsize=(10, 4.4), dpi=150)
    width = 0.8 / len(methods)
    for j, method in enumerate(methods):
        xs = [i + (j - (len(methods) - 1) / 2) * width for i in range(len(metrics))]
        bars = ax.bar(xs, [value(method) for _, value in metrics], width * 0.95,
                      color=colors[method], label=_label(method, setup["app_rerank_model"]))
        ax.bar_label(bars, fmt="%.0f", padding=2, fontsize=8)
    ax.set_xticks(range(len(metrics)))
    ax.set_xticklabels([name for name, _ in metrics])
    ax.set_ylim(0, 112)
    ax.set_title(f"Ranking quality on {setup['questions']} questions (higher is better)", fontsize=11)
    _style(ax)
    fig.legend(*ax.get_legend_handles_labels(), frameon=False, loc="lower center", ncol=2, fontsize=8.5)
    fig.tight_layout(rect=(0, 0.12, 1, 1))
    fig.savefig(out)
    plt.close(fig)


def plot_latency(summary: dict, out: Path) -> None:
    setup, methods = summary["setup"], summary["methods"]
    colors = _colors(methods)
    latency = summary["latency_ms_median"]

    fig, ax = plt.subplots(figsize=(8, 2.8), dpi=150)
    labels = [_label(m, setup["app_rerank_model"]) for m in methods]
    values = [latency[m] for m in methods]
    bars = ax.barh(labels[::-1], values[::-1], color=[colors[m] for m in methods][::-1])
    ax.bar_label(bars, fmt="%.0f ms", padding=3, fontsize=8.5)
    ax.set_title("Median ms per query (vector: embed + search; rerank: extra CPU time)", fontsize=10, loc="left")
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_xlim(0, max(values) * 1.2)
    fig.tight_layout()
    fig.savefig(out)
    plt.close(fig)


def plot_all(summary: dict, results_dir: Path) -> None:
    plot_hit_curve(summary, results_dir / "hit_at_k.png")
    plot_ranking_quality(summary, results_dir / "ranking_quality.png")
    plot_latency(summary, results_dir / "latency.png")


if __name__ == "__main__":
    # Re-draw charts from an existing summary without re-running the eval:
    #   uv run --group eval python -m evals.rag.plots
    results = Path(__file__).resolve().parent / "results"
    plot_all(json.loads((results / "summary.json").read_text(encoding="utf-8")), results)
    print(f"Charts written to {results}")
