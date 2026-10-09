"""
LLM helpers for the report pipeline.
Uses httpx → Ollama directly — no langchain dependency for the JSON calls.
Importable from both the Celery task and graph nodes.
"""

import json
import logging
import os
import re

import httpx
from pydantic import ValidationError

from src.worker.schemas.report_schemas import ReportAnalysis, ReportPlan, ReportSection

logger = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = "qwen3:4b-instruct-2507-q4_K_M"
LLM_TIMEOUT  = 120.0

SECTION_SYNTHESE    = "Synthèse exécutive"
SECTION_POSITIONING = "Positionnement"
SECTION_COMPETITORS = "Activité concurrents"
SECTION_EVENTS      = "Événements significatifs"

ALL_SECTIONS = [SECTION_SYNTHESE, SECTION_POSITIONING, SECTION_COMPETITORS, SECTION_EVENTS]

SECTION_TOOL = {
    SECTION_SYNTHESE:    "get_market_overview",
    SECTION_EVENTS:      "get_recent_events",
    SECTION_POSITIONING: "get_positioning_summary",
    SECTION_COMPETITORS: "get_competitor_activity",
}

NEUTRAL_ANALYSIS = ReportAnalysis(
    conclusion_generale="Analyse non disponible — LLM inaccessible.",
    opportunites=[],
    risques=[],
    score_concurrentiel=50,
    tendance="STABLE",
)


def _extract_json(raw: str) -> dict | None:
    text = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return None


def call_llm_json(system: str, user_prompt: str, num_predict: int = 500) -> dict | None:
    try:
        r = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model":  OLLAMA_MODEL,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1, "num_predict": num_predict},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user_prompt},
                ],
            },
            timeout=LLM_TIMEOUT,
        )
        r.raise_for_status()
        raw = r.json().get("message", {}).get("content", "")
        return _extract_json(raw)
    except Exception as exc:
        logger.warning("LLM JSON call failed: %s", exc)
        return None


def compact(obj, max_items: int = 8) -> str:
    if isinstance(obj, list):
        obj = obj[:max_items]
    return json.dumps(obj, ensure_ascii=False, default=str)


def analyze_data(tenant_nom: str, profil_client: str,
                 plan: ReportPlan, raw_data: dict) -> ReportAnalysis:
    ov   = raw_data.get("overview", {})
    pos  = raw_data.get("positioning", {})
    comp = raw_data.get("competitors", {}).get("concurrents", [])

    parts = [f"Tenant: {tenant_nom} ({profil_client})",
             f"Focus: {', '.join(plan.focus_areas)}"]
    if ov:
        parts.append(
            f"KPIs: {ov.get('offres_total',0)} offres, "
            f"{ov.get('evenements_7j',0)} événements/7j, "
            f"{ov.get('promos_actives',0)} promos, "
            f"{ov.get('ruptures_stock',0)} ruptures"
        )
    if pos and "error" not in pos:
        parts.append(
            f"Position: {pos.get('pct_moins_cher',0)}% moins cher, "
            f"{pos.get('pct_plus_cher',0)}% plus cher"
        )
    if comp:
        top = comp[0]
        parts.append(
            f"Concurrent top: {top['site']} "
            f"({top['baisses_prix_7j']} baisses, {top['promos_actives']} promos)"
        )

    raw = call_llm_json(
        system=(f"Tu es analyste senior pour {tenant_nom}. Réponds UNIQUEMENT en JSON valide."),
        user_prompt=(
            "Analyse cette situation et produis un bilan.\n\n"
            + "\n".join(parts)
            + "\n\nJSON:\n"
            '{"conclusion_generale":"...","opportunites":["..."],'
            '"risques":["..."],"score_concurrentiel":0-100,'
            '"tendance":"AMELIORATION"|"STABLE"|"DEGRADATION"}'
        ),
        num_predict=400,
    )
    if raw:
        try:
            return ReportAnalysis.model_validate(raw)
        except (ValidationError, Exception) as e:
            logger.warning("Analysis parse failed: %s", e)
    return NEUTRAL_ANALYSIS


