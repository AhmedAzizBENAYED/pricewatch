from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import (
    CategoryAdminDetail, CategoryAdminListItem, PaginationMeta, TenantAssignedItem,
)
from src.common.models import Categorie, OffreNormalisee, Tenant, TenantCategorie

router = APIRouter(prefix="/categories")


@router.get("")
def list_categories(
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    nb_offres_sq = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.categorie_id == Categorie.id)
        .correlate(Categorie)
        .scalar_subquery()
        .label("nb_offres")
    )
    nb_tenants_sq = (
        db.query(func.count(TenantCategorie.categorie_id))
        .filter(TenantCategorie.categorie_id == Categorie.id)
        .correlate(Categorie)
        .scalar_subquery()
        .label("nb_tenants")
    )

    base = db.query(Categorie, nb_offres_sq, nb_tenants_sq)
    if q:
        base = base.filter(Categorie.nom.ilike(f"%{q}%"))

    total = base.with_entities(func.count(Categorie.id)).scalar()
    rows = (
        base.order_by(Categorie.nom)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "data": [
            CategoryAdminListItem(
                id=cat.id,
                nom=cat.nom,
                id_parent=cat.id_parent,
                urls_par_site=cat.urls_par_site,
                nb_offres=nb_offres or 0,
                nb_tenants=nb_tenants or 0,
            ).model_dump()
            for cat, nb_offres, nb_tenants in rows
        ],
        "meta": PaginationMeta(
            total=total, page=page, limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


@router.get("/{category_id}")
def get_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    cat = db.query(Categorie).filter(Categorie.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    parent_nom = None
    if cat.id_parent:
        parent = db.query(Categorie).filter(Categorie.id == cat.id_parent).first()
        parent_nom = parent.nom if parent else None

    nb_offres = (
        db.query(func.count(OffreNormalisee.id))
        .filter(OffreNormalisee.categorie_id == category_id)
        .scalar() or 0
    )

    tc_rows = (
        db.query(TenantCategorie, Tenant.nom_organisation.label("tenant_nom"))
        .join(Tenant, Tenant.id == TenantCategorie.tenant_id)
        .filter(TenantCategorie.categorie_id == category_id)
        .all()
    )

    return CategoryAdminDetail(
        id=cat.id,
        nom=cat.nom,
        id_parent=cat.id_parent,
        parent_nom=parent_nom,
        urls_par_site=cat.urls_par_site,
        nb_offres=nb_offres,
        tenants_assignes=[
            TenantAssignedItem(tenant_id=tc.tenant_id, tenant_nom=tenant_nom)
            for tc, tenant_nom in tc_rows
        ],
    )