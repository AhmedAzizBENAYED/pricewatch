"""
match_category.py — generic, precision-first cascade matcher (all families).

Generalizes the legacy single-family matcher (scripts/match_informatique.py)
into a 4-stage cascade driven by per-family profiles (category_profiles.py):

  STAGE 1  BLOCKING          brand_slug == AND category in compatible_subcats
  STAGE 2  SEMANTIC PREFILTER top-15 nearest refs by cosine (pgvector / in-mem)
  STAGE 3  FINE SCORING       4 signals: model, spec, semantic, name
  STAGE 4  CALIBRATED DECISION auto / review / no_match with margin + sem floor

PRECISION PRIORITY: the margin gate (best must beat runner-up by auto_margin)
and the semantic_floor gate downgrade ambiguous AUTOs to REVIEW so a human/LLM
confirms them. The result is FEWER false positives than the legacy single-stage
scorer, at the cost of more manual REVIEW — exactly the intended trade-off.

Usage:
  python scripts/matching/match_category.py --parent-id 9946 [--llm] [--write-db]
  python scripts/matching/match_category.py --all --site mytek tunisianet
  python scripts/matching/match_category.py --parent-id 9946 --semantic-backend pg
"""
import os
import sys

os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")  # host Ollama

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(_HERE))
for _p in (_ROOT, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)


import re
import csv
import json
import time
import argparse
from collections import defaultdict
from datetime import datetime

import numpy as np  # in-memory cosine
import psycopg2
import psycopg2.extras
import requests as _requests
from pgvector.psycopg2 import register_vector  # vector <-> numpy
from rapidfuzz import fuzz as rfuzz

from value_normalizer import (  # shared normalization
    normalize_key, normalize_spec_value, key_matches_any,
)
from category_profiles import get_profile  # per-family knobs

DB = os.environ.get("DATABASE_URL", "postgresql://pfe_user:changeme@localhost:5432/pfe_db")

# ── Constants (unchanged from match_informatique.py) ─────────────────────────

GENERIC_VALUES = {
    "autres", "autre", "n/a", "na", "—", "-",
    "non défini", "non defini", "non spécifié", "non specifie",
    "standard", "divers", "",
}

# tech model-code tokens we never treat as a model slug from the product name
_DEFAULT_SKIP_NAME_TOKENS = {
    "USB", "USB2", "USB3", "USB4", "HDMI", "HDMI2", "RGB", "ARGB",
    "LED", "OLED", "AMOLED", "FHD", "UHD", "QHD", "WQHD", "WFHD", "WUXGA", "UWQHD",
    "IPS", "TFT", "TN", "VA", "MVA", "SSD", "HDD", "SSHD", "NVME",
    "DDR3", "DDR4", "DDR5", "PCIe", "PCIE", "WIFI", "WIFI6", "LAN", "NFC", "OTG",
    "AC", "DC", "DP", "DVI", "VGA", "4G", "5G", "3G", "GEN3", "GEN4", "GEN5",
}

_STOR_MAP = {"go": "gb", "to": "tb", "mo": "mb"}
_PROC_SLUG_PAT = re.compile(
    r"^(intel|amd|ryzen|coreultra|corei\d|corei|core\d|i[3579]|"
    r"celeron|pentium|athlon|xeon|snapdragon|rtx|gtx|rx\d|radeon|geforce)"
)
_MODEL_FROM_NAME_PAT = re.compile(r'\b([A-Z][A-Z0-9\-]*\d[A-Z0-9\-]*)\b')
_CAP_PAT = re.compile(r'\b(\d+(?:\.\d+)?)\s*(go|gb|to|tb|mo|mb)\b', re.I)


# ── Normalisation (value normalization delegated to value_normalizer) ───────

def normalize_specs(raw: dict, profile: dict) -> dict:
    out = {}
    for k, v in (raw or {}).items():
        if key_matches_any(k, profile["exclude_keys"]):  # synonym-aware exclude
            continue
        nv = normalize_spec_value(k, v)
        if nv in GENERIC_VALUES:
            continue
        out[normalize_key(k)] = nv  # canonical key
    return out


