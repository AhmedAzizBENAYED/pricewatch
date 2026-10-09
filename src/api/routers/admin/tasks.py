from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.deps import require_role
from src.api.routers.admin.scrapers import VALID_SITE_IDS

router = APIRouter(prefix="/tasks")


class NormalizeRequest(BaseModel):
    site_id: str | None = None


class MatchRequest(BaseModel):
    site_id: str
    llm: bool = False


# ── /normalize and /match MUST be before /{task_id} ──────────────────────────

@router.post("/normalize")
def trigger_normalization(
    body: NormalizeRequest,
    current_user=Depends(require_role("ADMIN")),
):
    if body.site_id and body.site_id not in VALID_SITE_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"site_id invalide '{body.site_id}'. Valeurs acceptées: {sorted(VALID_SITE_IDS)}",
        )
    from src.scraper.tasks.normalization import batch_normalize_task
    task = batch_normalize_task.delay(site_id=body.site_id)
    return {"task_id": task.id, "site_id": body.site_id}


@router.post("/match")
def trigger_matching(
    body: MatchRequest,
    current_user=Depends(require_role("ADMIN")),
):
    if body.site_id not in VALID_SITE_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"site_id invalide '{body.site_id}'. Valeurs acceptées: {sorted(VALID_SITE_IDS)}",
        )
    from src.scraper.tasks.normalization import batch_match_task
    task = batch_match_task.delay(site_id=body.site_id, use_llm=body.llm)
    return {"task_id": task.id, "site_id": body.site_id, "use_llm": body.llm}


@router.get("/{task_id}")
def get_task_status(
    task_id: str,
    current_user=Depends(require_role("ADMIN")),
):
    from src.worker.worker import celery_app
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
