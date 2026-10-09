from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class ReferentielInfo(BaseModel):
    id: int
    nom_produit: str
    marque: str | None
    description: str | None
    image: str | None
    categorie_nom: str | None


class ProduitListItem(BaseModel):
    id: int
    nom_produit: str
    marque: str | None
    image: str | None
    categorie_nom: str | None
    nb_sites: int
    prix_min: float | None
    prix_max: float | None
    prix_moyen: float | None


class OffreParSite(BaseModel):
    site_name: str | None
    site_slug: str | None
    offre_id: int
    prix_original: float | None
    prix_en_promotion: float | None
    est_en_promotion: bool | None
    statut_stock: str | None
    url_produit: str | None
    image: str | None
    score_qualite: float | None
    match_layer: str | None
    date_derniere_observation: datetime | None
    is_best_price: bool = False


class ProduitDetail(BaseModel):
    referentiel: ReferentielInfo
    offres_par_site: list[OffreParSite]
    prix_min: float | None
    prix_max: float | None
    prix_moyen: float | None
    ecart_absolu: float | None
    ecart_pct: float | None


class ComparisonSite(BaseModel):
    site_name: str | None
    site_slug: str | None
    offre_id: int
    prix_courant: float | None
    prix_promotion: float | None
    est_en_promotion: bool | None
    statut_stock: str | None
    ecart_vs_min_absolu: float | None
    ecart_vs_min_pct: float | None
    is_best_price: bool = False


class ProductComparison(BaseModel):
    produit_nom: str
    sites: list[ComparisonSite]
    prix_min: float | None
    prix_max: float | None
    prix_moyen: float | None


class PriceSeries(BaseModel):
    site_name: str | None
    site_slug: str | None
    prix: list[float | None]
    en_promo: list[bool | None]


class ProductHistory(BaseModel):
    produit_nom: str
    labels: list[str]
    series: list[PriceSeries]
