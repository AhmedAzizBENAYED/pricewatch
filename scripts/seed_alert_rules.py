"""Seed default alert rules for each tenant.

SITE_ECOMMERCE tenants (Mytek, Spacenet, Tunisianet) get 3 rules.
MARQUE tenants (Samsung, Lenovo) get 2 rules.

Idempotent: skips tenants that already have rules.

Usage:
    python scripts/seed_alert_rules.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.common.database import SessionLocal
from src.common.models.alerte import Alerte
from src.common.models.tenant import Tenant
from src.common.models.utilisateur import Utilisateur

SITE_ECOMMERCE_RULES = [
    {
        "type_evenement":       "BAISSE_PRIX",
        "seuil":                5,
        "liste_categories":     [],
        "periode_surveillance": "IMMEDIATE",
        "description":          "Baisse de prix significative",
        "alert":                True,
    },
    {
        "type_evenement":       "RUPTURE_STOCK",
        "seuil":                None,
        "liste_categories":     [],
        "periode_surveillance": "IMMEDIATE",
        "description":          "Rupture de stock concurrent",
        "alert":                True,
    },
    {
        "type_evenement":       "DEBUT_PROMOTION",
        "seuil":                None,
        "liste_categories":     [],
        "periode_surveillance": "IMMEDIATE",
        "description":          "Nouvelle promotion détectée",
        "alert":                True,
    },
]

MARQUE_RULES = [
    {
        "type_evenement":       "BAISSE_PRIX",
        "seuil":                3,
        "liste_categories":     [],
        "periode_surveillance": "IMMEDIATE",
        "description":          "Baisse de prix sur nos produits",
        "alert":                True,
    },
    {
        "type_evenement":       "NOUVELLE_OFFRE_DECOUVERTE",
        "seuil":                None,
        "liste_categories":     [],
        "periode_surveillance": "IMMEDIATE",
        "description":          "Nouveau référencement",
        "alert":                True,
    },
]


def main():
    db = SessionLocal()
    try:
        tenants = db.query(Tenant).filter(Tenant.est_actif == True).all()
        if not tenants:
            print("No active tenants found.")
            return

        total_created = 0

        for tenant in tenants:
            existing = db.query(Alerte).filter(Alerte.tenant_id == tenant.id).count()
            if existing > 0:
                print(f"  SKIP {tenant.nom_organisation} — already has {existing} rule(s)")
                continue

            # Find a RESP_MARKETING or MANAGER user to own the rules
            owner = (
                db.query(Utilisateur)
                .filter(
                    Utilisateur.tenant_id == tenant.id,
                    Utilisateur.est_actif == True,
                    Utilisateur.role.in_(["RESP_MARKETING", "MANAGER"]),
                )
                .first()
            )
            if not owner:
                owner = (
                    db.query(Utilisateur)
                    .filter(
                        Utilisateur.tenant_id == tenant.id,
                        Utilisateur.est_actif == True,
                    )
                    .first()
                )
            if not owner:
                print(f"  SKIP {tenant.nom_organisation} — no active users")
                continue

            rules = MARQUE_RULES if tenant.profil_client == "MARQUE" else SITE_ECOMMERCE_RULES

            for rule_data in rules:
                alerte = Alerte(
                    tenant_id=tenant.id,
                    id_utilisateur=owner.id,
                    type_evenement=rule_data["type_evenement"],
                    seuil=rule_data["seuil"],
                    liste_categories=rule_data["liste_categories"],
                    periode_surveillance=rule_data["periode_surveillance"],
                    description=rule_data["description"],
                    alert=rule_data["alert"],
                )
                db.add(alerte)
                total_created += 1

            profil = tenant.profil_client or "?"
            print(f"  OK  {tenant.nom_organisation} ({profil}) — {len(rules)} rule(s) created")

        db.commit()
        print(f"\nDone. {total_created} alert rule(s) created.")
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
