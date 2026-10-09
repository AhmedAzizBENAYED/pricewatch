from langgraph.graph import StateGraph, END

from .state import RagState
from .nodes import (
    analyze_query_node,
    route_node,
    direct_answer_node,
    db_agent_node,
    retrieve_docs_node,
    grade_docs_node,
    generate_node,
    grade_answer_node,
    update_memory_node,
)
from .edges import route_decision, docs_sufficient, self_correction_decision


def build_rag_graph():
    workflow = StateGraph(RagState)

    # Nodes
    workflow.add_node("analyze_query", analyze_query_node)
    workflow.add_node("router", route_node)
    workflow.add_node("direct_answer", direct_answer_node)
    workflow.add_node("db_agent", db_agent_node)
    workflow.add_node("retrieve_docs", retrieve_docs_node)
    workflow.add_node("grade_docs", grade_docs_node)
    workflow.add_node("generate", generate_node)
    workflow.add_node("grade_answer", grade_answer_node)
    workflow.add_node("update_memory", update_memory_node)

    # Entry point
    workflow.set_entry_point("analyze_query")

    # analyze → router
    workflow.add_edge("analyze_query", "router")

    # Adaptive RAG: router → one of the three paths
    workflow.add_conditional_edges(
        "router",
        route_decision,
        {
            "direct_answer": "direct_answer",
            "db_agent": "db_agent",
            "retrieve_docs": "retrieve_docs",
        },
    )

    # Direct path skips retrieval and generation grading
    workflow.add_edge("direct_answer", "update_memory")

    # Retrieval path → doc grading
    workflow.add_edge("retrieve_docs", "grade_docs")

    # CRAG: grade_docs → generate or fall back to db_agent
    workflow.add_conditional_edges(
        "grade_docs",
        docs_sufficient,
        {
            "generate": "generate",
            "db_agent": "db_agent",
        },
    )

    # DB agent always feeds into generate
    workflow.add_edge("db_agent", "generate")

    # generate → self-RAG grading
    workflow.add_edge("generate", "grade_answer")

    # Self-RAG: grade_answer → retry loop or finish
    workflow.add_conditional_edges(
        "grade_answer",
        self_correction_decision,
        {
            "generate": "generate",
            "analyze_query": "analyze_query",
            "update_memory": "update_memory",
        },
    )

    # memory → END
    workflow.add_edge("update_memory", END)

    return workflow.compile()


if __name__ == "__main__":
    graph = build_rag_graph()
    print("Graph compiled successfully")
    print(graph.get_graph().draw_mermaid())
