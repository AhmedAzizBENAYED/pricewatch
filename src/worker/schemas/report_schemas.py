from typing import Literal
from pydantic import BaseModel, Field


class ReportPlan(BaseModel):
    sections_a_generer: list[str] = Field(
        description="Ordered list of section names to include in this report"
    )
    focus_areas: list[str] = Field(
        description="Specific competitive topics to emphasize, e.g. 'baisses de prix sur smartphones'"
    )
    tools_needed: list[str] = Field(
        description="Tool names to call for data collection"
    )
    contexte: str = Field(
        description="One sentence summarising the tenant profile and report purpose"
    )


class ReportSection(BaseModel):
    titre: str
    resume: str = Field(description="2-3 sentence narrative summary of this section")
    points_cles: list[str] = Field(description="3-5 actionable bullet points")
    donnees: list[dict] = Field(
        default_factory=list,
        description="Structured table rows — all dicts must share the same keys",
    )
    recommandation: str = Field(description="One concrete actionable recommendation")
    sources: list[str] = Field(default_factory=list, description="Tool names used")


class ReportAnalysis(BaseModel):
    conclusion_generale: str = Field(
        description="2-3 sentence overall competitive conclusion"
    )
    opportunites: list[str] = Field(
        description="Up to 3 concrete market opportunities"
    )
    risques: list[str] = Field(
        description="Up to 3 competitive risks to address"
    )
    score_concurrentiel: int = Field(
        ge=0, le=100,
        description="0=very weak position, 100=dominant. Based on pricing and activity data.",
    )
    tendance: Literal["AMELIORATION", "STABLE", "DEGRADATION"] = Field(
        description="Overall competitive trend vs previous period"
    )


class FinalReport(BaseModel):
    plan:     ReportPlan
    sections: dict[str, ReportSection]
    analysis: ReportAnalysis
