import re
from sqlalchemy import text


_MARQUE_KEYS = {
    "marque", "brand", "fabricant", "constructeur",
    "marqueproduit", "marquedelarticle",
}


def _norm_key(k: str) -> str:
    return re.sub(r"[\s:·\-'’]+", "", k).lower()


def _norm_brand(b: str) -> str:
    return re.sub(r"\s+", " ", b).strip().lower()


class BrandExtractor:
    """Resolves product brand from fiche_technique or product name."""

    def __init__(self, lookup: dict[str, str], sorted_brands: list[tuple[str, str]]):
        self._lookup = lookup            # {normalized_name: canonical_name}
        self._sorted = sorted_brands     # [(normalized_name, canonical_name)] longest-first

    @classmethod
    def from_db(cls, db) -> "BrandExtractor":
        rows = db.execute(text(
            "SELECT nom FROM marques WHERE est_actif = true ORDER BY length(nom) DESC, nom"
        )).fetchall()
        lookup: dict[str, str] = {}
        sorted_brands: list[tuple[str, str]] = []
        for row in rows:
            norm = _norm_brand(row.nom)
            lookup[norm] = row.nom
            sorted_brands.append((norm, row.nom))
        return cls(lookup, sorted_brands)

    def extract(self, fiche: dict, nom: str) -> str | None:
        brand = self._from_fiche(fiche)
        if not brand and nom:
            brand = self._from_name(nom)
        return brand

    def _from_fiche(self, fiche: dict) -> str | None:
        for raw_key, value in fiche.items():
            if _norm_key(raw_key) not in _MARQUE_KEYS:
                continue
            value = (value or "").strip()
            if not value:
                continue
            # Return canonical name if known, else the raw value
            return self._lookup.get(_norm_brand(value), value)
        return None

    def _from_name(self, nom: str) -> str | None:
        nom_lower = nom.lower()
        for norm_name, canonical in self._sorted:
            pat = r"(?:^|\s)" + re.escape(norm_name) + r"(?:\s|$|[^a-z0-9])"
            if re.search(pat, nom_lower):
                return canonical
        return None
