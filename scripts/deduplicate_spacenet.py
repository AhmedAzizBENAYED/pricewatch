"""
deduplicate_spacenet.py — Deduplicate Spacenet offers and populate referentiels.

Steps:
  1. Remove exact duplicate URLs for Spacenet.
  2. Within each (categorie_id, marque) group of Spacenet offers that have
     specs_normalises, identify duplicates.
  3. For every surviving Spacenet offer with a categorie_id, create a
     referentiels row and set produit_id on the offer.

Usage:
    python scripts/deduplicate_spacenet.py
    python scripts/deduplicate_spacenet.py --dry-run
    python scripts/deduplicate_spacenet.py --batch-size 200
"""

import argparse
import json
from collections import defaultdict

from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://pfe_user:changeme@localhost:5432/pfe_db"

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true", help="Print stats without writing to DB")
parser.add_argument("--batch-size", type=int, default=200)
args = parser.parse_args()

engine = create_engine(DATABASE_URL)


def normalized_spec_key(spec: dict) -> str:
    """Return a canonical JSON string for deduplication."""
    cleaned = {
        k.strip().lower(): str(v).strip().lower()
        for k, v in spec.items()
        if v is not None
    }
    return json.dumps(cleaned, sort_keys=True, ensure_ascii=False)


def delete_offers(conn, ids: list[int]):
    """Delete offers and dependent rows."""
    if not ids:
        return

    conn.execute(
        text("DELETE FROM snapshots WHERE offre_id = ANY(:ids)"),
        {"ids": ids},
    )

    conn.execute(
        text("""
            DELETE FROM candidats
            WHERE offre_a_id = ANY(:ids)
               OR offre_b_id = ANY(:ids)
        """),
        {"ids": ids},
    )

    conn.execute(
        text("DELETE FROM offres_normalisees WHERE id = ANY(:ids)"),
        {"ids": ids},
    )


# ── 1. Remove exact duplicate URLs ───────────────────────────────────────────
print("Detecting exact URL duplicates for Spacenet…")

with engine.connect() as conn:
    url_duplicate_rows = conn.execute(text("""
        WITH ranked AS (
            SELECT
                o.id,
                o.url_produit,
                ROW_NUMBER() OVER (
                    PARTITION BY TRIM(o.url_produit)
                    ORDER BY
                        CASE WHEN o.produit_id IS NOT NULL THEN 0 ELSE 1 END,
                        CASE
                            WHEN o.specs_normalises IS NOT NULL
                                 AND o.specs_normalises::text NOT IN ('{}', '[]', 'null', '')
                            THEN 0
                            ELSE 1
                        END,
                        o.id ASC
                ) AS rn
            FROM offres_normalisees o
            JOIN scrappeurs s ON s.id = o.scraper_id
            JOIN sites_source ss ON ss.id = s.site_source_id
            WHERE ss.scraper_id = 'spacenet'
              AND o.url_produit IS NOT NULL
              AND TRIM(o.url_produit) <> ''
        )
        SELECT id
        FROM ranked
        WHERE rn > 1
        ORDER BY id
    """)).fetchall()

url_to_delete = [r.id for r in url_duplicate_rows]

print(f"  {len(url_to_delete)} exact URL duplicate offers to remove.")

if url_to_delete:
    if args.dry_run:
        print(f"[DRY RUN] Would delete {len(url_to_delete)} exact URL duplicate offers.")
    else:
        print(f"Deleting {len(url_to_delete)} exact URL duplicate offers in batches…")
        deleted = 0

        for i in range(0, len(url_to_delete), args.batch_size):
            batch = url_to_delete[i:i + args.batch_size]

            with engine.begin() as conn:
                delete_offers(conn, batch)

            deleted += len(batch)
            print(f"  {deleted}/{len(url_to_delete)} URL duplicates deleted…", end="\r")

        print()


# ── 2. Load Spacenet offers with specs for specs-based deduplication ─────────
print("\nLoading Spacenet offers with specs_normalises…")

with engine.connect() as conn:
    spec_rows = conn.execute(text("""
        SELECT o.id, o.categorie_id, o.marque, o.specs_normalises
        FROM offres_normalisees o
        JOIN scrappeurs s ON s.id = o.scraper_id
        JOIN sites_source ss ON ss.id = s.site_source_id
        WHERE ss.scraper_id = 'spacenet'
          AND o.specs_normalises IS NOT NULL
          AND o.categorie_id IS NOT NULL
        ORDER BY o.categorie_id, o.marque NULLS LAST, o.id
    """)).fetchall()