def _stor_repl(m):
    n, u = m.group(1), m.group(2).lower()
    return f"{n}{_STOR_MAP.get(u, u)}"


def model_slug(s: str) -> str:                                    # unchanged
    s = re.sub(r"(\d+(?:\.\d+)?)\s*(go|gb|to|tb|mo|mb)\b", _stor_repl, s, flags=re.I)
    slug = re.sub(r"[^a-z0-9]", "", s.lower())
    if re.fullmatch(r"\d{8,}", slug):
        return ""
    return slug


def brand_slug(b: str) -> str:                                   # unchanged
    return re.sub(r"[^a-z0-9]", "", (b or "").lower())


def _is_proc_slug(s: str) -> bool:                               # unchanged
    return bool(_PROC_SLUG_PAT.match(s))


def get_model_slugs(raw_specs: dict, nom, mode: str, skip_tokens: set) -> list[str]:
    results = []
    for gtin_key in ("gtin", "GTIN"):
        raw = raw_specs.get(gtin_key)
        if raw:
            s = model_slug(str(raw))
            if s and not _is_proc_slug(s) and s not in results:
                results.append(s)
            break
    for key in ("Modèle", "modèle", "Modele", "modele", "Model", "model"):
        raw = raw_specs.get(key)
        if raw:
            s = model_slug(str(raw))
            if s and not _is_proc_slug(s) and s not in results:
                results.append(s)
            break
    # Name-regex fallback only for tech families (non-tech names rarely carry
    # model codes; running the regex there manufactures false slugs).
    if mode == "tech" and not results and nom:
        skip = _DEFAULT_SKIP_NAME_TOKENS | {t.upper() for t in skip_tokens}
        for m in _MODEL_FROM_NAME_PAT.finditer(nom):
            token = m.group(1)
            if token in skip:
                continue
            s = model_slug(token)
            if s and len(s) >= 2 and not _is_proc_slug(s) and s not in results:
                results.append(s)
    return results


def extract_capacities(nom: str) -> set[str]:                   # unchanged
    out = set()
    for m in _CAP_PAT.finditer(nom or ""):
        out.add(normalize_spec_value("capacite", f"{m.group(1)}{m.group(2)}"))  # shared normalizer
    return out


def best_model_ratio(slugs_a: list, slugs_b: list) -> float:    # unchanged
    if not slugs_a or not slugs_b:
        return 0.0
    best = 0.0
    for a in slugs_a:
        for b in slugs_b:
            r = rfuzz.ratio(a, b) / 100
            if r > best:
                best = r
    return best


# ── Scoring ──────────────────────────────────────────────────────────────────

def score_specs(specs_a: dict, specs_b: dict, hard_keys: list):
    common_keys = set(specs_a) & set(specs_b)
    if not common_keys:
        return 0.0, 0, 0, 0
    match = conflict = hard_conflict = 0
    for k in common_keys:
        if specs_a[k] == specs_b[k]:
            match += 1
        else:
            conflict += 1
            if key_matches_any(k, hard_keys):  # synonym-aware hard keys
                hard_conflict += 1
    total = match + conflict
    score = match / total if total else 0.0
    return score, len(common_keys), conflict, hard_conflict


def score_pair(offer: dict, ref: dict, profile: dict, s_semantic: float) -> dict:
    s_model = best_model_ratio(offer["models"], ref["models"])
    s_name = rfuzz.token_sort_ratio(offer["nom"] or "", ref["nom"] or "") / 100
    s_spec, n_common, n_conflict, n_hard = score_specs(offer["specs"], ref["specs"], profile["hard_keys"])

    # 4-signal weights (legacy was 0.50*model + 0.35*spec + 0.15*name)
    combined = 0.40 * s_model + 0.25 * s_spec + 0.20 * s_semantic + 0.15 * s_name

    # ── penalties ─────────────────────────────────────────────────────────────
    if n_hard >= 1:
        if s_model >= 0.99:
            penalty = min(n_hard * 0.07, 0.20)
        else:
            penalty = min(n_hard * 0.15, 0.45)
        combined = max(0.0, combined - penalty)

    if offer["models"] and ref["models"]:
        if s_model < 0.68:
            combined = max(0.0, combined - 0.25)
        elif s_model < 0.95:
            combined = max(0.0, combined - 0.10)

    if s_model >= 0.95:
        cap_offer = extract_capacities(offer.get("nom", ""))
        cap_ref = extract_capacities(ref.get("nom", ""))
        if cap_offer and cap_ref and cap_offer.isdisjoint(cap_ref):
            combined = max(0.0, combined - 0.30)

    return {
        "score": round(combined, 4),
        "s_model": round(s_model, 3),
        "s_spec": round(s_spec, 3),
        "s_semantic": round(s_semantic, 3),
        "s_name": round(s_name, 3),
        "n_common": n_common, "n_conflict": n_conflict, "n_hard": n_hard,
    }


