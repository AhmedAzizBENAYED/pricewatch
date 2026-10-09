"""Cross-site product matching: value normalization and the scoring cascade."""

import pytest

from category_profiles import get_profile
from match_category import compatible_subcats, score_pair, score_specs
from value_normalizer import key_matches_any, normalize_key, normalize_spec_value


# ── Value normalization: "8 Go" == "8GB" == "8go" ────────────────────────────

@pytest.mark.parametrize(
    "key, raw, expected",
    [
        ("ram", "8 Go", "8gb"),
        ("ram", "8GB", "8gb"),
        ("ram", "8go", "8gb"),
        ("stockage", "1 To", "1tb"),
        ("stockage", "1000 Go", "1tb"),
        ("stockage", "512 Go", "512gb"),
        ("frequence", "2,5 GHz", "2.5ghz"),
        ("frequence", "2500 MHz", "2.5ghz"),
        ("taille_ecran", "15,6 pouces", "15.6in"),
        ("taille_ecran", '15.6"', "15.6in"),
        ("taille_ecran", "15.6", "15.6in"),  # bare number under a screen key
        ("resolution", "1920 x 1080", "1920x1080"),
        ("resolution", "Full HD", "1920x1080"),
        ("puissance", "65 Watts", "65w"),
        ("couleur", None, ""),
    ],
)
def test_normalize_spec_value(key, raw, expected):
    assert normalize_spec_value(key, raw) == expected


def test_normalize_key_folds_accents_and_punctuation():
    assert normalize_key("Taille de l'écran") == "taille de l ecran"


@pytest.mark.parametrize(
    "spec_key, hard_keys, expected",
    [
        ("Mémoire vive", ["ram"], True),
        ("Taille de l'écran", ["taille_ecran"], True),
        ("Carte graphique", ["gpu"], True),
        ("Couleur", ["ram", "gpu"], False),
    ],
)
def test_key_matches_any_is_synonym_aware(spec_key, hard_keys, expected):
    assert key_matches_any(spec_key, hard_keys) is expected


# ── Scoring ──────────────────────────────────────────────────────────────────

LAPTOPS = get_profile(9946)


def product(nom, models, specs):
    return {"nom": nom, "models": models, "specs": specs}


REFERENCE = product(
    "Lenovo IdeaPad Slim 3 15IRU8 i5-1335U 8Go 512Go SSD",
    ["15iru8", "i51335u"],
    {"ram": "8gb", "stockage": "512gb", "processeur": "i5-1335u"},
)


def test_identical_product_scores_high():
    result = score_pair(REFERENCE, REFERENCE, LAPTOPS, s_semantic=0.95)
    assert result["score"] >= LAPTOPS["thresholds"]["auto"]
    assert result["n_hard"] == 0


def test_hard_spec_conflict_is_penalized():
    # Same model, but a different RAM size is a different product
    other_ram = product(REFERENCE["nom"].replace("8Go", "16Go"), REFERENCE["models"], {**REFERENCE["specs"], "ram": "16gb"})

    same = score_pair(REFERENCE, REFERENCE, LAPTOPS, s_semantic=0.95)
    conflict = score_pair(other_ram, REFERENCE, LAPTOPS, s_semantic=0.95)

    assert conflict["n_hard"] == 1
    assert conflict["score"] < same["score"]


def test_different_model_is_pushed_below_auto_threshold():
    other_model = product("Lenovo IdeaPad Slim 5 16IAH8 i7-12700H 16Go 1To", ["16iah8", "i712700h"], {"ram": "16gb"})
    result = score_pair(other_model, REFERENCE, LAPTOPS, s_semantic=0.80)
    assert result["score"] < LAPTOPS["thresholds"]["auto"]


def test_capacity_mismatch_in_name_is_penalized():
    phones = get_profile(None)
    a = product("Apple iPhone 15 128Go Noir", ["iphone15"], {})
    b = product("Apple iPhone 15 256Go Noir", ["iphone15"], {})

    same = score_pair(a, a, phones, s_semantic=0.95)
    diff = score_pair(a, b, phones, s_semantic=0.95)

    assert diff["score"] <= same["score"] - 0.29


def test_score_specs_counts_matches_and_conflicts():
    score, common, conflicts, hard = score_specs(
        {"ram": "8gb", "couleur": "noir"}, {"ram": "16gb", "couleur": "noir"}, ["ram"]
    )
    assert (score, common, conflicts, hard) == (0.5, 2, 1, 1)


def test_score_specs_without_common_keys():
    assert score_specs({"ram": "8gb"}, {"couleur": "noir"}, ["ram"]) == (0.0, 0, 0, 0)


def test_unknown_family_gets_the_conservative_default_profile():
    default = get_profile(123456789)
    assert default["name"] == "category_123456789"
    # Untuned families must be at least as strict as tuned ones (precision first)
    assert default["thresholds"]["auto"] >= LAPTOPS["thresholds"]["auto"]
    assert default["thresholds"]["auto_margin"] >= LAPTOPS["thresholds"]["auto_margin"]


def test_compatible_subcategories_are_siblings_under_same_parent():
    parent_of = {10: 1, 11: 1, 12: 2}
    children_of = {1: [10, 11], 2: [12]}
    assert compatible_subcats(10, parent_of, children_of) == {10, 11}
    assert compatible_subcats(99, parent_of, children_of) == {99}
