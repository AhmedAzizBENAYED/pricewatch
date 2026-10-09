"""Inline normalization run on every scraped offer: brand extraction and spec mapping."""

import pytest

from src.normalizer.brand_extractor import BrandExtractor
from src.normalizer.spec_normalizer import SpecNormalizer, _extract_model


@pytest.fixture
def brands():
    known = ["Samsung", "HP", "Lenovo", "TP-Link", "Apple"]
    ordered = sorted(known, key=len, reverse=True)
    return BrandExtractor(
        lookup={b.lower(): b for b in known},
        sorted_brands=[(b.lower(), b) for b in ordered],
    )


def test_brand_from_spec_sheet_wins_over_name(brands):
    assert brands.extract({"Marque :": "samsung"}, "Lenovo something") == "Samsung"


@pytest.mark.parametrize(
    "key", ["Marque", "marque :", "Brand", "Fabricant", "Marque produit", "Marque de l'article", "Marque de l’article"]
)
def test_brand_spec_keys_are_recognised(brands, key):
    assert brands.extract({key: "HP"}, "") == "HP"


def test_unknown_brand_in_spec_sheet_is_kept_verbatim(brands):
    assert brands.extract({"Marque": "Xiaomi"}, "") == "Xiaomi"


def test_brand_from_name_when_spec_sheet_is_silent(brands):
    assert brands.extract({"Couleur": "Noir"}, "Routeur TP-Link Archer C6") == "TP-Link"


def test_brand_must_be_a_whole_word(brands):
    # "hp" inside "Chpa" must not be read as HP
    assert brands.extract({}, "Câble Chpa USB-C") is None


def test_no_brand(brands):
    assert brands.extract({}, "Câble USB générique") is None


@pytest.mark.parametrize(
    "nom, marque, expected",
    [
        ("Lenovo IdeaPad 3 Core i5-1235U 8Go", "Lenovo", "Core i5-1235U"),
        ("PC Gamer Ryzen 5 5600X RTX 4060", None, "Ryzen 5 5600X"),
        ("Carte graphique MSI RTX 4060 Ti 8Go", "MSI", "RTX 4060 Ti"),
        ("Clavier sans fil", None, None),
        ("", None, None),
    ],
)
def test_model_extraction(nom, marque, expected):
    assert _extract_model(nom, marque) == expected


def test_spec_keys_are_mapped_per_site():
    normalizer = SpecNormalizer({("mytek", "Mémoire RAM"): "RAM", ("spacenet", "RAM"): "RAM"})

    mytek = normalizer.normalize("mytek", {"Mémoire RAM": "8 Go", "Couleur": "Noir"}, "HP 250 G9", "HP")
    spacenet = normalizer.normalize("spacenet", {"RAM": "8 Go"}, "HP 250 G9", "HP")

    assert mytek["RAM"] == spacenet["RAM"] == "8 Go"
    assert "Couleur" not in mytek  # unmapped keys are dropped


def test_model_is_inferred_when_missing_from_spec_sheet():
    spec = SpecNormalizer({}).normalize("mytek", {}, "Asus TUF Gaming RTX 4070 OC", "Asus")
    assert spec["Modèle"] == "RTX 4070 OC"
