from .state import RagState


def route_decision(state: RagState) -> str:
    route = state["route"]
    if route == "DIRECT":
        return "direct_answer"
    if route == "DOCUMENTS":
        return "retrieve_docs"
    if route == "HYBRID":
        return "retrieve_docs"
    return "db_agent"  # DB_TOOLS default


def docs_sufficient(state: RagState) -> str:
    # HYBRID always needs DB agent regardless of how many docs were retrieved
    if state.get("route") == "HYBRID":
        return "db_agent"
    # CRAG: 1+ relevant docs → generate, 0 → corrective fallback to DB agent
    if len(state["graded_docs"]) >= 1:
        return "generate"
    return "db_agent"


def self_correction_decision(state: RagState) -> str:
    # Self-RAG: retry loop with a hard cap at 2 iterations
    if state["correction_count"] >= 2:
        return "update_memory"
    if not state["grounding_ok"]:
        return "generate"
    if not state["relevance_ok"]:
        return "analyze_query"
    return "update_memory"
