"""
value_normalizer.py — canonicalize spec values so "8 Go" == "8GB" == "8go".

The single biggest source of false NEGATIVES in spec scoring is unit / format
drift between sites: Mytek writes "8 Go", Tunisianet "8GB", Spacenet "8 GB".
Without canonicalization those three count as a CONFLICT instead of a MATCH,
dragging s_spec down and pushing real matches into the REVIEW/NO_MATCH bucket.

normalize_spec_value(key, raw_value) returns a canonical lowercase token:

    memory / storage : 8 Go | 8GB | 8 GB | 8go      -> "8gb"
                       1 To | 1TB | 1000 Go         -> "1tb"
    frequency        : 2,5 GHz | 2.5GHz | 2500 MHz  -> "2.5ghz"
    screen size      : 15,6 pouces | 15.6" | 15.6in -> "15.6in"
    resolution       : 1920x1080 | 1920 x 1080 | Full HD -> "1920x1080"
    generic          : lowercase, trimmed, comma-decimal -> dot

Pure function, no side effects. Used by the spec-scoring step (both sides
normalized before comparison) and optionally by dedup.
"""

import re

# ── key normalization ─────────────────────────────────────────────────────────
# Real spec keys are messy French ("Taille de l'écran", "Mémoire vive"); profile
# hard_keys are clean tokens ("taille_ecran", "ram"). normalize_key folds both to
# a common space-separated lowercase ascii form so they can be compared, and
# _KEY_SYNONYMS bridges the vocabulary gap for the most discriminant keys.

_ACCENTS = str.maketrans("àâäéèêëîïôöùûüç", "aaaeeeeiioouuuc")


def normalize_key(k) -> str:
    k = str(k or "").strip().lower().translate(_ACCENTS)
    k = re.sub(r"[^a-z0-9]+", " ", k)   # apostrophes, underscores, punctuation -> space
    return re.sub(r"\s+", " ", k).strip()


# profile token -> phrases that, if present in a spec key, mark it as that token
_KEY_SYNONYMS = {
    "ram":             ("ram", "memoire vive", "memoire"),
    "stockage":        ("stockage", "disque dur", "disque", "ssd", "hdd", "capacite de stockage"),
    "type_stockage":   ("type de disque", "type de stockage", "type stockage"),
    "processeur":      ("processeur", "cpu"),
    "carte_graphique": ("carte graphique", "gpu", "chipset graphique", "carte video"),
    "gpu":             ("gpu", "carte graphique"),
    "vram":            ("vram", "memoire video", "memoire dediee", "memoire graphique"),
    "taille_ecran":    ("taille de l ecran", "taille ecran", "ecran", "diagonale", "pouce"),
    "resolution":      ("resolution",),
    "frequence":       ("frequence", "frequence d horloge"),
    "capacite_batterie": ("capacite batterie", "batterie", "autonomie"),
    "classe_energetique": ("classe energetique", "efficacite energetique"),
    "nombre_couverts": ("nombre de couverts", "couverts"),
    "norme_wifi":      ("norme wifi", "norme", "wifi"),
    "nombre_ports":    ("nombre de ports", "ports"),
}


def key_matches_any(spec_key, keys) -> bool:
    """True if *spec_key* corresponds to any token in *keys* (synonym-aware)."""
    nk = normalize_key(spec_key)
    if not nk:
        return False
    nk_tokens = set(nk.split())
    for hk in keys:
        for syn in _KEY_SYNONYMS.get(hk, (normalize_key(hk),)):
            syn_n = normalize_key(syn)
            if syn_n and (syn_n in nk or set(syn_n.split()) <= nk_tokens):
                return True
    return False


# ── number formatting ────────────────────────────────────────────────────────


def _fmt_num(value: float) -> str:
    """1080.0 -> '1080', 2.50 -> '2.5', 15.60 -> '15.6'."""
    if value == int(value):
        return str(int(value))
    return f"{value:g}"


def _to_float(raw: str) -> float | None:
    raw = raw.replace(",", ".")
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


# ── patterns ─────────────────────────────────────────────────────────────────

_RES_LABELS = {
    "full hd": "1920x1080",
    "fhd": "1920x1080",
    "hd ready": "1366x768",
    "wqhd": "2560x1440",
    "qhd": "2560x1440",
    "2k": "2560x1440",
    "uhd": "3840x2160",
    "4k": "3840x2160",
    "ultra hd": "3840x2160",
}

_RES_PAT    = re.compile(r"(\d+)\s*[x×]\s*(\d+)")
_STORAGE_PAT = re.compile(r"(\d+(?:\.\d+)?)\s*(go|gb|to|tb|mo|mb)\b", re.I)
_FREQ_PAT    = re.compile(r"(\d+(?:\.\d+)?)\s*(ghz|mhz)\b", re.I)
_SCREEN_PAT  = re.compile(r'(\d+(?:\.\d+)?)\s*(?:pouces?\b|inch(?:es)?\b|in\b|"|\'\')', re.I)

