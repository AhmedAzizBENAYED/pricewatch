"""
LangGraph report generation graph.

Nodes
─────
  plan_report     → LLM chooses focus areas and tool list
  react_collect   → Manual ReACT loop: bind_tools + explicit tool execution
  analyze         → structured ReportAnalysis (score, risks, opportunities)
  write_sections  → one LLM call per section with coherence context
  render          → PDF or Excel from FinalReport Pydantic model
  handle_error    → marks rapport ERREUR in DB

Why manual ReACT (not create_react_agent)?
─────────────────────────────────────────
  qwen3:4b batches ALL tool calls in a single AIMessage turn.
  With create_react_agent + streaming, only the last ToolMessage per
  chunk is visible. A manual loop using llm.bind_tools() + explicit
  tool invocation captures every result from every call in every turn.
"""

import json
import logging
import os
from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_ollama import ChatOllama
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from src.worker.graphs.report_state import ReportGraphState
from src.worker.schemas.report_schemas import (
    FinalReport, ReportPlan, ReportSection,
)
from src.worker.tasks.report_llm import (
    analyze_data, call_llm_json, write_section,
    NEUTRAL_ANALYSIS, ALL_SECTIONS,
)
from src.common.database import SessionLocal
from src.common.models.rapport import Rapport

logger = logging.getLogger(__name__)

from src.ai import OLLAMA_MODEL as _AI_MODEL  # noqa: E402

OLLAMA_URL   = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = _AI_MODEL
REPORTS_DIR  = "/app/reports"
MAX_REACT_ITERATIONS = 6

AVAILABLE_TOOLS = [
    "get_market_overview",
    "get_recent_events",
    "get_positioning_summary",
    "get_competitor_activity",
    "get_stock_ruptures",
]

TOOL_TO_DATA_KEY = {
    "get_market_overview":     "overview",
    "get_recent_events":       "events",
    "get_positioning_summary": "positioning",
    "get_competitor_activity": "competitors",
    "get_stock_ruptures":      "ruptures",
}

SECTION_TOOL = {
    "Synthèse exécutive":      "get_market_overview",
    "Positionnement":           "get_positioning_summary",
    "Activité concurrents":     "get_competitor_activity",
    "Événements significatifs": "get_recent_events",
}


# ── DB helper — short-lived session ──────────────────────────────────────────

def _db_save(rapport_id: int, **kwargs):
    db = SessionLocal()
    try:
        r = db.query(Rapport).filter(Rapport.id == rapport_id).first()
        if r:
            for k, v in kwargs.items():
                setattr(r, k, v)
            db.commit()
    finally:
        db.close()


# ── Node 1 — plan_report ─────────────────────────────────────────────────────

def plan_node(state: ReportGraphState) -> ReportGraphState:
    rapport_id = state["rapport_id"]
    cfg        = state["rapport_config"]
    ctx        = state["tenant_context"]
    sections   = cfg.get("sections", [])

    # If crash recovery gave us an existing plan, skip LLM call
    if state.get("plan"):
        logger.info("Report %s: plan restored from DB, skipping plan LLM", rapport_id)
        return state

    period_str = ""
    if cfg.get("periode_debut") and cfg.get("periode_fin"):
        period_str = f"{cfg['periode_debut']} → {cfg['periode_fin']}"
    elif cfg.get("type") == "HEBDOMADAIRE":
        period_str = "7 derniers jours"
    elif cfg.get("type") == "MENSUEL":
        period_str = "30 derniers jours"

    raw = call_llm_json(
        system=(
            "Tu es un expert en veille concurrentielle e-commerce tunisien. "
            "Réponds UNIQUEMENT en JSON valide, sans commentaire."
        ),
        user_prompt=(
            f"Planifie ce rapport.\n"
            f"Tenant: {ctx['nom']} (profil: {ctx['profil_client']})\n"
            f"Type: {cfg.get('type')}  Période: {period_str}\n"
            f"Sections: {sections}\n"
            f"Outils disponibles: {AVAILABLE_TOOLS}\n\n"
            'JSON: {"sections_a_generer":[...],"focus_areas":["..."],'
            '"tools_needed":["..."],"contexte":"..."}'
        ),
        num_predict=300,
    )

    plan = None
    if raw:
        try:
            plan = ReportPlan.model_validate(raw)
            plan.tools_needed = [t for t in plan.tools_needed if t in AVAILABLE_TOOLS]
            for sec in sections:
                tool = SECTION_TOOL.get(sec)
                if tool and tool not in plan.tools_needed:
                    plan.tools_needed.append(tool)
            if not plan.sections_a_generer:
                plan.sections_a_generer = sections
        except (ValidationError, Exception) as e:
            logger.warning("Report %s: plan parse failed: %s", rapport_id, e)
            plan = None

    if plan is None:
        tools = list({SECTION_TOOL[s] for s in sections if s in SECTION_TOOL})
        plan = ReportPlan(
            sections_a_generer=sections,
            focus_areas=["activité concurrentielle générale", "évolution des prix"],
            tools_needed=tools,
            contexte=f"Rapport {cfg.get('type')} de veille pour {ctx['nom']}.",
        )

    _db_save(rapport_id, progression=15, plan_data=plan.model_dump())
    return {**state, "plan": plan, "progression": 15}


