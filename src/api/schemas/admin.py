from __future__ import annotations
import re
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_VALID_PROFILS = ("SITE_ECOMMERCE", "MARQUE")


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int
    pages: int


# ── Tenant ───────────────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    nom_organisation: str
    plan_abonnement: Literal["BASIC", "MEDIUM", "PREMIUM"] = "BASIC"
    est_actif: bool = True
    profil_client: Literal["SITE_ECOMMERCE", "MARQUE"] = "SITE_ECOMMERCE"
    own_site_id: Optional[int] = None
    own_brand: Optional[str] = None


class TenantUpdate(BaseModel):
    nom_organisation: str | None = None
    plan_abonnement: Literal["BASIC", "MEDIUM", "PREMIUM"] | None = None
    est_actif: bool | None = None
    profil_client: Literal["SITE_ECOMMERCE", "MARQUE"] | None = None
    own_site_id: Optional[int] = None
    own_brand: Optional[str] = None


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nom_organisation: str
    plan_abonnement: str | None
    est_actif: bool | None
    date_creation: datetime | None
    profil_client: str
    own_site_id: Optional[int] = None
    own_brand: Optional[str] = None
    own_site_name: Optional[str] = None
    own_site_slug: Optional[str] = None


class TenantListItem(BaseModel):
    id: int
    nom_organisation: str
    plan_abonnement: str | None
    est_actif: bool | None
    date_creation: datetime | None
    profil_client: str
    nb_users: int
    nb_categories_assignees: int


class TenantStats(BaseModel):
    nb_users: int
    nb_categories_assignees: int
    last_scrape_at: datetime | None
    offres_visibles: int


class TenantDetail(BaseModel):
    id: int
    nom_organisation: str
    plan_abonnement: str | None
    est_actif: bool | None
    date_creation: datetime | None
    profil_client: str
    own_site_id: Optional[int] = None
    own_brand: Optional[str] = None
    own_site_name: Optional[str] = None
    own_site_slug: Optional[str] = None
    stats: TenantStats


# ── Category assignment ───────────────────────────────────────────────────────

class CategoryAssignItem(BaseModel):
    id: int
    nom: str
    id_parent: int | None
    nb_offres: int


class CategoryAssignRequest(BaseModel):
    categorie_ids: list[int]


class CategoryAssignResult(BaseModel):
    assigned: int
    skipped: int


# ── Scrapper ─────────────────────────────────────────────────────────────────

class ScrapperListItem(BaseModel):
    id: int
    site_source_id: int | None
    site_name: str | None
    statut: str | None
    date_debut: datetime | None
    date_fin: datetime | None
    offres_collectees: int
    duree_secondes: int | None


class CategoryStatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_url: str
    products_found: int
    page_number: int
    duration_ms: float | None


class ScrapperDetail(BaseModel):
    id: int
    site_source_id: int | None
    site_name: str | None
    statut: str | None
    date_debut: datetime | None
    date_fin: datetime | None
    offres_collectees: int
    duree_secondes: int | None
    category_stats: list[CategoryStatOut]


class SiteStatsOut(BaseModel):
    site_id: str | None
    site_name: str | None
    total_runs: int
    successful: int
    failed: int
    avg_offres_per_run: float
    last_run_at: datetime | None


# ── Matching ──────────────────────────────────────────────────────────────────

class MatchingStats(BaseModel):
    total: int
    incertain: int
    valide: int
    rejete: int
    avg_score: float | None


class OffreShort(BaseModel):
    id: int
    nom: str | None
    marque: str | None
    site_id: str | None
    image: str | None = None
    url_produit: str | None = None


class OffreDetail(BaseModel):
    id: int
    nom: str | None
    marque: str | None
    prix_original: float | None
    prix_en_promotion: float | None
    est_en_promotion: bool | None
    statut_stock: str | None
    image: str | None
    url_produit: str | None
    site_id: str | None
    specs_normalises: dict | None


class ReferentielDetail(BaseModel):
    id: int
    nom_produit: str
    marque: str | None
    image: str | None
    categorie_id: int | None
    offre_ids: list[int]


class CritereDetail(BaseModel):
    critere: str
    score: float | None
    detail: str | None


class CandidatListItem(BaseModel):
    id: int
    offre_a: OffreShort
    offre_b: OffreShort
    score_confluence: float | None
    statut: str | None
    date_proposition: datetime | None


