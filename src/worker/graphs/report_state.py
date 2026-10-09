from typing import TypedDict

from src.worker.schemas.report_schemas import (
    FinalReport, ReportAnalysis, ReportPlan,
)


class ReportGraphState(TypedDict, total=False):
    rapport_id:       int
    rapport_config:   dict   # type, format, sections, periode_debut, periode_fin, titre
    tenant_context:   dict   # id, nom, profil_client, own_site_id, own_brand
    plan:             ReportPlan | None
    collected_data:   dict   # tool_name → result (e.g. "overview" → {...})
    tools_called:     list   # ordered list of tool names the agent actually called
    messages:         list   # ReACT conversation history (serialisable dicts)
    analysis:         ReportAnalysis | None
    sections_written: dict   # section_name → ReportSection
    final_report:     FinalReport | None
    error:            str | None
    progression:      int
