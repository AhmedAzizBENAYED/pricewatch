from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.common.models import Alerte, Evenement, Notification, Tenant, Utilisateur

router = APIRouter(prefix="/alert-rules")

_ROLES = ("RESP_MARKETING", "MANAGER")
_WRITE_ROLES = ("RESP_MARKETING",)

_PLAN_RULE_QUOTA = {"BASIC": 5, "MEDIUM": 20, "PREMIUM": None}


def _check_ownership(alerte: Optional[Alerte], tenant_id: int) -> None:
    if alerte is None or alerte.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Rule not found")


def _serialize(alerte: Alerte, nb: int) -> dict:
    return {
        "id":                    alerte.id,
        "type_evenement":        alerte.type_evenement,
        "description":           alerte.description,
        "liste_categories":      alerte.liste_categories or [],
        "periode_surveillance":  alerte.periode_surveillance,
        "alert":                 alerte.alert,
        "id_utilisateur":        alerte.id_utilisateur,
        "nb_declenchements":     nb,
        "seuil":                 alerte.seuil,
    }


def _batch_counts(db: Session, tenant_id: int) -> dict[str, int]:
    """One query: notification count per event type for the tenant over last 30 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    user_ids_sq = (
        db.query(Utilisateur.id)
        .filter(Utilisateur.tenant_id == tenant_id)
        .subquery()
    )

    rows = (
        db.query(
            Evenement.type_evenement,
            func.count(Notification.id).label("nb"),
        )
        .join(Evenement, Evenement.id == Notification.evenement_id)
        .filter(
            Notification.id_utilisateur.in_(user_ids_sq),
            Notification.date_creation >= cutoff,
        )
        .group_by(Evenement.type_evenement)
        .all()
    )
    return {r.type_evenement: r.nb for r in rows}


# ── Schemas ───────────────────────────────────────────────────────────────────

class AlertRuleIn(BaseModel):
    type_evenement:       str
    description:          str
    liste_categories:     list = []
    periode_surveillance: str  = "IMMEDIATE"
    seuil:                Optional[int] = None
    alert:                bool = True


class ToggleIn(BaseModel):
    active: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def get_alert_rules(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    tenant_id = current_user.tenant_id
    rules = (
        db.query(Alerte)
        .filter(Alerte.tenant_id == tenant_id)
        .order_by(Alerte.id.desc())
        .all()
    )
    counts = _batch_counts(db, tenant_id)
    return [_serialize(r, counts.get(r.type_evenement, 0)) for r in rules]


@router.post("", status_code=201)
def create_alert_rule(
    body: AlertRuleIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_WRITE_ROLES)),
):
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    quota = _PLAN_RULE_QUOTA.get(tenant.plan_abonnement if tenant else "BASIC", 5)
    if quota is not None:
        nb_rules = (
            db.query(func.count(Alerte.id))
            .filter(Alerte.tenant_id == current_user.tenant_id)
            .scalar() or 0
        )
        if nb_rules >= quota:
            raise HTTPException(
                status_code=403,
                detail=f"Quota de règles atteint ({quota} max pour le plan {tenant.plan_abonnement if tenant else 'BASIC'})",
            )

    alerte = Alerte(
        tenant_id=current_user.tenant_id,
        id_utilisateur=current_user.id,
        type_evenement=body.type_evenement,
        description=body.description,
        liste_categories=body.liste_categories,
        periode_surveillance=body.periode_surveillance,
        seuil=body.seuil,
        alert=body.alert,
    )
    db.add(alerte)
    db.commit()
    db.refresh(alerte)
    return _serialize(alerte, 0)


@router.put("/{rule_id}")
def update_alert_rule(
    rule_id: int,
    body: AlertRuleIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_WRITE_ROLES)),
):
    alerte = db.query(Alerte).filter(Alerte.id == rule_id).first()
    _check_ownership(alerte, current_user.tenant_id)

    alerte.type_evenement       = body.type_evenement
    alerte.description          = body.description
    alerte.liste_categories     = body.liste_categories
    alerte.periode_surveillance = body.periode_surveillance
    alerte.seuil                = body.seuil
    alerte.alert                = body.alert

    db.commit()
    db.refresh(alerte)
    counts = _batch_counts(db, current_user.tenant_id)
    return _serialize(alerte, counts.get(alerte.type_evenement, 0))


@router.delete("/{rule_id}", status_code=204)
def delete_alert_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_WRITE_ROLES)),
):
    alerte = db.query(Alerte).filter(Alerte.id == rule_id).first()
    _check_ownership(alerte, current_user.tenant_id)
    db.delete(alerte)
    db.commit()


@router.patch("/{rule_id}/toggle")
def toggle_alert_rule(
    rule_id: int,
    body: ToggleIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_WRITE_ROLES)),
):
    alerte = db.query(Alerte).filter(Alerte.id == rule_id).first()
    _check_ownership(alerte, current_user.tenant_id)
    alerte.alert = body.active
    db.commit()
    return {"id": alerte.id, "alert": alerte.alert}
