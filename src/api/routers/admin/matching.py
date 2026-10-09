import json
from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from src.api.deps import get_db, require_role
from src.api.schemas.admin import (
    BulkActionRequest, BulkActionResponse,
    CandidatDetail, CandidatListItem,
    CorrectRequest, CritereDetail,
    MatchingStats, OffreDetail, OffreShort,
    PaginationMeta, ReferentielDetail,
    RejectRequest, ValidateRequest,
)
from src.common.models import (
    Candidat, JournalAudit, OffreNormalisee, Referentiel, Scrapper, SiteSource,
)

router = APIRouter(prefix="/matching")

_OffreA = aliased(OffreNormalisee)
_OffreB = aliased(OffreNormalisee)
_ScrapperA = aliased(Scrapper)
_ScrapperB = aliased(Scrapper)
_SiteA = aliased(SiteSource)
_SiteB = aliased(SiteSource)


def _build_list_base(db: Session):
    return (
        db.query(
            Candidat,
            _OffreA.nom.label("a_nom"),
            _OffreA.marque.label("a_marque"),
            _SiteA.scraper_id.label("a_site"),
            _OffreA.image.label("a_image"),
            _OffreA.url_produit.label("a_url"),
            _OffreB.nom.label("b_nom"),
            _OffreB.marque.label("b_marque"),
            _SiteB.scraper_id.label("b_site"),
            _OffreB.image.label("b_image"),
            _OffreB.url_produit.label("b_url"),
        )
        .join(_OffreA, _OffreA.id == Candidat.offre_a_id)
        .join(_OffreB, _OffreB.id == Candidat.offre_b_id)
        .outerjoin(_ScrapperA, _ScrapperA.id == _OffreA.scraper_id)
        .outerjoin(_SiteA, _SiteA.id == _ScrapperA.site_source_id)
        .outerjoin(_ScrapperB, _ScrapperB.id == _OffreB.scraper_id)
        .outerjoin(_SiteB, _SiteB.id == _ScrapperB.site_source_id)
    )


