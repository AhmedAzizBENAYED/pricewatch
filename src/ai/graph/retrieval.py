import logging

from sqlalchemy import text

from src.ai.embeddings import embed_text
from src.common.models import DocumentChunk

logger = logging.getLogger(__name__)

_RRF_K = 60


def semantic_search(db, tenant_id: int, query_text: str, limit: int = 10) -> list[dict]:
    """Cosine-distance search via pgvector. Raises if embedding fails."""
    embedding = embed_text(query_text)
    rows = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.tenant_id == tenant_id)
        .order_by(DocumentChunk.embedding.cosine_distance(embedding))
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "content": r.content,
            "document_id": r.document_id,
            "chunk_index": r.chunk_index,
            "metadata": r.chunk_meta or {},
            "rank": i + 1,
        }
        for i, r in enumerate(rows)
    ]


def keyword_search(db, tenant_id: int, query_text: str, limit: int = 10) -> list[dict]:
    """PostgreSQL full-text search using the French dictionary."""
    sql = text("""
        SELECT id, content, document_id, chunk_index, metadata,
               ts_rank(to_tsvector('french', content),
                       plainto_tsquery('french', :query_text)) AS rank_score
        FROM document_chunks
        WHERE tenant_id = :tenant_id
          AND to_tsvector('french', content)
              @@ plainto_tsquery('french', :query_text)
        ORDER BY rank_score DESC
        LIMIT :limit
    """)
    try:
        rows = db.execute(sql, {
            "tenant_id": tenant_id,
            "query_text": query_text,
            "limit": limit,
        }).fetchall()
    except Exception as exc:
        logger.warning("keyword_search failed: %s", exc)
        return []

    return [
        {
            "id": row.id,
            "content": row.content,
            "document_id": row.document_id,
            "chunk_index": row.chunk_index,
            "metadata": row.metadata or {},
            "rank": i + 1,
        }
        for i, row in enumerate(rows)
    ]


def reciprocal_rank_fusion(
    semantic_results: list[dict],
    keyword_results: list[dict],
    k: int = _RRF_K,
) -> list[dict]:
    """Merge two ranked lists into one using RRF: score += 1 / (k + rank)."""
    scores: dict[int, float] = {}
    chunks: dict[int, dict] = {}

    for result in semantic_results:
        cid = result["id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + result["rank"])
        chunks[cid] = result

    for result in keyword_results:
        cid = result["id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + result["rank"])
        if cid not in chunks:
            chunks[cid] = result

    sorted_ids = sorted(scores, key=lambda cid: scores[cid], reverse=True)
    return [chunks[cid] for cid in sorted_ids]


def hybrid_search(db, tenant_id: int, query_text: str, limit: int = 5) -> list[dict]:
    """
    Run semantic + keyword search in sequence and combine with RRF.
    Falls back to keyword-only if the embedding model is unreachable.
    Returns up to `limit` chunks, each tagged with a search_type field.
    """
    sem_results: list[dict] = []
    try:
        sem_results = semantic_search(db, tenant_id, query_text, limit=10)
    except Exception as exc:
        logger.warning("hybrid_search: semantic search failed, falling back to keyword only: %s", exc)

    kw_results = keyword_search(db, tenant_id, query_text, limit=10)

    if not sem_results and not kw_results:
        logger.info("hybrid_search: no results from either search for tenant %d", tenant_id)
        return []

    if sem_results and kw_results:
        results = reciprocal_rank_fusion(sem_results, kw_results)
        search_type = "hybrid"
    elif sem_results:
        results = sem_results
        search_type = "semantic"
    else:
        results = kw_results
        search_type = "keyword"

    for r in results:
        r["search_type"] = search_type

    final = results[:limit]
    logger.info(
        "hybrid_search: returning %d/%d chunks (type=%s) for tenant %d",
        len(final), len(results), search_type, tenant_id,
    )
    return final
