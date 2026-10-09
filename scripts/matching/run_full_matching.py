"""
run_full_matching.py — orchestrate the full precision-first matching pipeline.

Pipeline order:
    1. dedup            (optional, destructive)  — collapse intra-site duplicates
    2. bootstrap ref    (optional, one-time)     — seed referentiels from Spacenet
    3. build_embeddings                          — nomic vectors for refs + offers
    4. match_category                            — the 4-stage cascade

Steps 1 and 2 are DESTRUCTIVE / one-time, so they are OFF by default and must be
requested explicitly (--with-dedup, --with-bootstrap). Steps 3 and 4 are the
normal run. Embeddings come BEFORE matching so the semantic stage has vectors;
build_embeddings is idempotent, so re-running it is cheap.

Usage:
    python scripts/matching/run_full_matching.py --parent-id 9946 --llm --write-db
    python scripts/matching/run_full_matching.py --all
    python scripts/matching/run_full_matching.py --parent-id 9946 \
        --with-dedup --with-bootstrap --llm --write-db
    python scripts/matching/run_full_matching.py --parent-id 9946 --skip-embeddings
"""
import os
import sys
import subprocess

os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(_HERE))
_SCRIPTS = os.path.join(_ROOT, "scripts")
for _p in (_ROOT, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import argparse

import psycopg2
import psycopg2.extras
from pgvector.psycopg2 import register_vector

from match_category import run_for_parent

DB = os.environ.get("DATABASE_URL", "postgresql://pfe_user:changeme@localhost:5432/pfe_db")
DEDUP_SITES = ["mytek", "tunisianet"]   # spacenet handled by the bootstrap step


def _run(script_rel: str, extra_args: list[str]):
    """Run a sibling/legacy script as a subprocess, streaming its output."""
    path = os.path.join(_ROOT, script_rel)
    cmd = [sys.executable, path, *extra_args]
    print(f"\n$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows console
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--parent-id", type=int)
    g.add_argument("--all", action="store_true")
    parser.add_argument("--site", nargs="+", default=["mytek", "tunisianet"])
    parser.add_argument("--llm", action="store_true")
    parser.add_argument("--write-db", action="store_true")
    parser.add_argument("--semantic-backend", choices=["memory", "pg"], default="memory")
    parser.add_argument("--with-dedup", action="store_true",
                        help="Run the destructive intra-site dedup first")
    parser.add_argument("--with-bootstrap", action="store_true",
                        help="Run deduplicate_spacenet.py to (re)seed the referentiel")
    parser.add_argument("--skip-embeddings", action="store_true",
                        help="Assume embeddings already backfilled")
    parser.add_argument("--dry-run", action="store_true",
                        help="Pass --dry-run to dedup/bootstrap (no destructive writes)")
    args = parser.parse_args()

    conn = psycopg2.connect(DB)
    register_vector(conn)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if args.all:
        cur.execute("SELECT id FROM categories WHERE id_parent IS NULL ORDER BY nom")
        parent_ids = [r["id"] for r in cur.fetchall()]
    else:
        parent_ids = [args.parent_id]

    print("=" * 78)
    print("run_full_matching — precision-first cascade")
    print(f"  parents          : {parent_ids}")
    print(f"  sites            : {args.site}")
    print(f"  with_dedup       : {args.with_dedup}")
    print(f"  with_bootstrap   : {args.with_bootstrap}")
    print(f"  skip_embeddings  : {args.skip_embeddings}")
    print(f"  llm / write_db   : {args.llm} / {args.write_db}")
    print("=" * 78)

    dry = ["--dry-run"] if args.dry_run else []

    # ── 1. dedup (destructive, opt-in) ────────────────────────────────────────
    if args.with_dedup:
        for site in DEDUP_SITES:
            _run("scripts/deduplicate_offers.py", ["--site", site, *dry])

    # ── 2. bootstrap referentiel from Spacenet (one-time, opt-in) ─────────────
    if args.with_bootstrap:
        _run("scripts/deduplicate_spacenet.py", dry)

    # ── 3. embeddings ─────────────────────────────────────────────────────────
    if not args.skip_embeddings:
        emb_scope = ["--all"] if args.all else ["--parent-id", str(args.parent_id)]
        _run("scripts/matching/build_embeddings.py", emb_scope)

    # ── 4. matching (in-process, to aggregate summaries) ──────────────────────
    summaries = []
    for pid in parent_ids:
        summaries.append(run_for_parent(
            conn, pid, args.site, args.llm, args.write_db, args.semantic_backend))

    # ── final per-family summary ──────────────────────────────────────────────
    print("\n" + "=" * 78)
    print("FULL-RUN SUMMARY (per family)")
    print("=" * 78)
    print(f"  {'family':<22} {'AUTO':>6} {'LLM_OK':>7} {'INCERT':>7} {'REJET':>6} "
          f"{'REVIEW':>7} {'NO_MATCH':>9} {'TOTAL':>7}")
    tot = {k: 0 for k in ("auto", "llm_valide", "llm_incertain", "llm_rejete", "review", "no_match", "total")}
    for s in summaries:
        for k in tot:
            tot[k] += s[k]
        print(f"  {s['name']:<22} {s['auto']:>6} {s['llm_valide']:>7} {s['llm_incertain']:>7} "
              f"{s['llm_rejete']:>6} {s['review']:>7} {s['no_match']:>9} {s['total']:>7}")
    print("  " + "-" * 74)
    print(f"  {'ALL':<22} {tot['auto']:>6} {tot['llm_valide']:>7} {tot['llm_incertain']:>7} "
          f"{tot['llm_rejete']:>6} {tot['review']:>7} {tot['no_match']:>9} {tot['total']:>7}")
    conn.close()


if __name__ == "__main__":
    main()
