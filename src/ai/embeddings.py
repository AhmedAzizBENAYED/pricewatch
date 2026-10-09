import os

# Base URL is env-overridable so the SAME helper works from two places:
#   - inside the API container  -> default "host.docker.internal" (unchanged)
#   - from host-side scripts     -> set OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
EMBED_MODEL     = os.environ.get("EMBED_MODEL", "nomic-embed-text:latest")

# langchain_ollama is only installed inside the API image. Host scripts (the
# matching pipeline) run on the bare interpreter where it is absent, so we fall
# back to a direct Ollama HTTP call. Either way this module stays the single
# source of truth for "how we embed" — callers never talk to Ollama directly.
try:
    from langchain_ollama import OllamaEmbeddings
    _HAS_LANGCHAIN = True
except ImportError:  # pragma: no cover - depends on runtime environment
    _HAS_LANGCHAIN = False


def get_embedder() -> "OllamaEmbeddings":
    return OllamaEmbeddings(
        model=EMBED_MODEL,
        base_url=OLLAMA_BASE_URL,
    )


def _http_embed_batch(texts: list[str]) -> list[list[float]]:
    """Direct Ollama call via the batched /api/embed endpoint.

    Used when langchain_ollama is absent (host scripts). /api/embed accepts a
    list and is ~30x faster than per-prompt /api/embeddings, which matters for
    backfilling tens of thousands of rows.
    """
    import requests
    resp = requests.post(
        f"{OLLAMA_BASE_URL}/api/embed",
        json={"model": EMBED_MODEL, "input": texts},
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()["embeddings"]


def embed_text(text: str) -> list[float]:
    if _HAS_LANGCHAIN:
        return get_embedder().embed_query(text)
    return _http_embed_batch([text])[0]


def embed_texts(texts: list[str]) -> list[list[float]]:
    if _HAS_LANGCHAIN:
        return get_embedder().embed_documents(texts)
    if not texts:
        return []
    return _http_embed_batch(texts)


def similarity_search(db, tenant_id: int, query_embedding: list[float], limit: int = 5):
    from src.common.models import DocumentChunk
    return (
        db.query(DocumentChunk)
        .filter(DocumentChunk.tenant_id == tenant_id)
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(limit)
        .all()
    )
