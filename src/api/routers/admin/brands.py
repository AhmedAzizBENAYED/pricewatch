from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_role
from src.api.schemas.admin import BrandCreate, BrandOut, BrandUpdate, PaginationMeta
from src.common.models import Marque, OffreNormalisee

router = APIRouter(prefix="/brands")


def _nb_offres_for(db: Session, nom: str) -> int:
    return (
        db.query(func.count(OffreNormalisee.id))
        .filter(func.lower(OffreNormalisee.marque) == nom.lower())
        .scalar() or 0
    )


@router.get("")
def list_brands(
    q: str | None = Query(None),
    est_actif: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    nb_offres_sq = (
        db.query(func.count(OffreNormalisee.id))
        .filter(func.lower(OffreNormalisee.marque) == func.lower(Marque.nom))
        .correlate(Marque)
        .scalar_subquery()
        .label("nb_offres")
    )

    base = db.query(Marque, nb_offres_sq)
    if q:
        base = base.filter(Marque.nom.ilike(f"%{q}%"))
    if est_actif is not None:
        base = base.filter(Marque.est_actif == est_actif)

    total = base.with_entities(func.count(Marque.id)).scalar()
    rows = (
        base.order_by(Marque.nom)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "data": [
            BrandOut(id=m.id, nom=m.nom, est_actif=m.est_actif, nb_offres=nb_offres or 0).model_dump()
            for m, nb_offres in rows
        ],
        "meta": PaginationMeta(
            total=total, page=page, limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


@router.post("", status_code=201)
def create_brand(
    body: BrandCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    brand = Marque(nom=body.nom, est_actif=True)
    db.add(brand)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Brand name already exists")
    db.commit()
    db.refresh(brand)
    return BrandOut(id=brand.id, nom=brand.nom, est_actif=brand.est_actif, nb_offres=0)


@router.put("/{brand_id}")
def update_brand(
    brand_id: int,
    body: BrandUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    brand = db.query(Marque).filter(Marque.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    if body.nom is not None:
        brand.nom = body.nom
    if body.est_actif is not None:
        brand.est_actif = body.est_actif

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Brand name already exists")

    db.commit()
    db.refresh(brand)
    return BrandOut(
        id=brand.id,
        nom=brand.nom,
        est_actif=brand.est_actif,
        nb_offres=_nb_offres_for(db, brand.nom),
    )