def default_donnees(section: str, raw_data: dict) -> list[dict]:
    if section == SECTION_SYNTHESE:
        ov = raw_data.get("overview", {})
        return [
            {"Indicateur": "Offres surveillées",   "Valeur": str(ov.get("offres_total", 0))},
            {"Indicateur": "Sites actifs",          "Valeur": str(ov.get("sites_actifs", 0))},
            {"Indicateur": "Événements (7 jours)",  "Valeur": str(ov.get("evenements_7j", 0))},
            {"Indicateur": "Promotions actives",    "Valeur": str(ov.get("promos_actives", 0))},
            {"Indicateur": "Ruptures de stock",     "Valeur": str(ov.get("ruptures_stock", 0))},
        ]
    if section == SECTION_EVENTS:
        return [
            {"Type": e.get("type", ""), "Date": e.get("date", ""),
             "Produit": (e.get("produit") or "")[:40], "Site": e.get("site", ""),
             "Variation": (f"{e['variation_pct']:+.1f}%"
                           if e.get("variation_pct") is not None else "—")}
            for e in raw_data.get("events", [])[:10]
        ]
    if section == SECTION_POSITIONING:
        pos = raw_data.get("positioning", {})
        if "error" in pos:
            return []
        rows = [
            {"Positionnement": "Moins cher (−5%+)",  "Part": f"{pos.get('pct_moins_cher', 0)} %"},
            {"Positionnement": "Dans la moyenne",     "Part": f"{pos.get('pct_dans_moyenne', 0)} %"},
            {"Positionnement": "Plus cher (+5%+)",    "Part": f"{pos.get('pct_plus_cher', 0)} %"},
        ]
        for p in pos.get("top_surpasses", [])[:5]:
            rows.append({"Positionnement": p["produit"], "Part": f"+{p['diff_pct']}% vs marché"})
        return rows
    if section == SECTION_COMPETITORS:
        return [
            {"Concurrent": c["site"], "Baisses (7j)": str(c["baisses_prix_7j"]),
             "Promos": str(c["promos_actives"]), "Score": str(c["agressivite"])}
            for c in raw_data.get("competitors", {}).get("concurrents", [])
        ]
    return []


def write_section(section_name: str, raw_data: dict, plan: ReportPlan,
                  analysis: ReportAnalysis, previous_sections: dict[str, ReportSection],
                  tenant_nom: str) -> ReportSection:
    fallback_donnees = default_donnees(section_name, raw_data)
    section_data = {
        SECTION_SYNTHESE:    raw_data.get("overview", {}),
        SECTION_EVENTS:      raw_data.get("events", [])[:8],
        SECTION_POSITIONING: raw_data.get("positioning", {}),
        SECTION_COMPETITORS: raw_data.get("competitors", {}).get("concurrents", [])[:5],
    }.get(section_name, {})

    prev_ctx = ""
    if previous_sections:
        summaries = [f"- {n}: {s.resume} (reco: {s.recommandation})"
                     for n, s in previous_sections.items()]
        prev_ctx = "Déjà rédigé (ne pas répéter):\n" + "\n".join(summaries) + "\n\n"

    raw = call_llm_json(
        system=(f"Tu es analyste expert pour {tenant_nom}. Réponds UNIQUEMENT en JSON valide, français."),
        user_prompt=(
            f"Rédige la section « {section_name} ».\n\n"
            f"{prev_ctx}"
            f"Focus: {', '.join(plan.focus_areas)}\n"
            f"Conclusion: {analysis.conclusion_generale}\n\n"
            f"Données:\n{compact(section_data, max_items=6)}\n\n"
            'JSON: {"titre":"...","resume":"2-3 phrases","points_cles":["..."],'
            '"donnees":[{"col":"val"}],"recommandation":"...","sources":["tool"]}'
        ),
        num_predict=600,
    )
    if raw:
        try:
            sec = ReportSection.model_validate(raw)
            if not sec.donnees or not isinstance(sec.donnees[0], dict):
                sec.donnees = fallback_donnees
            return sec
        except (ValidationError, Exception) as e:
            logger.warning("Section '%s' parse failed: %s", section_name, e)

    return ReportSection(
        titre=section_name, resume="Analyse IA non disponible.",
        points_cles=[], donnees=fallback_donnees,
        recommandation="", sources=[SECTION_TOOL.get(section_name, "")],
    )
