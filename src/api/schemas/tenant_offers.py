from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class SnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    prix_original: float | None
    prix_en_promotion: float | None
    prix_unitaire: float | None
    stock_status: str | None
    date_debut_observation: datetime
    date_fin_observation: datetime | None
    nb_observations_identiques: int


class ScrapperShort(BaseModel):
    id: int
    date_debut: datetime | None
    statut: str | None


class OffreListItem(BaseModel):
    id: int
    nom: str | None
    marque: str | None
    image: str | None
    url_produit: str | None
    prix_original: float | None
    prix_en_promotion: float | None
    est_en_promotion: bool | None
    statut_stock: str | None
    score_qualite: float | None
    site_name: str | None
    categorie_nom: str | None
    produit_id: int | None


class OffreDetail(BaseModel):
    id: int
    nom: str | None
    marque: str | None
    prix_original: float | None
    prix_en_promotion: float | None
    prix_unitaire: float | None
    est_en_promotion: bool | None
    statut_stock: str | None
    image: str | None
    url_produit: str | None
    description: str | None
    score_qualite: float | None
    match_layer: str | None
    match_score: float | None
    produit_id: int | None
    specs_normalises: dict | None
    offre_brute: dict | None
    site_name: str | None
    site_slug: str | None
    categorie_nom: str | None
    scrapper: ScrapperShort | None
    snapshot_courant: SnapshotOut | None
    metriques: dict | None
    delta_absolu: float | None = None
    delta_pct: float | None = None
    prix_precedent: float | None = None


class OffreHistory(BaseModel):
    offre_id: int
    offre_nom: str | None
    site_name: str | None
    snapshots: list[SnapshotOut]
    total: int