# ── Node 2 — react_collect ────────────────────────────────────────────────────

def react_collect_node(state: ReportGraphState) -> ReportGraphState:
    """
    Manual ReACT loop using llm.bind_tools().

    Why not create_react_agent + stream?
    qwen3:4b emits ALL tool calls in a single AIMessage (batched).
    LangGraph's streaming exposes one ToolMessage per chunk — so when
    the model calls 5 tools at once, only 1 result is ever captured.

    This manual loop:
      1. Invokes the LLM (synchronous .invoke, no streaming)
      2. Reads EVERY tool_call from the AIMessage
      3. Executes each tool and adds its ToolMessage to history
      4. Captures each result in collected_data
      5. Repeats until the model stops calling tools
    """
    rapport_id = state["rapport_id"]
    plan       = state["plan"]
    ctx        = state["tenant_context"]
    cfg        = state["rapport_config"]

    collected_data: dict = {"tenant_nom": ctx["nom"]}
    tools_called: list   = []

    db = SessionLocal()
    try:
        from src.ai.tools import make_tools as _make_tools
        tools = _make_tools(
            db=db,
            tenant_id=ctx["id"],
            own_site_id=ctx.get("own_site_id"),
            own_brand=ctx.get("own_brand"),
            profil_client=ctx["profil_client"],
        )
        tool_map = {t.name: t for t in tools}

        llm = ChatOllama(model=OLLAMA_MODEL, base_url=OLLAMA_URL, temperature=0.0)
        llm_with_tools = llm.bind_tools(tools)

        period_str = ""
        if cfg.get("periode_debut") and cfg.get("periode_fin"):
            period_str = f"du {cfg['periode_debut']} au {cfg['periode_fin']}"
        elif cfg.get("type") == "HEBDOMADAIRE":
            period_str = "des 7 derniers jours"
        elif cfg.get("type") == "MENSUEL":
            period_str = "des 30 derniers jours"

        messages = [
            SystemMessage(content=(
                f"Tu es un agent de veille concurrentielle pour {ctx['nom']} "
                f"(profil: {ctx['profil_client']}). "
                f"Collecte TOUTES les données nécessaires pour un rapport "
                f"{cfg.get('type')} {period_str}. "
                f"Axes: {', '.join(plan.focus_areas)}. "
                "Tu DOIS appeler les outils pour obtenir les données réelles. "
                "Quand tu as collecté assez de données, arrête d'appeler des outils."
            )),
            HumanMessage(content=(
                f"Collecte les données pour le rapport {cfg.get('type')} "
                f"de {ctx['nom']} ({period_str}). "
                f"Sections: {plan.sections_a_generer}. "
                f"Outils prioritaires: {plan.tools_needed}."
            )),
        ]

        for iteration in range(MAX_REACT_ITERATIONS):
            response = llm_with_tools.invoke(messages)
            messages.append(response)

            # Extract tool_calls — handle both attribute and dict formats
            tool_calls = []
            if hasattr(response, "tool_calls") and response.tool_calls:
                tool_calls = response.tool_calls
            elif hasattr(response, "additional_kwargs"):
                raw_calls = response.additional_kwargs.get("tool_calls", [])
                for rc in raw_calls:
                    fn = rc.get("function", {})
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                    except (json.JSONDecodeError, TypeError):
                        args = {}
                    tool_calls.append({
                        "id":   rc.get("id", f"call_{iteration}"),
                        "name": fn.get("name", ""),
                        "args": args,
                    })

            if not tool_calls:
                logger.info(
                    "Report %s: agent stopped after %d iterations, collected: %s",
                    rapport_id, iteration + 1,
                    [k for k in collected_data if k != "tenant_nom"],
                )
                break

            # Execute EVERY tool call in this turn
            for tc in tool_calls:
                tool_name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
                tool_args = tc.get("args", {}) if isinstance(tc, dict) else getattr(tc, "args", {})
                tool_id   = tc.get("id", tool_name) if isinstance(tc, dict) else getattr(tc, "id", tool_name)

                fn = tool_map.get(tool_name)
                if fn:
                    try:
                        result = fn.invoke(tool_args or {})
                    except Exception as e:
                        logger.warning("Report %s: tool %s error: %s", rapport_id, tool_name, e)
                        result = {"error": str(e)}
                else:
                    logger.warning("Report %s: unknown tool '%s'", rapport_id, tool_name)
                    result = {"error": f"unknown tool: {tool_name}"}

                # Add ToolMessage so model sees the result in next turn
                messages.append(ToolMessage(
                    content=json.dumps(result, ensure_ascii=False, default=str),
                    tool_call_id=str(tool_id),
                    name=tool_name,
                ))

                # Capture result (first call wins — don't overwrite good data)
                data_key = TOOL_TO_DATA_KEY.get(tool_name)
                if data_key and data_key not in collected_data:
                    collected_data[data_key] = result
                    tools_called.append(tool_name)
                    logger.info(
                        "Report %s — ✓ %s → %s (%s items)",
                        rapport_id, tool_name, data_key,
                        len(result) if isinstance(result, (list, dict)) else 1,
                    )
                    # Persist so frontend poll sees live progress
                    prog = 15 + int(35 * len(tools_called) / max(len(plan.tools_needed), 1))
                    _db_save(
                        rapport_id,
                        progression=min(prog, 49),
                        plan_data={**plan.model_dump(), "tools_called": tools_called},
                    )

    except Exception as e:
        logger.exception("Report %s: react_collect_node error: %s", rapport_id, e)
    finally:
        db.close()

    # Ensure all section data keys exist with empty fallbacks
    collected_data.setdefault("overview",    {})
    collected_data.setdefault("events",      [])
    collected_data.setdefault("positioning", {})
    collected_data.setdefault("competitors", {"concurrents": []})

    _db_save(rapport_id, progression=50,
             plan_data={**plan.model_dump(), "tools_called": tools_called})

    return {**state, "collected_data": collected_data, "tools_called": tools_called, "progression": 50}


