"""
category_profiles.py — per-family knobs for the generic cascade matcher.

Each parent category (id_parent IS NULL in `categories`) gets a profile that
tells the matcher which spec keys are decisive (hard_keys), which to ignore
(exclude_keys), how to pull a model code (model_extraction), and — most
importantly — its decision thresholds.

PRECISION PRIORITY. Thresholds are deliberately strict; unknown families fall
back to DEFAULT_PROFILE which is *stricter still* (we would rather send an
ambiguous pair to manual REVIEW than auto-link two different products).

Threshold keys
    auto            min combined score for an AUTO match
    review          min combined score to be worth a REVIEW (LLM/manual)
    auto_margin     min gap between best and runner-up to allow AUTO
                    (a barely-winning top-1 is downgraded to REVIEW)
    semantic_floor  min cosine similarity (stage-2) required for AUTO

Parent IDs below come from:  SELECT id, nom FROM categories WHERE id_parent IS NULL
(see the STEP 1 report). Only families that actually carry referentiel data get a
tuned profile; the rest resolve through get_profile() -> DEFAULT_PROFILE.
"""

# ── conservative baseline for any unknown / untuned family ────────────────────

DEFAULT_PROFILE = {
    "name": "generic",
    "hard_keys": ["capacite", "taille", "puissance", "volume", "type"],
    "exclude_keys": ["couleur", "poids", "garantie", "dimensions"],
    "model_extraction": "basic",
    "skip_name_tokens": [],
    "llm_expert_domain": "produits de consommation",
    # DEFAULT is MORE conservative (precision priority for unknown families):
    "thresholds": {"auto": 0.78, "review": 0.35, "auto_margin": 0.12, "semantic_floor": 0.80},
}


