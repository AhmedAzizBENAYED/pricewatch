"""
build_embeddings.py — backfill nomic-embed-text vectors for the cascade matcher.

For every referentiel and every offre_normalisee with embedding IS NULL (scoped
by --parent-id or --all), build a compact text and store its 768-d embedding:

    text = "{nom} | {marque} | {top_specs}"

where top_specs is the normalized "key=value" string of the family's most
discriminant spec keys (profile.hard_keys). The same embedding helper the AI
assistant uses (src/ai/embeddings.py, nomic-embed-text via Ollama) is reused —
we do NOT reinvent the Ollama call.

Idempotent: only rows with embedding IS NULL are processed, so re-runs are cheap.

Usage:
    python scripts/matching/build_embeddings.py --parent-id 9946
    python scripts/matching/build_embeddings.py --all
    python scripts/matching/build_embeddings.py --parent-id 9946 --dry-run
    python scripts/matching/build_embeddings.py --parent-id 9946 --batch-size 100
"""
import os
import sys

# host scripts hit Ollama on localhost (host.docker.internal only resolves in the
# API container). Set BEFORE importing the embedding helper, which reads it.
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(_HERE))
for _p in (_ROOT, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import argparse

import numpy as np
import psycopg2
import psycopg2.extras
from pgvector.psycopg2 import register_vector

from src.ai.embeddings import embed_texts
from value_normalizer import normalize_key, normalize_spec_value, key_matches_any
from category_profiles import get_profile

DB = os.environ.get("DATABASE_URL", "postgresql://pfe_user:changeme@localhost:5432/pfe_db")
MAX_SPEC_KEYS = 8


# ── helpers ───────────────────────────────────────────────────────────────────

def descendant_cat_ids(cur, parent_id: int) -> list[int]:
    """parent + its L2 children + their L3 grandchildren."""
    cur.execute("SELECT id FROM categories WHERE id_parent = %s", (parent_id,))
    l2 = [r[0] for r in cur.fetchall()]
    l3 = []
    if l2:
        cur.execute("SELECT id FROM categories WHERE id_parent = ANY(%s)", (l2,))
        l3 = [r[0] for r in cur.fetchall()]
    return [parent_id] + l2 + l3


def build_text(nom, marque, specs: dict, profile: dict) -> str:
    nom = (nom or "").strip()
    marque = (marque or "").strip()
    top = []
    for k, v in (specs or {}).items():
        if len(top) >= MAX_SPEC_KEYS:
            break
        if key_matches_any(k, profile["hard_keys"]):
            nv = normalize_spec_value(k, v)
            if nv:
                top.append(f"{normalize_key(k)}={nv}")
    spec_str = " ".join(top)
    return f"{nom} | {marque} | {spec_str}".strip()


def _embed_and_store(conn, table: str, rows: list[tuple], batch_size: int, dry_run: bool):
    """rows = list of (id, text). UPDATE <table>.embedding in batches."""
    total = len(rows)
    if not total:
        print(f"  {table}: nothing to embed.")
        return 0
    if dry_run:
        print(f"  [DRY RUN] {table}: would embed {total} rows.")
        return 0

    done = 0
    skipped = 0
    cur = conn.cursor()
    for i in range(0, total, batch_size):
        batch = rows[i: i + batch_size]
        texts = [t for _, t in batch]
        vectors = embed_texts(texts)
        params = [
            (np.asarray(vec, dtype=np.float32), rid)
            for (rid, _), vec in zip(batch, vectors)
        ]
        try:
            cur.executemany(f"UPDATE {table} SET embedding = %s WHERE id = %s", params)
            conn.commit()
        except psycopg2.Error:
            # A pure embedding UPDATE can still trip uq_offre_url: writing a 768-d
            # vector grows the row, forcing a non-HOT update that relocates the
            # tuple and re-inserts into the URL unique index — which collides with
            # PRE-EXISTING duplicate url_produit rows. Retry row-by-row and skip
            # the few offenders (they stay NULL; the matcher degrades gracefully).
            conn.rollback()
            for p in params:
                try:
                    cur.execute(f"UPDATE {table} SET embedding = %s WHERE id = %s", p)
                    conn.commit()
                except psycopg2.Error:
                    conn.rollback()
                    skipped += 1
        done += len(batch)
        print(f"  {table}: {done}/{total} embedded…", end="\r", flush=True)
    print()
    if skipped:
        print(f"  {table}: skipped {skipped} rows (pre-existing duplicate url_produit conflicts)")
    return done - skipped


# ── referentiels ──────────────────────────────────────────────────────────────

def embed_referentiels(conn, cat_ids: list[int], profile: dict, batch_size: int, dry_run: bool) -> int:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, nom_produit, marque, offre_ids
        FROM referentiels
        WHERE categorie_id = ANY(%s) AND embedding IS NULL
    """, (cat_ids,))
    refs = cur.fetchall()
    if not refs:
        print("  referentiels: nothing to embed.")
        return 0

    # fetch specs of all linked offers, keep the richest per ref
    all_offre_ids = sorted({oid for r in refs for oid in (r["offre_ids"] or [])})
    specs_map = {}
    if all_offre_ids:
        cur.execute(
            "SELECT id, specs_normalises FROM offres_normalisees WHERE id = ANY(%s)",
            (all_offre_ids,),
        )
        specs_map = {r["id"]: (r["specs_normalises"] or {}) for r in cur.fetchall()}

    rows = []
    for r in refs:
        best = {}
        for oid in (r["offre_ids"] or []):
            sp = specs_map.get(oid, {})
            if len(sp) > len(best):
                best = sp
        rows.append((r["id"], build_text(r["nom_produit"], r["marque"], best, profile)))

    return _embed_and_store(conn, "referentiels", rows, batch_size, dry_run)


# ── offres ────────────────────────────────────────────────────────────────────

def embed_offres(conn, cat_ids: list[int], profile: dict, batch_size: int, dry_run: bool) -> int:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, nom, marque, specs_normalises
        FROM offres_normalisees
        WHERE categorie_id = ANY(%s) AND embedding IS NULL
    """, (cat_ids,))
    offers = cur.fetchall()
    rows = [
        (o["id"], build_text(o["nom"], o["marque"], o["specs_normalises"] or {}, profile))
        for o in offers
    ]
    return _embed_and_store(conn, "offres_normalisees", rows, batch_size, dry_run)


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--parent-id", type=int, help="Backfill one parent family")
    g.add_argument("--all", action="store_true", help="Backfill every parent family")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(DB)
    register_vector(conn)
    cur = conn.cursor()

    if args.all:
        cur.execute("SELECT id, nom FROM categories WHERE id_parent IS NULL ORDER BY nom")
        parents = cur.fetchall()
    else:
        cur.execute("SELECT id, nom FROM categories WHERE id = %s", (args.parent_id,))
        parents = cur.fetchall()
        if not parents:
            sys.exit(f"parent-id {args.parent_id} not found")

    print("=" * 70)
    print(f"build_embeddings — model=nomic-embed-text  base={os.environ['OLLAMA_BASE_URL']}")
    print(f"  parents : {[p[1] for p in parents]}")
    print(f"  dry_run : {args.dry_run}")
    print("=" * 70)

    grand_ref = grand_off = 0
    for pid, pnom in parents:
        profile = get_profile(pid)
        cat_ids = descendant_cat_ids(cur, pid)
        print(f"\n[{pid}] {pnom}  (profile={profile['name']}, {len(cat_ids)} categories)")
        grand_ref += embed_referentiels(conn, cat_ids, profile, args.batch_size, args.dry_run)
        grand_off += embed_offres(conn, cat_ids, profile, args.batch_size, args.dry_run)

    conn.close()
    print("\n" + "=" * 70)
    print(f"Done. referentiels embedded={grand_ref}  offres embedded={grand_off}")
    print("=" * 70)


if __name__ == "__main__":
    main()