# ── Stage 1 helper: compatible subcategories ─────────────────────────────────

def compatible_subcats(cat_id, parent_of: dict, children_of: dict) -> set:
    """Offer's leaf category + its siblings under the same parent."""
    pid = parent_of.get(cat_id)
    sibs = set(children_of.get(pid, [])) if pid is not None else set()
    sibs.add(cat_id)
    return sibs


# ── Stage 2 helpers: semantic prefilter ──────────────────────────────────────

def _cosine_topk(offer_emb, refs_emb: list, k: int = 15):  # in-memory backend
    """refs_emb = [(ref, emb_np)]; return [(ref, similarity)] top-k by cosine."""
    mat = np.vstack([e for _, e in refs_emb]).astype(np.float32)
    o = np.asarray(offer_emb, dtype=np.float32)
    o = o / (np.linalg.norm(o) + 1e-9)
    mat = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9)
    sims = mat @ o
    order = np.argsort(-sims)[:k]
    return [(refs_emb[i][0], float(sims[i])) for i in order]


def _pg_semantic_topk(conn, offer_emb, candidate_ref_ids: list, k: int = 15):  # pgvector backend
    """Literal pgvector cosine prefilter (uses the ivfflat index on a small set)."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, 1 - (embedding <=> %s) AS sim
        FROM   referentiels
        WHERE  id = ANY(%s) AND embedding IS NOT NULL
        ORDER  BY embedding <=> %s
        LIMIT  %s
        """,
        (offer_emb, candidate_ref_ids, offer_emb, k),
    )
    return cur.fetchall()  # [(id, sim)]


# ── Cascade ──────────────────────────────────────────────────────────────────