PROFILES = {
    # ── 9946 Informatique ────────────────────────────────────────────────────
    9946: {
        "name": "informatique",
        "hard_keys": ["ram", "processeur", "stockage", "taille_ecran", "resolution",
                      "carte_graphique", "gpu", "vram", "type_stockage"],
        "exclude_keys": ["couleur", "poids", "dimensions", "garantie", "systeme",
                         "connectivite", "bluetooth", "wifi"],
        "model_extraction": "tech",
        "skip_name_tokens": ["USB", "HDMI", "RGB", "SSD", "DDR4", "DDR5", "NVMe", "WiFi", "Bluetooth"],
        "llm_expert_domain": "produits informatiques et électroniques",
        "thresholds": {"auto": 0.74, "review": 0.32, "auto_margin": 0.10, "semantic_floor": 0.75},
    },

    # ── 9947 Gaming ──────────────────────────────────────────────────────────
    9947: {
        "name": "gaming",
        "hard_keys": ["processeur", "carte_graphique", "gpu", "ram", "stockage",
                      "resolution", "taille_ecran", "type_stockage", "frequence"],
        "exclude_keys": ["couleur", "poids", "dimensions", "garantie", "eclairage", "rgb"],
        "model_extraction": "tech",
        "skip_name_tokens": ["RGB", "ARGB", "USB", "HDMI", "DDR4", "DDR5", "SSD", "NVMe", "WiFi", "FHD", "QHD"],
        "llm_expert_domain": "matériel de gaming (PC, consoles, périphériques)",
        "thresholds": {"auto": 0.74, "review": 0.32, "auto_margin": 0.10, "semantic_floor": 0.75},
    },

    # ── 9948 Téléphonie ──────────────────────────────────────────────────────
    9948: {
        "name": "telephonie",
        "hard_keys": ["ram", "stockage", "taille_ecran", "resolution", "capacite_batterie",
                      "batterie", "processeur", "appareil_photo", "reseau"],
        "exclude_keys": ["couleur", "poids", "dimensions", "garantie", "systeme", "sim"],
        "model_extraction": "tech",
        "skip_name_tokens": ["4G", "5G", "3G", "LTE", "NFC", "USB", "GB", "RAM", "FHD", "AMOLED", "OLED"],
        "llm_expert_domain": "smartphones, tablettes et accessoires de téléphonie",
        "thresholds": {"auto": 0.75, "review": 0.33, "auto_margin": 0.10, "semantic_floor": 0.76},
    },

    # ── 9949 Électroménager ──────────────────────────────────────────────────
    9949: {
        "name": "electromenager",
        "hard_keys": ["capacite", "volume", "puissance", "classe_energetique",
                      "nombre_couverts", "vitesse_essorage", "type"],
        "exclude_keys": ["couleur", "poids", "dimensions", "garantie", "niveau_sonore"],
        "model_extraction": "basic",
        "skip_name_tokens": [],
        "llm_expert_domain": "appareils électroménagers (gros et petit électroménager)",
        "thresholds": {"auto": 0.76, "review": 0.34, "auto_margin": 0.11, "semantic_floor": 0.78},
    },

    # ── 9950 Impression ──────────────────────────────────────────────────────
    9950: {
        "name": "impression",
        "hard_keys": ["technologie", "type", "resolution", "vitesse_impression",
                      "format", "couleur_impression", "recto_verso", "connectivite"],
        "exclude_keys": ["poids", "dimensions", "garantie"],
        "model_extraction": "tech",
        "skip_name_tokens": ["USB", "WiFi", "A4", "A3", "PPM", "DPI"],
        "llm_expert_domain": "imprimantes, scanners et consommables d'impression",
        "thresholds": {"auto": 0.75, "review": 0.33, "auto_margin": 0.10, "semantic_floor": 0.76},
    },

    # ── 9951 TV | Photo & Son ─────────────────────────────────────────────────
    9951: {
        "name": "tv_photo_son",
        "hard_keys": ["taille_ecran", "resolution", "technologie", "dalle",
                      "puissance", "type", "frequence", "hdr"],
        "exclude_keys": ["couleur", "poids", "dimensions", "garantie", "connectivite"],
        "model_extraction": "tech",
        "skip_name_tokens": ["4K", "UHD", "FHD", "QLED", "OLED", "LED", "HDR", "HDMI", "USB", "SMART"],
        "llm_expert_domain": "téléviseurs, appareils photo et matériel audio",
        "thresholds": {"auto": 0.75, "review": 0.33, "auto_margin": 0.11, "semantic_floor": 0.77},
    },

    # ── 9952 Sécurité & Réseaux ───────────────────────────────────────────────
    9952: {
        "name": "securite_reseaux",
        "hard_keys": ["debit", "norme_wifi", "frequence", "nombre_ports", "ports",
                      "resolution", "type", "portee", "vitesse"],
        "exclude_keys": ["couleur", "poids", "dimensions", "garantie"],
        "model_extraction": "tech",
        "skip_name_tokens": ["WiFi", "WIFI6", "AC", "LAN", "POE", "USB", "RJ45", "IP", "4G", "5G"],
        "llm_expert_domain": "équipements réseau et de sécurité (routeurs, caméras, switchs)",
        "thresholds": {"auto": 0.75, "review": 0.33, "auto_margin": 0.10, "semantic_floor": 0.76},
    },

    # ── 9953 Bureautique ──────────────────────────────────────────────────────
    9953: {
        "name": "bureautique",
        "hard_keys": ["format", "type", "capacite", "grammage", "couleur",
                      "nombre_pages", "dimensions"],
        "exclude_keys": ["poids", "garantie"],
        "model_extraction": "basic",
        "skip_name_tokens": ["A4", "A3", "A5"],
        "llm_expert_domain": "fournitures et matériel de bureau",
        "thresholds": {"auto": 0.78, "review": 0.35, "auto_margin": 0.12, "semantic_floor": 0.80},
    },

    # ── 9954 Sport & Loisir ───────────────────────────────────────────────────
    9954: {
        "name": "sport_loisir",
        "hard_keys": ["taille", "capacite", "poids_max", "type", "materiau", "resistance"],
        "exclude_keys": ["couleur", "garantie", "dimensions"],
        "model_extraction": "basic",
        "skip_name_tokens": [],
        "llm_expert_domain": "articles de sport et de loisir",
        "thresholds": {"auto": 0.78, "review": 0.35, "auto_margin": 0.12, "semantic_floor": 0.80},
    },

    # ── 9955 Beauté & Santé ───────────────────────────────────────────────────
    9955: {
        "name": "beaute_sante",
        "hard_keys": ["contenance", "volume", "type", "puissance", "fonction"],
        "exclude_keys": ["couleur", "garantie", "dimensions", "poids"],
        "model_extraction": "basic",
        "skip_name_tokens": [],
        "llm_expert_domain": "produits de beauté, soin et santé",
        "thresholds": {"auto": 0.78, "review": 0.35, "auto_margin": 0.12, "semantic_floor": 0.80},
    },

    # ── 9956 Meuble ───────────────────────────────────────────────────────────
    9956: {
        "name": "meuble",
        "hard_keys": ["dimensions", "materiau", "type", "couleur", "nombre_places"],
        "exclude_keys": ["garantie", "poids"],
        "model_extraction": "basic",
        "skip_name_tokens": [],
        "llm_expert_domain": "meubles et mobilier",
        "thresholds": {"auto": 0.80, "review": 0.36, "auto_margin": 0.12, "semantic_floor": 0.82},
    },

    # ── 9957 Maison, Jardin & Brico ───────────────────────────────────────────
    9957: {
        "name": "maison_jardin_brico",
        "hard_keys": ["puissance", "capacite", "volume", "type", "materiau", "dimensions"],
        "exclude_keys": ["couleur", "garantie", "poids"],
        "model_extraction": "basic",
        "skip_name_tokens": [],
        "llm_expert_domain": "articles de maison, jardin et bricolage",
        "thresholds": {"auto": 0.78, "review": 0.35, "auto_margin": 0.12, "semantic_floor": 0.80},
    },

    # ── 9958 Bébé ─────────────────────────────────────────────────────────────
    9958: {
        "name": "bebe",
        "hard_keys": ["taille", "age", "capacite", "type", "poids_max"],
        "exclude_keys": ["couleur", "garantie", "dimensions"],
        "model_extraction": "basic",
        "skip_name_tokens": [],
        "llm_expert_domain": "articles de puériculture et produits pour bébé",
        "thresholds": {"auto": 0.80, "review": 0.36, "auto_margin": 0.12, "semantic_floor": 0.82},
    },

    # ── 9959 Cadeau ───────────────────────────────────────────────────────────
    9959: {
        "name": "cadeau",
        "hard_keys": ["type", "taille", "contenance", "materiau"],
        "exclude_keys": ["couleur", "garantie", "dimensions", "poids"],
        "model_extraction": "basic",
        "skip_name_tokens": [],
        "llm_expert_domain": "articles cadeaux et accessoires",
        "thresholds": {"auto": 0.80, "review": 0.36, "auto_margin": 0.12, "semantic_floor": 0.82},
    },
}


def get_profile(parent_id):
    """Return the profile for *parent_id*, or a DEFAULT-derived one if untuned."""
    if parent_id in PROFILES:
        return PROFILES[parent_id]
    return {**DEFAULT_PROFILE, "name": f"category_{parent_id}"}


if __name__ == "__main__":
    # Quick sanity dump.
    import json
    print("Tuned families:")
    for pid, prof in PROFILES.items():
        th = prof["thresholds"]
        print(f"  {pid:>6}  {prof['name']:<22} auto={th['auto']} "
              f"margin={th['auto_margin']} sem_floor={th['semantic_floor']} "
              f"extract={prof['model_extraction']}")
    print("\nUnknown family falls back to:")
    print(json.dumps(get_profile(99999), indent=2, ensure_ascii=False))
