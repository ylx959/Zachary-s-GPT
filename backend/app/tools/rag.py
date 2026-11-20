from pathlib import Path
from typing import List

from app.core.config import get_settings
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from pypdf import PdfReader
import docx2txt
from flashrank import Ranker, RerankRequest
from langsmith import traceable


settings = get_settings()

# Embeddings model
embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")

vectorstore = Chroma(
    collection_name="agentic_chatbot_docs",
    embedding_function=embeddings,
    persist_directory=str(settings.chroma_dir)
)


# Reranker (local cross-encoder, no API key needed).
# MultiBERT is multilingual, so it also handles Chinese documents.
RERANK_MODEL = settings.rerank_model
RERANK_FETCH_K = settings.rerank_fetch_k  # candidates from vector search
RERANK_MIN_SCORE = settings.rerank_min_score  # drop chunks below this

_ranker: Ranker | None = None


def get_ranker() -> Ranker:
    """Load the reranker lazily so app startup stays fast."""
    global _ranker
    if _ranker is None:
        cache_dir = Path.home() / ".cache" / "flashrank"
        cache_dir.mkdir(parents=True, exist_ok=True)
        _ranker = Ranker(model_name=RERANK_MODEL, cache_dir=str(cache_dir))
    return _ranker


@traceable(name="rerank", run_type="chain")
def rerank(query: str, docs: List[Document], top_n: int) -> List[Document]:
    """Reorder docs by cross-encoder relevance and keep the best top_n."""
    if not docs:
        return []

    passages = [
        {"id": i, "text": doc.page_content}
        for i, doc in enumerate(docs)
    ]

    try:
        ranked = get_ranker().rerank(RerankRequest(query=query, passages=passages))
    except Exception as e:
        # If the model can't load (e.g. offline first run), fall back to vector order.
        print(f"[rag] rerank failed, using vector order: {e}")
        return docs[:top_n]

    results = []
    for item in ranked:
        if float(item["score"]) < RERANK_MIN_SCORE:
            continue
        doc = docs[item["id"]]
        doc.metadata["rerank_score"] = float(item["score"])
        results.append(doc)
        if len(results) >= top_n:
            break

    return results



def read_file_text(file_path: str) -> str:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        reader = PdfReader(file_path)
        text = ""

        for page in reader.pages:
            text += page.extract_text() or ""
            text += "\n"

        return text

    if suffix == ".docx":
        return docx2txt.process(file_path)

    if suffix in [".txt", ".md", ".py", ".csv"]:
        return path.read_text(encoding="utf-8", errors="ignore")

    raise ValueError("Unsupported file type. Upload PDF, DOCX, TXT, MD, PY, or CSV.")




def add_document_to_rag(file_path: str, thread_id: str):
    text = read_file_text(file_path)

    if not text.strip():
        raise ValueError("No text could be extracted from this file.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=900,
        chunk_overlap=150
    )

    chunks = splitter.split_text(text)

    docs: List[Document] = [
        Document(
            page_content=chunk,
            metadata={
                "thread_id": thread_id,
                "source": Path(file_path).name
            }
        )
        for chunk in chunks
    ]

    vectorstore.add_documents(docs)

    return {
        "filename": Path(file_path).name,
        "chunks": len(docs)
    }





@traceable(name="retrieve_docs", run_type="retriever")
def retrieve_docs(
    query: str,
    thread_id: str,
    k: int = 4,
    use_rerank: bool = True,
) -> List[Document]:
    """
    Return the top-k chunks for a query, scoped to one conversation.

    With use_rerank=False this is plain vector search (the baseline the eval in
    evals/ compares against).
    """
    if not use_rerank:
        return vectorstore.similarity_search(query, k=k, filter={"thread_id": thread_id})

    # Stage 1: recall — grab a wider candidate set from the vector store.
    candidates = vectorstore.similarity_search(
        query,
        k=max(k, RERANK_FETCH_K),
        filter={"thread_id": thread_id}
    )

    # Stage 2: precision — rerank candidates and keep the top k.
    return rerank(query, candidates, top_n=k)


def retrieve_from_rag(query: str, thread_id: str, k: int = 4) -> str:
    docs = retrieve_docs(query, thread_id, k=k)

    if not docs:
        return "No relevant uploaded document content found."

    results = []

    for i, doc in enumerate(docs, start=1):
        source = doc.metadata.get("source", "uploaded document")
        score = doc.metadata.get("rerank_score")
        score_text = f" | relevance {score:.2f}" if score is not None else ""
        results.append(
            f"[Source {i}: {source}{score_text}]\n{doc.page_content}"
        )

    return "\n\n".join(results)