def cascade_match(offer, brand_idx, parent_of, children_of, profile,
                  conn, semantic_backend):
    """Return (best_ref, best_sc, layer, margin, relaxed, reason)."""
    th = profile["thresholds"]
    bs = offer["brand_slug"]
    pool = brand_idx.get(bs, [])
    if not pool:
        return None, None, "NO_MATCH", 0.0, False, "no_brand_in_referentiel"

    # STAGE 1 — blocking by brand + compatible subcategory
    compat = compatible_subcats(offer["cat_id"], parent_of, children_of)
    candidates = [r for r in pool if r["cat_id"] in compat]
    relaxed = False
    if not candidates:                                           # fallback: brand-only
        candidates = pool
        relaxed = True

    # STAGE 2 — semantic prefilter (graceful degradation if no embedding)
    offer_emb = offer.get("emb")
    sem_map = {}
    if offer_emb is not None:
        refs_emb = [(r, r["emb"]) for r in candidates if r.get("emb") is not None]
        if refs_emb:
            if semantic_backend == "pg":
                top = _pg_semantic_topk(conn, offer_emb, [r["id"] for r, _ in refs_emb], 15)
                id2ref = {r["id"]: r for r in candidates}
                prefiltered = [id2ref[i] for i, _ in top if i in id2ref]
                sem_map = {i: float(s) for i, s in top}
            else:
                top = _cosine_topk(offer_emb, refs_emb, 15)
                prefiltered = [r for r, _ in top]
                sem_map = {r["id"]: s for r, s in top}
        else:
            prefiltered = candidates                             # refs not yet embedded
    else:
        prefiltered = candidates                                 # offer not yet embedded

    # STAGE 3 — fine scoring of the (≤15) prefiltered refs
    scored = []
    for ref in prefiltered:
        s_sem = sem_map.get(ref["id"], 0.0)
        scored.append((ref, score_pair(offer, ref, profile, s_sem)))
    if not scored:
        return None, None, "NO_MATCH", 0.0, relaxed, "no_candidate_after_prefilter"
    scored.sort(key=lambda x: -x[1]["score"])

    # STAGE 4 — calibrated decision (precision priority)
    best_ref, best_sc = scored[0]
    second_score = scored[1][1]["score"] if len(scored) > 1 else 0.0
    margin = round(best_sc["score"] - second_score, 4)
    model_ok = best_model_ratio(offer["models"], best_ref["models"]) >= 0.97

    reason = ""
    if (best_sc["score"] >= th["auto"] and model_ok
            and margin >= th["auto_margin"]
            and best_sc["s_semantic"] >= th["semantic_floor"]):
        layer = "AUTO"
    elif best_sc["score"] >= th["review"] or (best_sc["score"] >= th["auto"] and margin < th["auto_margin"]):
        layer = "REVIEW"
        # explain why an otherwise-strong pair did not auto-match (for the report)
        if best_sc["score"] >= th["auto"]:
            if not model_ok:
                reason = "model<0.97"
            elif margin < th["auto_margin"]:
                reason = f"margin<{th['auto_margin']}"
            elif best_sc["s_semantic"] < th["semantic_floor"]:
                reason = f"semantic<{th['semantic_floor']}"
    else:
        layer = "NO_MATCH"
    return best_ref, best_sc, layer, margin, relaxed, reason


# ── LLM arbitration (precision-tuned) ────────────────────────────────────────

OLLAMA_CHAT_URL = os.environ["OLLAMA_BASE_URL"] + "/api/chat"
OLLAMA_MODEL = "llama3:latest"
CHECKPOINT_DIR = os.path.join(_HERE, "checkpoints")


def _checkpoint_path(profile_name: str) -> str:
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    return os.path.join(CHECKPOINT_DIR, f"llm_{profile_name}.json")