# In dry-run mode, exact URL duplicates are still present in DB,
# so exclude them in memory.
url_deleted_set = set(url_to_delete)
spec_rows = [r for r in spec_rows if r.id not in url_deleted_set]

print(f"  {len(spec_rows)} offers with specs found.")


# ── 3. Identify duplicates within each (categorie_id, marque) group ──────────
print("Detecting specs-based duplicates…")

groups: dict[tuple, list] = defaultdict(list)

for row in spec_rows:
    group_key = (row.categorie_id, (row.marque or "").strip().lower())
    groups[group_key].append(row)

spec_to_delete: list[int] = []

for group_rows in groups.values():
    seen: dict[str, int] = {}

    for row in group_rows:
        key = normalized_spec_key(row.specs_normalises or {})

        if key in seen:
            spec_to_delete.append(row.id)
        else:
            seen[key] = row.id

print(f"  {len(spec_to_delete)} specs-based duplicate offers to remove.")


# ── 4. Delete specs-based duplicates ─────────────────────────────────────────
if spec_to_delete:
    if args.dry_run:
        print(f"[DRY RUN] Would delete {len(spec_to_delete)} specs-based duplicate offers.")
    else:
        print(f"Deleting {len(spec_to_delete)} specs-based duplicate offers in batches…")
        deleted = 0

        for i in range(0, len(spec_to_delete), args.batch_size):
            batch = spec_to_delete[i:i + args.batch_size]

            with engine.begin() as conn:
                delete_offers(conn, batch)

            deleted += len(batch)
            print(f"  {deleted}/{len(spec_to_delete)} specs duplicates deleted…", end="\r")

        print()


# ── 5. Load all surviving Spacenet offers for referentiel population ─────────
print("\nLoading surviving Spacenet offers for referentiel population…")

deleted_set = set(url_to_delete) | set(spec_to_delete)

with engine.connect() as conn:
    all_rows = conn.execute(text("""
        SELECT
            o.id,
            o.nom,
            o.marque,
            o.image,
            o.description,
            o.categorie_id,
            o.produit_id,
            o.url_produit
        FROM offres_normalisees o
        JOIN scrappeurs s ON s.id = o.scraper_id
        JOIN sites_source ss ON ss.id = s.site_source_id
        WHERE ss.scraper_id = 'spacenet'
          AND o.categorie_id IS NOT NULL
        ORDER BY o.id
    """)).fetchall()

# Exclude in-memory duplicates when dry-run.
candidates = [r for r in all_rows if r.id not in deleted_set]

print(f"  {len(candidates)} surviving offers to process.")


# ── 6. Create referentiel rows and link offers ───────────────────────────────
print("Populating referentiels…")

referentiel_created = 0
already_linked = 0

for i in range(0, len(candidates), args.batch_size):
    batch = candidates[i:i + args.batch_size]

    with engine.begin() as conn:
        for offer in batch:
            if offer.produit_id is not None:
                already_linked += 1
                continue

            if args.dry_run:
                referentiel_created += 1
                continue

            ref_id = conn.execute(text("""
                INSERT INTO referentiels
                    (nom_produit, description, marque, image, categorie_id, offre_ids)
                VALUES
                    (:nom, :desc, :marque, :image, :categorie_id,
                     ARRAY[:offre_id]::integer[])
                RETURNING id
            """), {
                "nom": offer.nom or "(sans nom)",
                "desc": offer.description,
                "marque": offer.marque,
                "image": offer.image,
                "categorie_id": offer.categorie_id,
                "offre_id": offer.id,
            }).scalar()

            conn.execute(text("""
                UPDATE offres_normalisees
                SET produit_id = :ref_id
                WHERE id = :offre_id
            """), {
                "ref_id": ref_id,
                "offre_id": offer.id,
            })

            referentiel_created += 1

    print(f"  {min(i + args.batch_size, len(candidates))}/{len(candidates)} processed…", end="\r")

print()


# ── Summary ─────────────────────────────────────────────────────────────────
print("\nSummary")
print(f"  Exact URL duplicates removed : {len(url_to_delete)}")
print(f"  Specs duplicates removed     : {len(spec_to_delete)}")
print(f"  Referentiels created         : {referentiel_created}")
print(f"  Already linked               : {already_linked}")

if args.dry_run:
    print("[DRY RUN] No writes to database.")