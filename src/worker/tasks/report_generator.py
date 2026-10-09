"""
Celery task — thin wrapper around the LangGraph report generation graph.

Crash recovery (Celery-level):
  If the worker pod is killed and the task is re-queued, this task
  reads plan_data / analysis_data from the DB on startup and skips
  already-completed phases by injecting state into the graph's
  initial state. MemorySaver handles within-task node checkpointing.

The PDF/Excel renderers remain here so render_node can import them
directly without circular imports.
"""

import io
from datetime import datetime

from celery.utils.log import get_task_logger
from pydantic import ValidationError

from src.worker.worker import celery_app
from src.worker.schemas.report_schemas import (
    FinalReport, ReportAnalysis, ReportPlan,
)
from src.common.database import SessionLocal
from src.common.models.rapport import Rapport
from src.common.models.tenant import Tenant

logger = get_task_logger(__name__)

REPORTS_DIR = "/app/reports"


# ── PDF renderer ───────────────────────────────────────────────────────────────

def _build_pdf(rapport: Rapport, final: FinalReport) -> bytes:
    from reportlab.graphics.shapes import Drawing, Rect
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    INDIGO = colors.HexColor("#4F46E5")
    GREEN  = colors.HexColor("#22C55E")
    RED    = colors.HexColor("#EF4444")
    AMBER  = colors.HexColor("#F59E0B")
    SLATE  = colors.HexColor("#64748B")
    LIGHT  = colors.HexColor("#EEF2FF")

    TENDANCE_HEX = {"AMELIORATION": "#22C55E", "STABLE": "#64748B", "DEGRADATION": "#EF4444"}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    ss   = getSampleStyleSheet()
    h1   = ParagraphStyle("H1",   parent=ss["Heading1"], textColor=INDIGO, fontSize=20, spaceAfter=2)
    h2   = ParagraphStyle("H2",   parent=ss["Heading2"], textColor=INDIGO, fontSize=13, spaceBefore=16, spaceAfter=6)
    h3   = ParagraphStyle("H3",   parent=ss["Heading3"], textColor=SLATE,  fontSize=10, spaceBefore=8, spaceAfter=4)
    body = ParagraphStyle("Body", parent=ss["Normal"],   fontSize=10, leading=15)
    muted= ParagraphStyle("Muted",parent=ss["Normal"],   fontSize=9,  textColor=SLATE, leading=13)
    reco = ParagraphStyle("Reco", parent=ss["Normal"],   fontSize=10, leading=14,
                          leftIndent=10, borderPad=6, backColor=LIGHT,
                          borderColor=INDIGO, borderWidth=0.5)
    bgrn = ParagraphStyle("BG", parent=ss["Normal"], fontSize=10, leading=14, textColor=GREEN)
    bred = ParagraphStyle("BR", parent=ss["Normal"], fontSize=10, leading=14, textColor=RED)

    def _tbl(headers, rows, col_widths=None):
        hr = [Paragraph(f"<b>{h}</b>", body) for h in headers]
        dr = [[Paragraph(str(c)[:80], body) for c in row] for row in rows]
        t  = Table([hr] + dr, colWidths=col_widths)
        t.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0), (-1, 0), INDIGO),
            ("TEXTCOLOR",      (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("GRID",           (0, 0), (-1, -1), 0.3, colors.HexColor("#C7D2FE")),
            ("FONTSIZE",       (0, 0), (-1, -1), 9),
            ("TOPPADDING",     (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
            ("LEFTPADDING",    (0, 0), (-1, -1), 7),
        ]))
        return t

    def _donnees_tbl(donnees):
        if not donnees:
            return None
        headers = list(donnees[0].keys())
        rows    = [[str(row.get(h, "")) for h in headers] for row in donnees]
        return _tbl(headers, rows)

    def _score_bar(score, width):
        d        = Drawing(width, 22)
        fill_col = GREEN if score >= 65 else (AMBER if score >= 40 else RED)
        d.add(Rect(0, 6, width, 10, fillColor=colors.HexColor("#E2E8F0"), strokeColor=None))
        d.add(Rect(0, 6, width * score / 100, 10, fillColor=fill_col, strokeColor=None))
        return d

    story     = []
    plan      = final.plan
    analysis  = final.analysis
    now_str   = datetime.now().strftime("%d/%m/%Y %H:%M")
    tenant_nom = plan.contexte.split("pour ")[-1].rstrip(".")

    story += [
        Paragraph("PriceWatch", h1),
        Paragraph(rapport.titre or "Rapport de veille concurrentielle", ss["Heading2"]),
        Paragraph(f"{tenant_nom}  ·  {now_str}", muted),
        Paragraph(f"<i>{plan.contexte}</i>", muted),
        HRFlowable(width="100%", color=INDIGO, thickness=1.5, spaceAfter=14),
    ]

    for sec_name in plan.sections_a_generer:
        sec = final.sections.get(sec_name)
        if not sec:
            continue
        story.append(Paragraph(sec.titre, h2))
        if sec.resume and "non disponible" not in sec.resume:
            story += [Paragraph(sec.resume, body), Spacer(1, 6)]
        tbl = _donnees_tbl(sec.donnees)
        if tbl:
            story += [tbl, Spacer(1, 8)]
        if sec.points_cles:
            story.append(Paragraph("<b>Points clés</b>", h3))
            for pt in sec.points_cles:
                story.append(Paragraph(f"• {pt}", body))
            story.append(Spacer(1, 6))
        if sec.recommandation:
            story += [Spacer(1, 4),
                      Paragraph(f"<b>Recommandation IA :</b> {sec.recommandation}", reco)]
        story.append(Spacer(1, 14))

    score = analysis.score_concurrentiel
    t_hex = TENDANCE_HEX.get(analysis.tendance, "#64748B")
    story += [
        HRFlowable(width="100%", color=INDIGO, thickness=1, spaceAfter=10),
        Paragraph("Analyse Concurrentielle Globale", h2),
        Paragraph(analysis.conclusion_generale, body),
        Spacer(1, 10),
        Paragraph(f"<b>Score concurrentiel : {score}/100</b>  "
                  f"<font color='{t_hex}'>{analysis.tendance}</font>", body),
        _score_bar(score, 15 * cm),
        Spacer(1, 12),
    ]
    if analysis.opportunites:
        story.append(Paragraph("<b>Opportunités</b>", h3))
        for opp in analysis.opportunites:
            story.append(Paragraph(f"▲  {opp}", bgrn))
        story.append(Spacer(1, 8))
    if analysis.risques:
        story.append(Paragraph("<b>Risques</b>", h3))
        for risk in analysis.risques:
            story.append(Paragraph(f"▼  {risk}", bred))

    doc.build(story)
    return buf.getvalue()


# ── Excel renderer ─────────────────────────────────────────────────────────────

def _build_excel(rapport: Rapport, final: FinalReport) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    INDIGO   = "4F46E5"
    GREEN_HX = "22C55E"
    RED_HX   = "EF4444"
    hfont    = Font(bold=True, color="FFFFFF")
    hfill    = PatternFill("solid", fgColor=INDIGO)
    haln     = Alignment(horizontal="center")
    reco_f   = Font(italic=True, color=INDIGO)
    title_f  = Font(bold=True, size=13, color=INDIGO)

    def _headers(ws, cols):
        ws.append(cols)
        for cell in ws[1]:
            cell.font, cell.fill, cell.alignment = hfont, hfill, haln

    def _autowidth(ws):
        for col in ws.columns:
            w = max((len(str(c.value or "")) for c in col), default=0)
            ws.column_dimensions[col[0].column_letter].width = min(w + 4, 55)

    # openpyxl forbids: \ / * ? : [ ] in sheet titles
    _ILLEGAL = str.maketrans({c: "" for c in r'\/*?:[]'})

    def _safe_sheet_name(title: str) -> str:
        return (title.translate(_ILLEGAL) or "Section")[:31]

    wb  = Workbook()
    wb.remove(wb.active)
    plan = final.plan

    for sec_name in plan.sections_a_generer:
        sec = final.sections.get(sec_name)
        if not sec:
            continue
        ws = wb.create_sheet(_safe_sheet_name(sec.titre))
        ws.append([sec.titre]); ws[1][0].font = title_f
        ws.append([])
        if sec.resume:
            ws.append([sec.resume]); ws[ws.max_row][0].font = Font(italic=True)
            ws.append([])
        if sec.donnees:
            headers = list(sec.donnees[0].keys())
            _headers(ws, headers)
            for row in sec.donnees:
                ws.append([str(row.get(h, "")) for h in headers])
            ws.append([])
        if sec.points_cles:
            ws.append(["Points clés"]); ws[ws.max_row][0].font = Font(bold=True)
            for pt in sec.points_cles:
                ws.append([f"• {pt}"])
        if sec.recommandation:
            ws.append([])
            ws.append([f"Recommandation IA : {sec.recommandation}"])
            ws[ws.max_row][0].font = reco_f
        _autowidth(ws)

    analysis = final.analysis
    ws = wb.create_sheet("Analyse")
    ws.append(["Analyse Concurrentielle Globale"]); ws[1][0].font = title_f
    ws.append([])
    ws.append(["Score concurrentiel", f"{analysis.score_concurrentiel}/100"])
    ws.append(["Tendance", analysis.tendance])
    t_color = (GREEN_HX if analysis.tendance == "AMELIORATION"
               else RED_HX if analysis.tendance == "DEGRADATION" else "64748B")
    ws[ws.max_row][1].font = Font(color=t_color)
    ws.append(["Conclusion", analysis.conclusion_generale])
    ws.append([])
    _headers(ws, ["Opportunités"])
    for opp in analysis.opportunites:
        ws.append([opp])
    ws.append([])
    _headers(ws, ["Risques"])
    for risk in analysis.risques:
        ws.append([risk])
    _autowidth(ws)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Celery task ────────────────────────────────────────────────────────────────

@celery_app.task(name="reports.generate", bind=True, time_limit=1800, soft_time_limit=1740)
def generate_report_task(self, rapport_id: int):
    from src.worker.graphs.report_graph import build_report_graph

    initial_state = None
    db = SessionLocal()
    try:
        rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
        if not rapport:
            logger.error("Rapport %s not found", rapport_id)
            return

        tenant = db.query(Tenant).filter(Tenant.id == rapport.tenant_id).first()
        if not tenant:
            rapport.statut = "ERREUR"
            db.commit()
            return

        # ── Crash recovery inside open session ───────────────────────────────
        # Use dict() to force deep-copy out of any SQLAlchemy MutableDict proxy
        existing_plan = None
        existing_analysis = None

        raw_plan = rapport.plan_data
        if raw_plan:
            try:
                existing_plan = ReportPlan.model_validate(dict(raw_plan))
                logger.info("Report %s: resuming — plan exists", rapport_id)
            except (ValidationError, Exception):
                pass

        raw_analysis = rapport.analysis_data
        if raw_analysis:
            try:
                existing_analysis = ReportAnalysis.model_validate(dict(raw_analysis))
                logger.info("Report %s: resuming — analysis exists", rapport_id)
            except (ValidationError, Exception):
                pass

        # ── Build initial state inside open session (no access after close) ──
        initial_state = {
            "rapport_id": rapport_id,
            "rapport_config": {
                "type":          str(rapport.type or ""),
                "format":        str(rapport.format or ""),
                "sections":      list(rapport.sections or []),
                "periode_debut": str(rapport.periode_debut) if rapport.periode_debut else None,
                "periode_fin":   str(rapport.periode_fin)   if rapport.periode_fin   else None,
                "titre":         str(rapport.titre or ""),
            },
            "tenant_context": {
                "id":            int(tenant.id),
                "nom":           str(tenant.nom_organisation or ""),
                "profil_client": str(tenant.profil_client or ""),
                "own_site_id":   tenant.own_site_id,   # int or None — already primitive
                "own_brand":     str(tenant.own_brand) if tenant.own_brand else None,
            },
            "plan":             existing_plan,
            "collected_data":   {},
            "tools_called":     [],
            "messages":         [],
            "analysis":         existing_analysis,
            "sections_written": {},
            "final_report":     None,
            "error":            None,
            "progression":      int(rapport.progression or 0),
        }

        rapport.statut = "EN_COURS"
        db.commit()

    except Exception:
        logger.exception("Report %s — setup failed", rapport_id)
        try:
            rapport = db.query(Rapport).filter(Rapport.id == rapport_id).first()
            if rapport:
                rapport.statut = "ERREUR"
                db.commit()
        except Exception:
            pass
        return
    finally:
        db.close()
        db = None   # graph nodes open their own sessions

    # ── Invoke graph (session is closed, initial_state has only primitives) ──
    try:
        graph  = build_report_graph()
        config = {"configurable": {"thread_id": str(rapport_id)}}
        logger.info("Report %s — invoking LangGraph pipeline", rapport_id)
        final_state = graph.invoke(initial_state, config=config)
        if final_state.get("error"):
            logger.error("Report %s — graph error: %s", rapport_id, final_state["error"])
    except Exception:
        logger.exception("Report %s — graph invocation failed", rapport_id)
        try:
            err_db = SessionLocal()
            r = err_db.query(Rapport).filter(Rapport.id == rapport_id).first()
            if r:
                r.statut = "ERREUR"
                r.progression = 0
                err_db.commit()
            err_db.close()
        except Exception:
            pass
        raise
