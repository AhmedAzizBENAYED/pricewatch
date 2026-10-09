from dataclasses import dataclass, field
from typing import Optional, List
from datetime import datetime, timezone


@dataclass
class CategoryUrl:
    url: str
    name: str
    site_id: str


@dataclass
class ProductUrl:
    url: str
    category_url: str
    site_id: str
    image_url: Optional[str] = None
    stock_status: Optional[str] = None

@dataclass
class CategoryPageResult:
    products: List[ProductUrl]
    next_url: Optional[str] = None


@dataclass
class RawOffer:
    site_id: str
    product_url: str
    category_url: str
    nom: Optional[str]
    prix_original: Optional[float]
    prix_en_promotion: Optional[float]
    prix_unitaire: Optional[float]
    devise: str
    est_en_promotion: bool
    statut_stock: str
    image_url: Optional[str]
    description: Optional[str]
    offre_brute: dict
    scraped_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))