class CandidatDetail(BaseModel):
    id: int
    offre_a: OffreDetail
    offre_b: OffreDetail
    referentiel: ReferentielDetail | None
    score_confluence: float | None
    statut: str | None
    date_proposition: datetime | None
    date_validation: datetime | None
    criteres: list[CritereDetail]
    justification: str | None


class BulkActionRequest(BaseModel):
    ids: list[int]
    action: str  # "validate" | "reject"


class BulkActionResponse(BaseModel):
    updated: int
    ids: list[int]


class ValidateRequest(BaseModel):
    referentiel_id: int | None = None


class RejectRequest(BaseModel):
    reason: str | None = None


class CorrectRequest(BaseModel):
    referentiel_id: int | None = None
    score_confluence: float | None = None


# ── Platform stats (Phase 5) ──────────────────────────────────────────────────

class PlatformStats(BaseModel):
    nb_tenants: int
    nb_tenants_actifs: int
    nb_utilisateurs: int
    nb_offres: int
    nb_referentiels: int
    nb_candidats: int
    nb_scrappers: int
    nb_scrappers_en_cours: int
    scrapers_echoue_24h: int


# SiteStatsOut already defined above — reused for /stats/scraping


class MatchingPipelineStats(BaseModel):
    total_candidats: int
    incertain: int
    valide: int
    rejete: int
    avg_score: float | None
    taux_validation_auto_pct: float | None
    taux_validation_humaine_pct: float | None
    offres_matchees: int
    offres_non_matchees: int


class TenantActivityItem(BaseModel):
    tenant_id: int
    nom_organisation: str
    profil_client: str
    nb_users: int
    nb_categories: int
    nb_offres: int
    last_scrape_at: datetime | None


# ── Audit (Phase 5) ───────────────────────────────────────────────────────────

class AuditListItem(BaseModel):
    id: str
    action: str | None
    id_utilisateur: int | None
    utilisateur_nom: str | None
    horodatage: datetime | None


class AuditDetail(BaseModel):
    id: str
    action: str | None
    id_utilisateur: int | None
    utilisateur_nom: str | None
    valeurs_avant: dict | None
    valeurs_apres: dict | None
    horodatage: datetime | None


# ── Sources (Phase 6) ─────────────────────────────────────────────────────────

class ScrapperRunShort(BaseModel):
    id: int
    statut: str | None
    date_debut: datetime | None
    date_fin: datetime | None
    offres_collectees: int
    duree_secondes: int | None


class SiteSourceListItem(BaseModel):
    id: int
    url: str
    name: str
    est_actif: bool | None
    scraper_id: str | None
    nb_offres: int
    last_scrape_at: datetime | None


class SiteSourceDetail(BaseModel):
    id: int
    url: str
    name: str
    est_actif: bool | None
    scraper_id: str | None
    nb_offres: int
    last_scrape_at: datetime | None
    recent_runs: list[ScrapperRunShort]


# ── Users (Phase 6) ───────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    nom: str
    email: str
    password: str
    role: Literal["MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING"]

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v):
            raise ValueError("Format d'email invalide")
        return v.lower()


class UserUpdate(BaseModel):
    nom: str | None = None
    role: Literal["MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING"] | None = None
    est_actif: bool | None = None
    password: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("Le mot de passe doit comporter au moins 8 caractères")
        return v


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    nom: str
    email: str
    role: str | None
    est_actif: bool


# ── Brands (Phase 6) ──────────────────────────────────────────────────────────

class BrandCreate(BaseModel):
    nom: str


class BrandUpdate(BaseModel):
    nom: str | None = None
    est_actif: bool | None = None


class BrandOut(BaseModel):
    id: int
    nom: str
    est_actif: bool
    nb_offres: int


# ── Categories admin (Phase 6) ────────────────────────────────────────────────

class CategoryAdminListItem(BaseModel):
    id: int
    nom: str
    id_parent: int | None
    urls_par_site: dict | None
    nb_offres: int
    nb_tenants: int


class TenantAssignedItem(BaseModel):
    tenant_id: int
    tenant_nom: str


class CategoryAdminDetail(BaseModel):
    id: int
    nom: str
    id_parent: int | None
    parent_nom: str | None
    urls_par_site: dict | None
    nb_offres: int
    tenants_assignes: list[TenantAssignedItem]
