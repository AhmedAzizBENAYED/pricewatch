import operator
from typing import Annotated, TypedDict


class RagState(TypedDict):
    # Input
    original_query: str
    rewritten_query: str
    conversation_id: str
    user_id: int
    tenant_id: int
    tenant_context: dict  # nom, profil_client, own_site_slug, own_brand, own_site_id

    # Routing
    route: str  # DIRECT | DB_TOOLS | DOCUMENTS | HYBRID

    # Retrieval
    retrieved_docs: list   # raw document chunks
    graded_docs: list      # chunks that passed relevance grading
    db_results: dict       # tool results from DB agent

    # Generation
    generation: str        # answer text
    sources: list          # citation sources

    # Self-correction
    grounding_ok: bool     # answer is grounded in context, not hallucinated
    relevance_ok: bool     # answer addresses the question
    correction_count: int  # loop iterations so far

    # Memory
    conversation_history: list
    user_memories: list

    # Control — messages are appended across nodes
    messages: Annotated[list, operator.add]
    error: str | None
