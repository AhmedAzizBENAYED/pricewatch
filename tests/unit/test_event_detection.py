"""Price/stock event detection: the comparison between two consecutive snapshots."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.scraper.tasks import pipeline


def snap(prix=None, promo=None, stock="EN_STOCK"):
    return SimpleNamespace(prix_original=prix, prix_en_promotion=promo, stock_status=stock)


@pytest.fixture
def alerts(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(pipeline, "process_alerts_for_event", mock)
    return mock


def detect(prev, new, alerts_mock=None):
    """Run detection and return the created event (or None)."""
    db = MagicMock()
    pipeline.detect_and_create_event(db, offre_id=42, new_snapshot=new, prev_snapshot=prev)
    if not db.add.called:
        return None
    return db.add.call_args.args[0]


@pytest.mark.parametrize(
    "prev, new, expected_type, before, after",
    [
        (None, snap(prix=100), "NOUVELLE_OFFRE_DECOUVERTE", None, 100),
        (snap(prix=100), snap(prix=100, stock="RUPTURE"), "RUPTURE_STOCK", 100, 100),
        (snap(prix=100, stock="RUPTURE"), snap(prix=100), "RETOUR_STOCK", 100, 100),
        (snap(prix=100), snap(prix=100, promo=80), "DEBUT_PROMOTION", 100, 80),
        (snap(prix=100), snap(prix=90), "BAISSE_PRIX", 100, 90),
        (snap(prix=100), snap(prix=115), "HAUSSE_PRIX", 100, 115),
    ],
)
def test_event_types(alerts, prev, new, expected_type, before, after):
    event = detect(prev, new)

    assert event is not None
    assert event.type_evenement == expected_type
    assert event.offre_id == 42
    assert event.valeur_avant == before
    assert event.valeur_apres == after
    alerts.assert_called_once()


@pytest.mark.parametrize("new_price", [99, 101, 100])
def test_price_moves_under_2_percent_are_ignored(alerts, new_price):
    assert detect(snap(prix=100), snap(prix=new_price)) is None
    alerts.assert_not_called()


@pytest.mark.parametrize("new_price, expected", [(98, "BAISSE_PRIX"), (102, "HAUSSE_PRIX")])
def test_2_percent_threshold_is_inclusive(alerts, new_price, expected):
    assert detect(snap(prix=100), snap(prix=new_price)).type_evenement == expected


def test_stock_change_takes_priority_over_price_change(alerts):
    event = detect(snap(prix=100), snap(prix=50, stock="RUPTURE"))
    assert event.type_evenement == "RUPTURE_STOCK"


def test_promotion_already_running_is_not_a_new_promotion(alerts):
    assert detect(snap(prix=100, promo=80), snap(prix=100, promo=75)) is None


def test_missing_price_produces_no_event(alerts):
    assert detect(snap(prix=None), snap(prix=100)) is None
    assert detect(snap(prix=100), snap(prix=None)) is None


def test_alert_failure_does_not_break_the_pipeline(monkeypatch):
    monkeypatch.setattr(pipeline, "process_alerts_for_event", MagicMock(side_effect=RuntimeError("smtp down")))
    event = detect(snap(prix=100), snap(prix=50))
    assert event.type_evenement == "BAISSE_PRIX"
