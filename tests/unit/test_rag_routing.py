"""Agentic RAG control flow: adaptive routing, corrective fallback, self-correction loop, RRF fusion."""

import pytest

from src.ai.graph.edges import docs_sufficient, route_decision, self_correction_decision
from src.ai.graph.retrieval import reciprocal_rank_fusion


# ── Adaptive RAG: router ─────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "route, expected",
    [
        ("DIRECT", "direct_answer"),
        ("DOCUMENTS", "retrieve_docs"),
        ("HYBRID", "retrieve_docs"),
        ("DB_TOOLS", "db_agent"),
        ("SOMETHING_UNEXPECTED", "db_agent"),  # safe default: answer from live data
    ],
)
def test_route_decision(route, expected):
    assert route_decision({"route": route}) == expected


# ── Corrective RAG: are the retrieved documents enough? ──────────────────────

def test_relevant_docs_go_straight_to_generation():
    assert docs_sufficient({"route": "DOCUMENTS", "graded_docs": [{"id": 1}]}) == "generate"


def test_no_relevant_docs_falls_back_to_db_agent():
    assert docs_sufficient({"route": "DOCUMENTS", "graded_docs": []}) == "db_agent"


def test_hybrid_always_queries_the_database_too():
    assert docs_sufficient({"route": "HYBRID", "graded_docs": [{"id": 1}, {"id": 2}]}) == "db_agent"


# ── Self-RAG: answer grading loop ────────────────────────────────────────────

def state(count=0, grounded=True, relevant=True):
    return {"correction_count": count, "grounding_ok": grounded, "relevance_ok": relevant}


def test_good_answer_is_accepted():
    assert self_correction_decision(state()) == "update_memory"


def test_hallucinated_answer_is_regenerated():
    assert self_correction_decision(state(grounded=False)) == "generate"


def test_off_target_answer_restarts_from_query_analysis():
    assert self_correction_decision(state(relevant=False)) == "analyze_query"


@pytest.mark.parametrize("count", [2, 3])
def test_retry_loop_is_capped(count):
    # Even a bad answer must stop after 2 corrections, or the graph could loop forever
    assert self_correction_decision(state(count=count, grounded=False, relevant=False)) == "update_memory"


# ── Hybrid search: reciprocal rank fusion ────────────────────────────────────

def chunk(cid, rank, source):
    return {"id": cid, "rank": rank, "content": f"{source}-{cid}"}


def test_documents_found_by_both_searches_rank_first():
    semantic = [chunk(1, 1, "sem"), chunk(2, 2, "sem"), chunk(3, 3, "sem")]
    keyword = [chunk(4, 1, "kw"), chunk(3, 2, "kw")]

    fused = reciprocal_rank_fusion(semantic, keyword)

    assert fused[0]["id"] == 3
    assert [c["id"] for c in fused].count(3) == 1  # deduplicated


def test_fusion_keeps_every_document_once():
    fused = reciprocal_rank_fusion([chunk(1, 1, "sem")], [chunk(2, 1, "kw")])
    assert sorted(c["id"] for c in fused) == [1, 2]


def test_semantic_payload_wins_for_duplicates():
    fused = reciprocal_rank_fusion([chunk(5, 1, "sem")], [chunk(5, 1, "kw")])
    assert fused == [chunk(5, 1, "sem")]


def test_fusion_of_empty_lists():
    assert reciprocal_rank_fusion([], []) == []