# unit family -> base unit token
_STORAGE_UNIT = {"go": "gb", "gb": "gb", "to": "tb", "tb": "tb", "mo": "mb", "mb": "mb"}

# keys that strongly imply a screen measurement (lets us catch a bare "15.6")
_SCREEN_KEY_PAT = re.compile(r"ecran|pouce|diagonal|taille.?ecran|screen|display", re.I)


def normalize_spec_value(key, raw_value) -> str:
    """Return a canonical token for *raw_value*. Never raises."""
    if raw_value is None:
        return ""

    s = str(raw_value).strip().lower()
    if not s:
        return ""

    # comma decimal -> dot (French specs use "2,5 GHz")
    s = re.sub(r"(\d),(\d)", r"\1.\2", s)
    s = re.sub(r"\s+", " ", s).strip()

    key_s = str(key or "").lower()

    # ── resolution ────────────────────────────────────────────────────────────
    if s in _RES_LABELS:
        return _RES_LABELS[s]
    m = _RES_PAT.search(s)
    if m:
        return f"{int(m.group(1))}x{int(m.group(2))}"

    # ── storage / memory ──────────────────────────────────────────────────────
    m = _STORAGE_PAT.search(s)
    if m:
        num = _to_float(m.group(1))
        unit = _STORAGE_UNIT[m.group(2).lower()]
        if num is not None:
            # promote "1000 gb" / "1024 gb" -> "1tb", "1000 mb" -> "1gb"
            if unit == "gb" and num >= 1000 and num % 1000 == 0:
                num, unit = num / 1000, "tb"
            elif unit == "mb" and num >= 1000 and num % 1000 == 0:
                num, unit = num / 1000, "gb"
            return f"{_fmt_num(num)}{unit}"

    # ── frequency ─────────────────────────────────────────────────────────────
    m = _FREQ_PAT.search(s)
    if m:
        num = _to_float(m.group(1))
        unit = m.group(2).lower()
        if num is not None:
            if unit == "mhz" and num >= 1000:
                num, unit = num / 1000, "ghz"  # 2500 MHz -> 2.5 ghz
            return f"{_fmt_num(num)}{unit}"

    # ── screen size ───────────────────────────────────────────────────────────
    m = _SCREEN_PAT.search(s)
    if m:
        num = _to_float(m.group(1))
        if num is not None:
            return f"{_fmt_num(num)}in"
    # bare number under a screen-ish key: "15.6" with key "taille_ecran"
    if _SCREEN_KEY_PAT.search(key_s):
        num = _to_float(s)
        if num is not None and 4.0 <= num <= 120.0:
            return f"{_fmt_num(num)}in"

    # ── generic ───────────────────────────────────────────────────────────────
    # collapse remaining whitespace, drop a redundant trailing watt unit form
    s = re.sub(r"(\d+(?:\.\d+)?)\s*watts?\b", lambda mm: f"{mm.group(1)}w", s)
    return s.strip()


# ── self-test ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cases = [
        # memory / storage
        (("ram", "8 Go"), "8gb"),
        (("ram", "8GB"), "8gb"),
        (("ram", "8 GB"), "8gb"),
        (("ram", "8go"), "8gb"),
        (("stockage", "1 To"), "1tb"),
        (("stockage", "1TB"), "1tb"),
        (("stockage", "1000 Go"), "1tb"),
        (("stockage", "512 Go"), "512gb"),
        (("stockage", "256GB SSD".replace(" SSD", "")), "256gb"),
        # frequency
        (("frequence", "2,5 GHz"), "2.5ghz"),
        (("frequence", "2.5GHz"), "2.5ghz"),
        (("frequence", "2500 MHz"), "2.5ghz"),
        (("frequence", "3 GHz"), "3ghz"),
        # screen size
        (("taille_ecran", "15,6 pouces"), "15.6in"),
        (("taille_ecran", '15.6"'), "15.6in"),
        (("taille_ecran", "15.6 inch"), "15.6in"),
        (("taille_ecran", "15.6"), "15.6in"),
        # resolution
        (("resolution", "1920x1080"), "1920x1080"),
        (("resolution", "1920 x 1080"), "1920x1080"),
        (("resolution", "Full HD"), "1920x1080"),
        (("resolution", "4K"), "3840x2160"),
        # generic
        (("couleur", "Noir"), "noir"),
        (("type", "SSD "), "ssd"),
        (("puissance", "65 Watts"), "65w"),
        ((None, None), ""),
        (("x", ""), ""),
    ]

    failures = 0
    for (key, raw), expected in cases:
        got = normalize_spec_value(key, raw)
        ok = got == expected
        failures += not ok
        flag = "ok " if ok else "FAIL"
        print(f"  [{flag}] normalize_spec_value({key!r}, {raw!r}) = {got!r}  (expected {expected!r})")

    if failures:
        raise SystemExit(f"\n{failures} assertion(s) failed.")
    print(f"\nAll {len(cases)} assertions passed.")
