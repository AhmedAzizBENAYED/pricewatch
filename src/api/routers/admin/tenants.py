from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import (
    CategoryAssignItem, CategoryAssignRequest, CategoryAssignResult,
    TenantCreate, TenantDetail, TenantListItem,
    TenantOut, TenantStats, TenantUpdate, PaginationMeta,
)
from src.common.models import (
    Categorie, OffreNormalisee, Scrapper,
    Tenant, TenantCategorie, Utilisateur,
)

router = APIRouter(prefix="/tenants")


def _own_site_fields(tenant):
    return {
        "own_site_id":   tenant.own_site_id,
        "own_brand":     tenant.own_brand,
        "own_site_name": tenant.own_site.name       if tenant.own_site else None,
        "own_site_slug": tenant.own_site.scraper_id if tenant.own_site else None,
    }


def _compute_stats(db: Session, tenant_id: int) -> TenantStats:
    nb_users = (
        db.query(func.count(Utilisateur.id))
        .filter(Utilisateur.tenant_id == tenant_id)
        .scalar() or 0
    )
    nb_categories_assignees = (
        db.query(func.count(TenantCategorie.categorie_id))
        .filter(TenantCategorie.tenant_id == tenant_id)
        .scalar() or 0
    )
    offres_visibles = (
        db.query(func.count(OffreNormalisee.id))
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == tenant_id)
        .filter(OffreNormalisee.categorie_id.isnot(None))
        .scalar() or 0
    )
    last_scrape_at = (
        db.query(func.max(Scrapper.date_debut))
        .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
        .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
        .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
        .filter(TenantCategorie.tenant_id == tenant_id)
        .scalar()
    )
    return TenantStats(
        nb_users=nb_users,
        nb_categories_assignees=nb_categories_assignees,
        last_scrape_at=last_scrape_at,
        offres_visibles=offres_visibles,
    )


def _apply_filters(q, status: str | None, plan: str | None, search: str | None):
    if status == "active":
        q = q.filter(Tenant.est_actif == True)
    elif status == "inactive":
        q = q.filter(Tenant.est_actif == False)
    if plan:
        q = q.filter(Tenant.plan_abonnement == plan)
    if search:
        q = q.filter(Tenant.nom_organisation.ilike(f"%{search}%"))
    return q


