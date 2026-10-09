import re
from sqlalchemy import text


_MODEL_PATTERNS = [
    re.compile(r'\bCore\s+i[3579]-\d{4,5}[A-Z]*\b', re.I),
    re.compile(r'\bi[3579]-\d{4,5}[A-Z]*\b', re.I),
    re.compile(r'\bRyzen\s+\d+\s+\d{4}[A-Z]*\b', re.I),
    re.compile(r'\b(?:RTX|GTX)\s?\d{4}\s?(?:Ti|Super|OC)?\b', re.I),
    re.compile(r'\bRX\s?\d{4}\s?(?:XT|GRE)?\b', re.I),
    re.compile(r'\b[A-Z]{2,6}-?\d{3,}[A-Za-z0-9-]{0,10}\b'),
]


def _extract_model(nom: str, marque: str | None) -> str | None:
    if not nom:
        return None
    s = nom.strip()
    if marque:
        s = re.sub(r'^\s*' + re.escape(marque) + r'\s*', '', s, flags=re.I).strip()
    for pat in _MODEL_PATTERNS:
        m = pat.search(s)
        if m:
            return m.group().strip()
    return None


class SpecNormalizer:
    """Maps raw fiche_technique keys to canonical names using the cle_synonymes table."""

    def __init__(self, synonyms: dict[tuple, str]):
        self._syn = synonyms  # {(site_id, nom_site): canonical_nom}

    @classmethod
    def from_db(cls, db) -> "SpecNormalizer":
        rows = db.execute(text("""
            SELECT cs.site_id, cs.nom_site, cc.nom AS canonical
            FROM cle_synonymes cs
            JOIN caracteristique_cles cc ON cc.id = cs.cle_canonique_id
        """)).fetchall()
        return cls({(r.site_id, r.nom_site): r.canonical for r in rows})

    def normalize(self, site_id: str, fiche: dict, nom: str, marque: str | None) -> dict:
        spec: dict[str, str] = {}
        for key, value in fiche.items():
            canonical = self._syn.get((site_id, key))
            if canonical:
                spec[canonical] = value
        if "Modèle" not in spec:
            model = _extract_model(nom, marque)
            if model:
                spec["Modèle"] = model
        return spec