# ── Node 3 — analyze ─────────────────────────────────────────────────────────

def analyze_node(state: ReportGraphState) -> ReportGraphState:
    rapport_id = state["rapport_id"]
    ctx        = state["tenant_context"]
    plan       = state["plan"]
    data       = state.get("collected_data", {})

    # Skip if crash recovery already provided analysis
    if state.get("analysis"):
        logger.info("Report %s: analysis restored from DB, skipping", rapport_id)
        _db_save(rapport_id, progression=65)
        return {**state, "progression": 65}

    analysis = analyze_data(ctx["nom"], ctx["profil_client"], plan, data)

    _db_save(rapport_id, progression=65, analysis_data={
        **analysis.model_dump(),
        "tools_used": state.get("tools_called", []),
    })
    return {**state, "analysis": analysis, "progression": 65}


# ── Node 4 — write_sections ───────────────────────────────────────────────────

def write_sections_node(state: ReportGraphState) -> ReportGraphState:
    rapport_id = state["rapport_id"]
    plan       = state["plan"]
    analysis   = state.get("analysis") or NEUTRAL_ANALYSIS
    data       = state.get("collected_data", {})
    ctx        = state["tenant_context"]

    active = [s for s in plan.sections_a_generer if s in ALL_SECTIONS]
    step   = 20.0 / max(len(active), 1)
    prog   = 65.0
    written: dict[str, ReportSection] = {}

    for sec_name in active:
        logger.info("Report %s — writing '%s'", rapport_id, sec_name)
        written[sec_name] = write_section(
            section_name=sec_name,
            raw_data=data,
            plan=plan,
            analysis=analysis,
            previous_sections=dict(written),
            tenant_nom=ctx["nom"],
        )
        prog += step
        _db_save(rapport_id, progression=int(prog))

    _db_save(rapport_id, progression=85)
    return {**state, "sections_written": written, "progression": 85}