@router.get("")
def list_tenants(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = Query(None),
    plan: str | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    nb_users_sq = (
        db.query(func.count(Utilisateur.id))
        .filter(Utilisateur.tenant_id == Tenant.id)
        .correlate(Tenant)
        .scalar_subquery()
        .label("nb_users")
    )
    nb_cats_sq = (
        db.query(func.count(TenantCategorie.categorie_id))
        .filter(TenantCategorie.tenant_id == Tenant.id)
        .correlate(Tenant)
        .scalar_subquery()
        .label("nb_categories_assignees")
    )

    base = db.query(Tenant, nb_users_sq, nb_cats_sq)
    base = _apply_filters(base, status, plan, q)

    total_q = _apply_filters(db.query(func.count(Tenant.id)), status, plan, q)
    total = total_q.scalar()

    rows = (
        base.order_by(Tenant.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = [
        TenantListItem(
            id=t.id,
            nom_organisation=t.nom_organisation,
            plan_abonnement=t.plan_abonnement,
            est_actif=t.est_actif,
            date_creation=t.date_creation,
            profil_client=t.profil_client,
            nb_users=nb_users or 0,
            nb_categories_assignees=nb_cats or 0,
        )
        for t, nb_users, nb_cats in rows
    ]

    return {
        "data": [item.model_dump() for item in data],
        "meta": PaginationMeta(
            total=total,
            page=page,
            limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TenantOut)
def create_tenant(
    body: TenantCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    tenant = Tenant(**body.model_dump())
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return TenantOut(
        id=tenant.id,
        nom_organisation=tenant.nom_organisation,
        plan_abonnement=tenant.plan_abonnement,
        est_actif=tenant.est_actif,
        date_creation=tenant.date_creation,
        profil_client=tenant.profil_client,
        **_own_site_fields(tenant),
    )


@router.get("/{tenant_id}", response_model=TenantDetail)
def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    stats = _compute_stats(db, tenant_id)
    return TenantDetail(
        id=tenant.id,
        nom_organisation=tenant.nom_organisation,
        plan_abonnement=tenant.plan_abonnement,
        est_actif=tenant.est_actif,
        date_creation=tenant.date_creation,
        profil_client=tenant.profil_client,
        stats=stats,
        **_own_site_fields(tenant),
    )


@router.put("/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: int,
    body: TenantUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return TenantOut(
        id=tenant.id,
        nom_organisation=tenant.nom_organisation,
        plan_abonnement=tenant.plan_abonnement,
        est_actif=tenant.est_actif,
        date_creation=tenant.date_creation,
        profil_client=tenant.profil_client,
        **_own_site_fields(tenant),
    )


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.est_actif = False
    db.commit()


@router.get("/{tenant_id}/stats", response_model=TenantStats)
def get_tenant_stats(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    if not db.query(Tenant).filter(Tenant.id == tenant_id).first():
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _compute_stats(db, tenant_id)


# ── Category assignment ───────────────────────────────────────────────────────

def _require_tenant(db: Session, tenant_id: int) -> None:
    if not db.query(Tenant).filter(Tenant.id == tenant_id).first():
        raise HTTPException(status_code=404, detail="Tenant not found")


def _category_list_query(db: Session, tenant_id: int, assigned: bool, q: str | None):
    nb_offres_sq = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.categorie_id == Categorie.id)
        .correlate(Categorie)
        .scalar_subquery()
        .label("nb_offres")
    )
    assigned_ids_sq = (
        db.query(TenantCategorie.categorie_id)
        .filter(TenantCategorie.tenant_id == tenant_id)
        .subquery()
    )
    base = db.query(Categorie, nb_offres_sq)
    if assigned:
        base = base.filter(Categorie.id.in_(db.query(TenantCategorie.categorie_id).filter(TenantCategorie.tenant_id == tenant_id)))
    else:
        base = base.filter(Categorie.id.notin_(assigned_ids_sq))
    if q:
        base = base.filter(Categorie.nom.ilike(f"%{q}%"))
    return base


@router.get("/{tenant_id}/categories/available")
def list_available_categories(
    tenant_id: int,
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)
    base = _category_list_query(db, tenant_id, assigned=False, q=q)
    total = base.with_entities(func.count(Categorie.id)).scalar()
    rows = base.order_by(Categorie.nom).offset((page - 1) * limit).limit(limit).all()
    data = [
        CategoryAssignItem(id=cat.id, nom=cat.nom, id_parent=cat.id_parent, nb_offres=nb or 0).model_dump()
        for cat, nb in rows
    ]
    return {
        "data": data,
        "meta": PaginationMeta(total=total, page=page, limit=limit, pages=ceil(total / limit) if total else 0).model_dump(),
    }


@router.get("/{tenant_id}/categories")
def list_tenant_categories(
    tenant_id: int,
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)
    base = _category_list_query(db, tenant_id, assigned=True, q=q)
    total = base.with_entities(func.count(Categorie.id)).scalar()
    rows = base.order_by(Categorie.nom).offset((page - 1) * limit).limit(limit).all()
    data = [
        CategoryAssignItem(id=cat.id, nom=cat.nom, id_parent=cat.id_parent, nb_offres=nb or 0).model_dump()
        for cat, nb in rows
    ]
    return {
        "data": data,
        "meta": PaginationMeta(total=total, page=page, limit=limit, pages=ceil(total / limit) if total else 0).model_dump(),
    }


@router.post("/{tenant_id}/categories")
def assign_categories(
    tenant_id: int,
    body: CategoryAssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    _require_tenant(db, tenant_id)

    existing_ids = {
        r[0] for r in db.query(Categorie.id).filter(Categorie.id.in_(body.categorie_ids)).all()
    }
    missing = set(body.categorie_ids) - existing_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"Categories not found: {sorted(missing)}")

    already_assigned = {
        r[0] for r in db.query(TenantCategorie.categorie_id)
        .filter(TenantCategorie.tenant_id == tenant_id)
        .filter(TenantCategorie.categorie_id.in_(body.categorie_ids))
        .all()
    }

    for cid in body.categorie_ids:
        if cid not in already_assigned:
            db.add(TenantCategorie(tenant_id=tenant_id, categorie_id=cid))

    db.commit()
    new_count = len(body.categorie_ids) - len(already_assigned)
    return CategoryAssignResult(assigned=new_count, skipped=len(already_assigned))


@router.delete("/{tenant_id}/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_category(
    tenant_id: int,
    cat_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    assignment = (
        db.query(TenantCategorie)
        .filter(TenantCategorie.tenant_id == tenant_id)
        .filter(TenantCategorie.categorie_id == cat_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(assignment)
    db.commit()
