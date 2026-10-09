"""
deduplicate_offers.py — Remove duplicate offers within a site.

Within each (categorie_id, marque) group of offers that have specs_normalises,
identical specs (after lowercasing / stripping whitespace) are collapsed: the
offer with the lowest id survives, the rest are deleted along with their
dependent snapshots and candidats rows.

Usage:
    python scripts/deduplicate_offers.py --site mytek
    python scripts/deduplicate_offers.py --site tunisianet
    python scripts/deduplicate_offers.py --site spacenet
    python scripts/deduplicate_offers.py --site mytek --dry-run
    python scripts/deduplicate_offers.py --site mytek --batch-size 200
"""

import argparse
import json
from collections import defaultdict

from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://pfe_user:changeme@localhost:5432/pfe_db"

VALID_SITES = {"mytek", "tunisianet", "spacenet"}

parser = argparse.ArgumentParser()
parser.add_argument("--site",       required=True, choices=VALID_SITES)
parser.add_argument("--dry-run",    action="store_true")
parser.add_argument("--batch-size", type=int, default=200)
args = parser.parse_args()

engine = create_engine(DATABASE_URL)


def normalized_spec_key(spec: dict) -> str:
    cleaned = {
        k.strip().lower(): str(v).strip().lower()
        for k, v in spec.items()
        if v is not None
    }
    return json.dumps(cleaned, sort_keys=True, ensure_ascii=False)


# ── 1. Load offers with specs ─────────────────────────────────────────────────
print(f"Loading {args.site} offers with specs_normalises…")

with engine.connect() as conn:
    rows = conn.execute(text("""
        SELECT o.id, o.categorie_id, o.marque, o.specs_normalises
        FROM   offres_normalisees o
        JOIN   scrappeurs s    ON s.id = o.scraper_id
        JOIN   sites_source ss ON ss.id = s.site_source_id
        WHERE  ss.scraper_id = :site
          AND  o.specs_normalises IS NOT NULL
          AND  o.categorie_id IS NOT NULL
        ORDER  BY o.categorie_id, o.marque NULLS LAST, o.id
    """), {"site": args.site}).fetchall()

print(f"  {len(rows)} offers with specs found.")

# ── 2. Detect duplicates ──────────────────────────────────────────────────────
print("Detecting duplicates…")

groups: dict[tuple, list] = defaultdict(list)
for row in rows:
    group_key = (row.categorie_id, (row.marque or "").strip().lower())
    groups[group_key].append(row)

to_delete: list[int] = []

for group_rows in groups.values():
    seen: dict[str, int] = {}
    for row in group_rows:
        key = normalized_spec_key(row.specs_normalises or {})
        if key in seen:
            to_delete.append(row.id)
        else:
            seen[key] = row.id

total_with_specs = len(rows)
survivors_with_specs = total_with_specs - len(to_delete)
print(f"  {len(to_delete)} duplicates found  ({survivors_with_specs} survivors).")

# ── 3. Delete duplicates ──────────────────────────────────────────────────────
if not to_delete:
    print("Nothing to delete.")
elif args.dry_run:
    print(f"[DRY RUN] Would delete {len(to_delete)} offers and their dependents.")
else:
    print(f"Deleting {len(to_delete)} duplicate offers in batches of {args.batch_size}…")
    deleted = 0
    for i in range(0, len(to_delete), args.batch_size):
        batch = to_delete[i : i + args.batch_size]
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM snapshots WHERE offre_id = ANY(:ids)"),
                {"ids": batch},
            )
            conn.execute(
                text("DELETE FROM candidats WHERE offre_a_id = ANY(:ids) OR offre_b_id = ANY(:ids)"),
                {"ids": batch},
            )
            conn.execute(
                text("DELETE FROM offres_normalisees WHERE id = ANY(:ids)"),
                {"ids": batch},
            )
        deleted += len(batch)
        print(f"  {deleted}/{len(to_delete)} deleted…", end="\r")
    print()

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\nSummary — {args.site}")
print(f"  Offers with specs   : {total_with_specs}")
print(f"  Duplicates removed  : {len(to_delete)}")
print(f"  Survivors           : {survivors_with_specs}")
if args.dry_run:
    print("[DRY RUN] No writes to database.")