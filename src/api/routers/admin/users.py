import bcrypt
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import PaginationMeta, UserCreate, UserOut, UserUpdate
from src.common.models import JournalAudit, Tenant, Utilisateur

router = APIRouter(prefix="/tenants")

_VALID_ROLES = {"MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING"}


def _require_tenant(db: Session, tenant_id: int) -> Tenant:
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return t


def _require_user(db: Session, tenant_id: int, user_id: int) -> Utilisateur:
    u = db.query(Utilisateur).filter(
        Utilisateur.id == user_id,
        Utilisateur.tenant_id == tenant_id,
    ).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u


@router.get("/{tenant_id}/users")
def list_users(
    tenant_id: int,
    role: str | None = Query(None),
    est_actif: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)

    base = db.query(Utilisateur).filter(Utilisateur.tenant_id == tenant_id)
    if role:
        base = base.filter(Utilisateur.role == role)
    if est_actif is not None:
        base = base.filter(Utilisateur.est_actif == est_actif)

    total = base.with_entities(func.count(Utilisateur.id)).scalar()
    users = (
        base.order_by(Utilisateur.nom)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "data": [UserOut.model_validate(u).model_dump() for u in users],
        "meta": PaginationMeta(
            total=total, page=page, limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


@router.post("/{tenant_id}/users", status_code=201)
def create_user(
    tenant_id: int,
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)
    if body.role not in _VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {sorted(_VALID_ROLES)}")

    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user = Utilisateur(
        tenant_id=tenant_id,
        nom=body.nom,
        email=body.email,
        role=body.role,
        password_hash=pw_hash,
        est_actif=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists")

    db.add(JournalAudit(
        action="USER_CREATED",
        valeurs_apres={"tenant_id": tenant_id, "email": body.email, "role": body.role},
    ))
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/{tenant_id}/users/{user_id}")
def get_user(
    tenant_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)
    user = _require_user(db, tenant_id, user_id)
    return UserOut.model_validate(user)


@router.put("/{tenant_id}/users/{user_id}")
def update_user(
    tenant_id: int,
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)
    user = _require_user(db, tenant_id, user_id)

    before = {"nom": user.nom, "role": user.role, "est_actif": user.est_actif}
    if body.nom is not None:
        user.nom = body.nom
    if body.role is not None:
        if body.role not in _VALID_ROLES:
            raise HTTPException(status_code=422, detail=f"role must be one of {sorted(_VALID_ROLES)}")
        user.role = body.role
    if body.est_actif is not None:
        user.est_actif = body.est_actif
    if body.password is not None:
        user.password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

    after = {"nom": user.nom, "role": user.role, "est_actif": user.est_actif}
    db.add(JournalAudit(
        action="USER_UPDATED",
        valeurs_avant=before,
        valeurs_apres=after,
    ))
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/{tenant_id}/users/{user_id}/deactivate", status_code=204)
def deactivate_user(
    tenant_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)
    user = _require_user(db, tenant_id, user_id)
    user.est_actif = False
    db.add(JournalAudit(
        action="USER_DEACTIVATED",
        valeurs_avant={"user_id": user_id, "est_actif": True},
        valeurs_apres={"user_id": user_id, "est_actif": False},
    ))
    db.commit()
    return Response(status_code=204)