def _load_offre_detail(db: Session, offre_id: int) -> OffreDetail:
    row = (
        db.query(OffreNormalisee, SiteSource.scraper_id.label("site_slug"))
        .outerjoin(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
        .outerjoin(SiteSource, SiteSource.id == Scrapper.site_source_id)
        .filter(OffreNormalisee.id == offre_id)
        .first()
    )
    if not row:
        return OffreDetail(
            id=offre_id, nom=None, marque=None, prix_original=None,
            prix_en_promotion=None, est_en_promotion=None,
            statut_stock=None, image=None, url_produit=None,
            site_id=None, specs_normalises=None,
        )
    offre, site_slug = row
    return OffreDetail(
        id=offre.id,
        nom=offre.nom,
        marque=offre.marque,
        prix_original=float(offre.prix_original) if offre.prix_original is not None else None,
        prix_en_promotion=float(offre.prix_en_promotion) if offre.prix_en_promotion is not None else None,
        est_en_promotion=offre.est_en_promotion,
        statut_stock=offre.statut_stock,
        image=offre.image,
        url_produit=offre.url_produit,
        site_id=site_slug,
        specs_normalises=offre.specs_normalises,
    )


def _parse_criteres(commentaire: str | None) -> tuple[list[CritereDetail], str | None]:
    if not commentaire:
        return [], None
    try:
        data = json.loads(commentaire)
    except (json.JSONDecodeError, TypeError):
        return [], None
    criteres = []
    for key, label in [("s_model", "model"), ("s_spec", "spec"), ("s_name", "name")]:
        val = data.get(key)
        if val is not None:
            detail = None
            if key == "s_model":
                om, rm = data.get("offer_models"), data.get("ref_models")
                if om or rm:
                    detail = f"offer={om} ref={rm}"
            criteres.append(CritereDetail(critere=label, score=float(val), detail=detail))
    return criteres, data.get("justification")


# ── 1. Stats ──────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_matching_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    rows = db.query(Candidat.statut, func.count(Candidat.id)).group_by(Candidat.statut).all()
    counts = {r[0]: r[1] for r in rows}
    avg = db.query(func.avg(Candidat.score_confluence)).scalar()
    return MatchingStats(
        total=sum(counts.values()),
        incertain=counts.get("INCERTAIN", 0),
        valide=counts.get("VALIDE", 0),
        rejete=counts.get("REJETE", 0),
        avg_score=float(avg) if avg is not None else None,
    )


# ── 2. Bulk action (MUST be before /{id}) ─────────────────────────────────────

@router.post("/candidates/bulk")
def bulk_action(
    body: BulkActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    if body.action not in ("validate", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'validate' or 'reject'")
    if not body.ids:
        raise HTTPException(status_code=400, detail="ids must not be empty")

    new_statut = "VALIDE" if body.action == "validate" else "REJETE"
    action_label = "CANDIDAT_VALIDE" if body.action == "validate" else "CANDIDAT_REJETE"
    now = datetime.now(timezone.utc)

    candidates = (
        db.query(Candidat)
        .filter(Candidat.id.in_(body.ids))
        .filter(Candidat.statut == "INCERTAIN")
        .all()
    )
    updated_ids = []
    for c in candidates:
        c.statut = new_statut
        c.id_validateur = None
        c.date_validation = now
        if body.action == "validate" and c.referentiel_id:
            db.query(OffreNormalisee).filter(
                OffreNormalisee.id.in_([c.offre_a_id, c.offre_b_id])
            ).update({"produit_id": c.referentiel_id}, synchronize_session=False)
        updated_ids.append(c.id)

    if updated_ids:
        db.add(JournalAudit(
            id_utilisateur=None,
            action=action_label,
            valeurs_avant={"statut": "INCERTAIN"},
            valeurs_apres={"statut": new_statut, "ids": updated_ids},
        ))
        db.commit()

    return BulkActionResponse(updated=len(updated_ids), ids=updated_ids)


# ── 3. List candidates ────────────────────────────────────────────────────────

@router.get("/candidates")
def list_candidates(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    statut: str | None = Query(None),
    site_id: str | None = Query(None),
    score_min: float | None = Query(None),
    score_max: float | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    base = _build_list_base(db)

    if statut:
        base = base.filter(Candidat.statut == statut)
    if score_min is not None:
        base = base.filter(Candidat.score_confluence >= score_min)
    if score_max is not None:
        base = base.filter(Candidat.score_confluence <= score_max)
    if site_id:
        base = base.filter(
            (_SiteA.scraper_id == site_id) | (_SiteB.scraper_id == site_id)
        )

    total = base.with_entities(func.count(Candidat.id)).scalar()
    rows = (
        base.order_by(Candidat.score_confluence.desc().nullslast())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = [
        CandidatListItem(
            id=c.id,
            offre_a=OffreShort(id=c.offre_a_id, nom=a_nom, marque=a_marque, site_id=a_site, image=a_image, url_produit=a_url),
            offre_b=OffreShort(id=c.offre_b_id, nom=b_nom, marque=b_marque, site_id=b_site, image=b_image, url_produit=b_url),
            score_confluence=c.score_confluence,
            statut=c.statut,
            date_proposition=c.date_proposition,
        ).model_dump()
        for c, a_nom, a_marque, a_site, a_image, a_url, b_nom, b_marque, b_site, b_image, b_url in rows
    ]

    return {
        "data": data,
        "meta": PaginationMeta(
            total=total,
            page=page,
            limit=limit,
            pages=ceil(total / limit) if total else 0,
        ).model_dump(),
    }


# ── 4. Get one candidate ──────────────────────────────────────────────────────

@router.get("/candidates/{candidat_id}")
def get_candidate(
    candidat_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    candidat = db.query(Candidat).filter(Candidat.id == candidat_id).first()
    if not candidat:
        raise HTTPException(status_code=404, detail="Candidat not found")

    offre_a = _load_offre_detail(db, candidat.offre_a_id)
    offre_b = _load_offre_detail(db, candidat.offre_b_id)

    ref_detail = None
    if candidat.referentiel_id:
        ref = db.query(Referentiel).filter(Referentiel.id == candidat.referentiel_id).first()
        if ref:
            ref_detail = ReferentielDetail(
                id=ref.id,
                nom_produit=ref.nom_produit,
                marque=ref.marque,
                image=ref.image,
                categorie_id=ref.categorie_id,
                offre_ids=ref.offre_ids or [],
            )

    criteres, justification = _parse_criteres(candidat.commentaire)

    return CandidatDetail(
        id=candidat.id,
        offre_a=offre_a,
        offre_b=offre_b,
        referentiel=ref_detail,
        score_confluence=candidat.score_confluence,
        statut=candidat.statut,
        date_proposition=candidat.date_proposition,
        date_validation=candidat.date_validation,
        criteres=criteres,
        justification=justification,
    )


# ── 5. Validate ───────────────────────────────────────────────────────────────

@router.post("/candidates/{candidat_id}/validate")
def validate_candidate(
    candidat_id: int,
    body: ValidateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    candidat = db.query(Candidat).filter(Candidat.id == candidat_id).first()
    if not candidat:
        raise HTTPException(status_code=404, detail="Candidat not found")
    if candidat.statut == "VALIDE":
        raise HTTPException(status_code=400, detail="Candidat already validated")

    ref_id = body.referentiel_id or candidat.referentiel_id
    if not ref_id:
        offre_a = db.query(OffreNormalisee).filter(OffreNormalisee.id == candidat.offre_a_id).first()
        ref = Referentiel(
            nom_produit=offre_a.nom if offre_a and offre_a.nom else f"Produit #{candidat.offre_a_id}",
            marque=offre_a.marque if offre_a else None,
            image=offre_a.image if offre_a else None,
            categorie_id=offre_a.categorie_id if offre_a else None,
            offre_ids=[candidat.offre_a_id, candidat.offre_b_id],
        )
        db.add(ref)
        db.flush()
        ref_id = ref.id

    old_statut = candidat.statut
    candidat.statut = "VALIDE"
    candidat.referentiel_id = ref_id
    candidat.id_validateur = None
    candidat.date_validation = datetime.now(timezone.utc)

    db.query(OffreNormalisee).filter(
        OffreNormalisee.id.in_([candidat.offre_a_id, candidat.offre_b_id])
    ).update({"produit_id": ref_id}, synchronize_session=False)

    db.add(JournalAudit(
        id_utilisateur=None,
        action="CANDIDAT_VALIDE",
        valeurs_avant={"statut": old_statut, "candidat_id": candidat_id},
        valeurs_apres={"statut": "VALIDE", "referentiel_id": ref_id},
    ))
    db.commit()
    return {"id": candidat_id, "statut": "VALIDE", "referentiel_id": ref_id}


# ── 6. Reject ─────────────────────────────────────────────────────────────────

@router.post("/candidates/{candidat_id}/reject")
def reject_candidate(
    candidat_id: int,
    body: RejectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    candidat = db.query(Candidat).filter(Candidat.id == candidat_id).first()
    if not candidat:
        raise HTTPException(status_code=404, detail="Candidat not found")
    if candidat.statut == "REJETE":
        raise HTTPException(status_code=400, detail="Candidat already rejected")

    old_statut = candidat.statut
    candidat.statut = "REJETE"
    candidat.id_validateur = None
    candidat.date_validation = datetime.now(timezone.utc)

    db.add(JournalAudit(
        id_utilisateur=None,
        action="CANDIDAT_REJETE",
        valeurs_avant={"statut": old_statut, "candidat_id": candidat_id},
        valeurs_apres={"statut": "REJETE"},
    ))
    db.commit()
    return {"id": candidat_id, "statut": "REJETE"}


# ── 7. Correct ────────────────────────────────────────────────────────────────

@router.patch("/candidates/{candidat_id}/correct")
def correct_candidate(
    candidat_id: int,
    body: CorrectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN")),
):
    candidat = db.query(Candidat).filter(Candidat.id == candidat_id).first()
    if not candidat:
        raise HTTPException(status_code=404, detail="Candidat not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if body.referentiel_id is not None:
        ref = db.query(Referentiel).filter(Referentiel.id == body.referentiel_id).first()
        if not ref:
            raise HTTPException(status_code=404, detail="Referentiel not found")
        candidat.referentiel_id = body.referentiel_id
    if body.score_confluence is not None:
        candidat.score_confluence = body.score_confluence

    db.add(JournalAudit(
        id_utilisateur=None,
        action="CANDIDAT_CORRIGE",
        valeurs_avant={"candidat_id": candidat_id},
        valeurs_apres=updates,
    ))
    db.commit()
    return {"id": candidat_id, "updated": updates}