def _load_checkpoint(path: str) -> dict:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_checkpoint(path: str, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _build_llm_prompt(offer, ref, sc, margin, profile) -> str:  # domain + margin + conservative
    def fmt_specs(specs):
        if not specs:
            return "  (aucune spec disponible)"
        return "\n".join(f"  {k}: {v}" for k, v in list(specs.items())[:12])

    return f"""Tu es un expert en {profile['llm_expert_domain']}.
Compare ces deux produits et dis si c'est le MEME produit vendu sur deux sites differents.

OFFRE ({offer.get('site', '?').upper()}):
  Nom   : {offer['nom']}
  Marque: {offer['marque']}
  Modele: {offer.get('models', [])}
Specs offre:
{fmt_specs(offer.get('specs', {}))}

REFERENCE (SPACENET):
  Nom   : {ref['nom']}
  Marque: {ref['marque']}
  Modele: {ref.get('models', [])}
Specs reference:
{fmt_specs(ref.get('specs', {}))}

Scores de similarite (0 a 1):
  Modele: {sc['s_model']:.2f}  Specs: {sc['s_spec']:.2f}  Semantique: {sc['s_semantic']:.2f}  Nom: {sc['s_name']:.2f}
  Score global: {sc['score']:.3f}   Marge sur le 2e candidat: {margin:.3f}

Reponds en UNE SEULE LIGNE avec exactement ce format:
DECISION: OUI|NON|INCERTAIN — <justification courte en francais>

- OUI       = certitude que c'est le meme produit (memes specs essentielles ; la couleur peut differer)
- NON       = produits differents (modeles, capacites ou types differents)
- INCERTAIN = doute
IMPORTANT : la PRECISION prime. En cas de doute, reponds INCERTAIN plutot que OUI.
"""


def ask_llm(offer, ref, sc, margin, profile, checkpoint, ck_path) -> tuple[str, str]:
    key = f"{offer['id']}_{ref['id']}"
    if key in checkpoint:
        c = checkpoint[key]
        return c["decision"], c["justification"]

    prompt = _build_llm_prompt(offer, ref, sc, margin, profile)
    for attempt in range(3):
        try:
            resp = _requests.post(
                OLLAMA_CHAT_URL,
                json={"model": OLLAMA_MODEL,
                      "messages": [{"role": "user", "content": prompt}],
                      "stream": False, "options": {"temperature": 0}},
                timeout=120,
            )
            resp.raise_for_status()
            text = resp.json()["message"]["content"].strip()
            decision, justification = "INCERTAIN", text
            if "DECISION:" in text:
                after = text.split("DECISION:", 1)[1].strip()
                for d in ("OUI", "NON", "INCERTAIN"):
                    if after.upper().startswith(d):
                        decision = d
                        justification = after[len(d):].lstrip(" —-:").strip()
                        break
            checkpoint[key] = {"decision": decision, "justification": justification}
            _save_checkpoint(ck_path, checkpoint)
            return decision, justification
        except Exception as e:
            print(f"    [LLM] erreur (tentative {attempt+1}/3): {e}", flush=True)
            if attempt < 2:
                time.sleep(3)
    return "INCERTAIN", "3 tentatives echouees"


# ── DB writes (unchanged from match_informatique.py) ─────────────────────────

def write_match(cur, offre_id, ref_id, layer, score):
    cur.execute("""
        UPDATE offres_normalisees
        SET produit_id = %s, match_layer = %s, match_score = %s
        WHERE id = %s AND produit_id IS NULL
    """, (ref_id, layer, score, offre_id))
    cur.execute("""
        UPDATE referentiels
        SET offre_ids = array_append(offre_ids, %s)
        WHERE id = %s AND NOT (%s = ANY(COALESCE(offre_ids, '{}')))
    """, (offre_id, ref_id, offre_id))


def insert_candidat(cur, offer, ref, sc, justification):
    spacenet_offre_id = ref["offre_ids"][0] if ref["offre_ids"] else None
    commentaire = json.dumps({
        "justification": justification,
        "s_model": sc["s_model"], "s_spec": sc["s_spec"],
        "s_semantic": sc["s_semantic"], "s_name": sc["s_name"],
        "offer_models": offer["models"], "ref_models": ref["models"],
    }, ensure_ascii=False)
    cur.execute("""
        INSERT INTO candidats
          (offre_a_id, offre_b_id, referentiel_id, score_confluence,
           statut, commentaire, date_proposition)
        VALUES (%s, %s, %s, %s, 'INCERTAIN', %s, %s)
        ON CONFLICT DO NOTHING
    """, (offer["id"], spacenet_offre_id, ref["id"], sc["score"], commentaire, datetime.now()))


# ── Data loading ─────────────────────────────────────────────────────────────

def descendant_cat_ids(cur, parent_id):
    cur.execute("SELECT id FROM categories WHERE id_parent = %s", (parent_id,))
    l2 = [r["id"] for r in cur.fetchall()]
    l3 = []
    if l2:
        cur.execute("SELECT id FROM categories WHERE id_parent = ANY(%s)", (l2,))
        l3 = [r["id"] for r in cur.fetchall()]
    return l2 + l3, l2, l3


def load_referentiel(conn, cat_ids, profile):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT r.id, r.nom_produit, r.marque, r.categorie_id, r.offre_ids, r.embedding
        FROM referentiels r
        WHERE r.categorie_id = ANY(%s)
    """, (cat_ids,))
    refs_raw = cur.fetchall()

    all_offre_ids = [oid for r in refs_raw for oid in (r["offre_ids"] or [])]
    offre_specs_map = {}
    if all_offre_ids:
        cur.execute("SELECT id, specs_normalises FROM offres_normalisees WHERE id = ANY(%s)",
                    (all_offre_ids,))
        offre_specs_map = {r["id"]: (r["specs_normalises"] or {}) for r in cur.fetchall()}

    mode = profile["model_extraction"]
    skip = set(profile["skip_name_tokens"])
    refs = []
    for r in refs_raw:
        best_specs = {}
        for oid in (r["offre_ids"] or []):
            sp = offre_specs_map.get(oid, {})
            if len(sp) > len(best_specs):
                best_specs = sp
        refs.append({
            "id": r["id"], "nom": r["nom_produit"], "marque": r["marque"],
            "brand_slug": brand_slug(r["marque"]), "cat_id": r["categorie_id"],
            "specs": normalize_specs(best_specs, profile),
            "models": get_model_slugs(best_specs, r["nom_produit"], mode, skip),
            "offre_ids": list(r["offre_ids"] or []),
            "emb": r["embedding"],
        })
    print(f"  {len(refs)} produits referentiel charges")
    return refs


def load_unmatched_offers(conn, cat_ids, sites, profile):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT o.id, o.nom, o.marque, o.categorie_id, o.specs_normalises, o.embedding,
               ss.scraper_id AS site
        FROM offres_normalisees o
        JOIN scrappeurs s ON s.id = o.scraper_id
        JOIN sites_source ss ON ss.id = s.site_source_id
        WHERE ss.scraper_id = ANY(%s)
          AND o.categorie_id = ANY(%s)
          AND o.produit_id IS NULL
    """, (sites, cat_ids))
    mode = profile["model_extraction"]
    skip = set(profile["skip_name_tokens"])
    offers = []
    for r in cur.fetchall():
        raw = r["specs_normalises"] or {}
        offers.append({
            "id": r["id"], "nom": r["nom"], "marque": r["marque"],
            "brand_slug": brand_slug(r["marque"]), "cat_id": r["categorie_id"],
            "site": r["site"], "specs": normalize_specs(raw, profile),
            "models": get_model_slugs(raw, r["nom"], mode, skip),
            "emb": r["embedding"],
        })
    print(f"  {len(offers)} offres non matchees chargees (sites={sites})")
    return offers