# ── Node 5 — render ───────────────────────────────────────────────────────────

def render_node(state: ReportGraphState) -> ReportGraphState:
    from src.worker.tasks.report_generator import _build_pdf, _build_excel

    rapport_id = state["rapport_id"]
    cfg        = state["rapport_config"]
    plan       = state["plan"]
    analysis   = state.get("analysis") or NEUTRAL_ANALYSIS
    written    = state.get("sections_written", {})

    final = FinalReport(plan=plan, sections=written, analysis=analysis)

    db = SessionLocal()
    try:
        rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
        if not rapport:
            logger.error("Report %s not found in render_node", rapport_id)
            return {**state, "error": f"Rapport {rapport_id} not found"}

        os.makedirs(REPORTS_DIR, exist_ok=True)

        fmt = cfg.get("format", "PDF")
        if fmt == "PDF":
            content = _build_pdf(rapport, final)
            ext = "pdf"
        else:
            content = _build_excel(rapport, final)
            ext = "xlsx"

        path = os.path.join(REPORTS_DIR, f"rapport_{rapport_id}.{ext}")
        with open(path, "wb") as f:
            f.write(content)

        rapport.statut          = "PRET"
        rapport.progression     = 100
        rapport.file_path       = path
        rapport.date_generation = datetime.now(timezone.utc)
        db.commit()
        logger.info("Report %s — DONE %d bytes → %s", rapport_id, len(content), path)

    except Exception as e:
        logger.exception("Report %s — render failed: %s", rapport_id, e)
        try:
            db.rollback()
            rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
            if rapport:
                rapport.statut = "ERREUR"
                db.commit()
        except Exception:
            pass
        return {**state, "error": str(e)}
    finally:
        db.close()

    return {**state, "final_report": final, "progression": 100}


# ── Error node ────────────────────────────────────────────────────────────────

def error_node(state: ReportGraphState) -> ReportGraphState:
    rapport_id = state.get("rapport_id")
    error_msg  = state.get("error") or "no data collected"
    logger.error("Report %s — handle_error: %s", rapport_id, error_msg)
    if rapport_id:
        _db_save(rapport_id, statut="ERREUR", progression=0)
    return state


# ── Routing ───────────────────────────────────────────────────────────────────

def _after_collect(state: ReportGraphState) -> str:
    """Always proceed to analyze. Missing data uses fallback defaults."""
    return "analyze"


# ── Build graph ───────────────────────────────────────────────────────────────

def build_report_graph():
    g = StateGraph(ReportGraphState)

    g.add_node("plan_report",    plan_node)
    g.add_node("react_collect",  react_collect_node)
    g.add_node("analyze",        analyze_node)
    g.add_node("write_sections", write_sections_node)
    g.add_node("render",         render_node)
    g.add_node("handle_error",   error_node)

    g.set_entry_point("plan_report")
    g.add_edge("plan_report",    "react_collect")
    g.add_edge("react_collect",  "analyze")
    g.add_edge("analyze",        "write_sections")
    g.add_edge("write_sections", "render")
    g.add_edge("render",         END)
    g.add_edge("handle_error",   END)

    return g.compile(checkpointer=MemorySaver())