# ── Per-family run ───────────────────────────────────────────────────────────

CSV_FIELDS = ["offre_id", "site", "offre_nom", "offre_marque", "cat_nom",
              "ref_id", "ref_nom", "ref_marque", "score", "s_model", "s_spec",
              "s_semantic", "s_name", "margin", "n_common", "n_hard",
              "offer_models", "ref_models", "layer", "relaxed", "downgrade_reason",
              "llm_decision", "llm_reason"]


def run_for_parent(conn, parent_id, sites, use_llm, write_db, semantic_backend):
    profile = get_profile(parent_id)
    name = profile["name"]
    th = profile["thresholds"]

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT nom FROM categories WHERE id = %s", (parent_id,))
    row = cur.fetchone()
    parent_nom = row["nom"] if row else str(parent_id)

    print("=" * 70)
    print(f"[{parent_id}] {parent_nom}  profile={name}")
    print(f"  auto>={th['auto']}  review>={th['review']}  margin>={th['auto_margin']}  "
          f"sem_floor>={th['semantic_floor']}  sites={sites}")
    print(f"  semantic_backend={semantic_backend}  llm={'ON' if use_llm else 'off'}  "
          f"write_db={'ON' if write_db else 'off'}")
    print("=" * 70)

    cat_ids, l2, l3 = descendant_cat_ids(cur, parent_id)
    if not cat_ids:
        print("  (no subcategories — skipping)")
        return {"name": name, "parent_id": parent_id, "auto": 0, "llm_valide": 0,
                "llm_incertain": 0, "llm_rejete": 0, "review": 0, "no_match": 0, "total": 0}

    # category tree maps (global, cheap) for compatible_subcats
    cur.execute("SELECT id, id_parent FROM categories")
    parent_of, children_of = {}, defaultdict(list)
    for r in cur.fetchall():
        parent_of[r["id"]] = r["id_parent"]
        if r["id_parent"] is not None:
            children_of[r["id_parent"]].append(r["id"])

    cat_names = {}
    cur.execute("SELECT id, nom FROM categories WHERE id = ANY(%s)", (cat_ids,))
    for r in cur.fetchall():
        cat_names[r["id"]] = r["nom"]

    refs = load_referentiel(conn, cat_ids, profile)
    offers = load_unmatched_offers(conn, cat_ids, sites, profile)

    brand_idx = defaultdict(list)
    for ref in refs:
        brand_idx[ref["brand_slug"]].append(ref)

    buckets = {k: [] for k in ("auto", "llm_valide", "llm_incertain", "llm_rejete", "review", "no_match")}
    relaxed_count = 0
    ck_path = _checkpoint_path(name)
    checkpoint = _load_checkpoint(ck_path) if use_llm else {}

    n_total = len(offers)
    for i, offer in enumerate(offers, 1):
        if i % 100 == 0 or i == 1:
            print(f"  [{i:>4}/{n_total}] auto={len(buckets['auto'])} "
                  f"review={len(buckets['review'])+len(buckets['llm_valide'])} "
                  f"incert={len(buckets['llm_incertain'])} no_match={len(buckets['no_match'])}",
                  flush=True)

        best_ref, best_sc, layer, margin, relaxed, reason = cascade_match(
            offer, brand_idx, parent_of, children_of, profile, conn, semantic_backend)
        relaxed_count += relaxed

        row = {
            "offre_id": offer["id"], "site": offer["site"], "offre_nom": offer["nom"],
            "offre_marque": offer["marque"], "cat_nom": cat_names.get(offer["cat_id"], offer["cat_id"]),
            "ref_id": best_ref["id"] if best_ref else None,
            "ref_nom": best_ref["nom"] if best_ref else None,
            "ref_marque": best_ref["marque"] if best_ref else None,
            "score": best_sc["score"] if best_sc else 0,
            "s_model": best_sc["s_model"] if best_sc else 0,
            "s_spec": best_sc["s_spec"] if best_sc else 0,
            "s_semantic": best_sc["s_semantic"] if best_sc else 0,
            "s_name": best_sc["s_name"] if best_sc else 0,
            "margin": margin, "n_common": best_sc["n_common"] if best_sc else 0,
            "n_hard": best_sc["n_hard"] if best_sc else 0,
            "offer_models": str(offer["models"]),
            "ref_models": str(best_ref["models"]) if best_ref else "",
            "layer": layer, "relaxed": relaxed, "downgrade_reason": reason,
            "llm_decision": "", "llm_reason": "",
        }

        if layer == "AUTO":
            buckets["auto"].append(row)
        elif layer == "REVIEW":
            if use_llm and best_ref is not None:
                decision, justification = ask_llm(offer, best_ref, best_sc, margin, profile, checkpoint, ck_path)
                row["llm_decision"], row["llm_reason"] = decision, justification
                if decision == "OUI":
                    row["layer"] = "LLM_VALIDE"; buckets["llm_valide"].append(row)
                elif decision == "NON":
                    row["layer"] = "LLM_REJETE"; buckets["llm_rejete"].append(row)
                else:
                    row["layer"] = "LLM_INCERTAIN"; buckets["llm_incertain"].append(row)
            else:
                buckets["review"].append(row)
        else:
            buckets["no_match"].append(row)

    # ── report ────────────────────────────────────────────────────────────────
    print(f"\n  RESULTATS [{name}]")
    print(f"    AUTO          : {len(buckets['auto']):>5}")
    if use_llm:
        print(f"    LLM_VALIDE    : {len(buckets['llm_valide']):>5}")
        print(f"    LLM_INCERTAIN : {len(buckets['llm_incertain']):>5}  (-> candidats)")
        print(f"    LLM_REJETE    : {len(buckets['llm_rejete']):>5}")
    else:
        print(f"    REVIEW        : {len(buckets['review']):>5}  (no --llm)")
    print(f"    NO_MATCH      : {len(buckets['no_match']):>5}")
    print(f"    TOTAL         : {n_total:>5}   (brand-only fallback used on {relaxed_count})")

    # ── CSV ─────────────────────────────────────────────────────────────────────
    os.makedirs("data", exist_ok=True)

    def write_csv(path, rows):
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        print(f"    wrote {path} ({len(rows)})")

    write_csv(f"data/{name}_auto.csv", buckets["auto"])
    if use_llm:
        write_csv(f"data/{name}_llm_valide.csv", buckets["llm_valide"])
        write_csv(f"data/{name}_llm_incertain.csv", buckets["llm_incertain"])
        write_csv(f"data/{name}_llm_rejete.csv", buckets["llm_rejete"])
    else:
        write_csv(f"data/{name}_review.csv", buckets["review"])
    write_csv(f"data/{name}_no_match.csv", buckets["no_match"])

    # ── DB writes ───────────────────────────────────────────────────────────────
    if write_db:
        wcur = conn.cursor()
        validated = buckets["auto"] + buckets["llm_valide"]
        # Commit per match (not one big batch): writing produit_id is a non-HOT
        # update that relocates the tuple and re-inserts into uq_offre_url, which
        # collides with PRE-EXISTING duplicate url_produit rows. A single collision
        # would otherwise abort the whole family's transaction. Skip the offenders
        # (they stay unmatched; safe to re-run later) instead of losing the batch.
        written = skipped = 0
        for r in validated:
            try:
                write_match(wcur, r["offre_id"], r["ref_id"], r["layer"], r["score"])
                conn.commit()
                written += 1
            except psycopg2.Error:
                conn.rollback()
                skipped += 1
        msg = f"    DB: {written} matches written (AUTO + LLM_VALIDE)"
        if skipped:
            msg += f"  [skipped {skipped} pre-existing duplicate url_produit conflicts]"
        print(msg)

        offer_by_id = {o["id"]: o for o in offers}
        ref_by_id = {r["id"]: r for r in refs}
        for r in buckets["llm_incertain"]:
            insert_candidat(wcur, offer_by_id[r["offre_id"]], ref_by_id[r["ref_id"]],
                            {k: r[k] for k in ("score", "s_model", "s_spec", "s_semantic", "s_name")},
                            r["llm_reason"])
        conn.commit()
        print(f"    DB: {len(buckets['llm_incertain'])} INCERTAIN candidats inserted")
    else:
        print("    dry-run: no DB writes (use --write-db).")

    return {"name": name, "parent_id": parent_id,
            "auto": len(buckets["auto"]), "llm_valide": len(buckets["llm_valide"]),
            "llm_incertain": len(buckets["llm_incertain"]), "llm_rejete": len(buckets["llm_rejete"]),
            "review": len(buckets["review"]), "no_match": len(buckets["no_match"]), "total": n_total}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows console
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--parent-id", type=int)
    g.add_argument("--all", action="store_true")
    parser.add_argument("--site", nargs="+", default=["mytek", "tunisianet"])
    parser.add_argument("--llm", action="store_true")
    parser.add_argument("--write-db", action="store_true")
    parser.add_argument("--semantic-backend", choices=["memory", "pg"], default="memory",
                        help="memory = in-process cosine (fast, default); pg = pgvector <=> query")
    args = parser.parse_args()

    conn = psycopg2.connect(DB)
    register_vector(conn)  # embeddings <-> numpy
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if args.all:
        cur.execute("SELECT id FROM categories WHERE id_parent IS NULL ORDER BY nom")
        parent_ids = [r["id"] for r in cur.fetchall()]
    else:
        parent_ids = [args.parent_id]

    summaries = []
    for pid in parent_ids:
        summaries.append(run_for_parent(conn, pid, args.site, args.llm, args.write_db, args.semantic_backend))

    # ── final summary table ─────────────────────────────────────────────────────
    print("\n" + "=" * 78)
    print("SUMMARY (per family)")
    print("=" * 78)
    print(f"  {'family':<22} {'AUTO':>6} {'LLM_OK':>7} {'INCERT':>7} {'REJET':>6} {'REVIEW':>7} {'NO_MATCH':>9} {'TOTAL':>7}")
    for s in summaries:
        print(f"  {s['name']:<22} {s['auto']:>6} {s['llm_valide']:>7} {s['llm_incertain']:>7} "
              f"{s['llm_rejete']:>6} {s['review']:>7} {s['no_match']:>9} {s['total']:>7}")
    conn.close()


if __name__ == "__main__":
    main()
