"""
match_informatique.py
Matching focalise sur la famille informatique (parent_id=9946).
Strategie : gtin > Modele > nom+specs, verification LLM (Groq) pour les cas ambigus.

Flux :
  AUTO   (score >= 0.72, s_model >= 0.97) → ecriture directe en base
  REVIEW (0.45 <= score < 0.72)           → verification LLM Groq
    LLM OUI      → ecriture en base (match_layer='LLM_VALIDE')
    LLM NON      → rejete, rien ecrit
    LLM INCERTAIN → insertion dans table candidats (statut='INCERTAIN')
  NO_MATCH (score < 0.45)                 → ignore

Usage :
  python scripts/match_informatique.py [--dry-run] [--write-db] [--llm] [--site mytek|tunisianet]
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import re, os, csv, argparse, json, time
from collections import defaultdict
from datetime import datetime
import psycopg2, psycopg2.extras
from rapidfuzz import fuzz as rfuzz

DB = "postgresql://pfe_user:changeme@localhost:5432/pfe_db"
PARENT_ID = 9946

# ── Constantes ──────────────────────────────────────────────────────────────

HARD_KEYS_RAW = {
    "mémoire", "memoire", "ram",
    "disque dur", "stockage",
    "processeur",
    "carte graphique",
    "résolution", "resolution",
    "capacité", "capacite",
    "puissance",
    "taille de l'écran", "taille de l ecran", "ecran", "écran",
}

EXCLUDE_KEYS_RAW = {
    "couleur", "color", "couleur principale",
    "garantie", "warranty",
    "gtin", "marque", "brand", "fabricant",
    "disponibilité", "disponibilite",
    "longueur du câble", "longueur du cable",
    "prix", "price", "dimensions", "poids", "weight",
    "marque",
}

GENERIC_VALUES = {
    "autres", "autre", "n/a", "na", "—", "-",
    "non défini", "non defini",
    "non spécifié", "non specifie",
    "standard", "divers", "",
}

SEUIL_AUTO   = 0.72   # confiance suffisante pour auto-match
SEUIL_REVIEW = 0.30   # sous ce seuil : pas de candidat viable

# ── Normalisation ──────────────────────────────────────────────────────────

_STOR_MAP = {"go": "gb", "to": "tb", "mo": "mb"}

def _stor_repl(m):
    n, u = m.group(1), m.group(2).lower()
    return f"{n}{_STOR_MAP.get(u, u)}"

def normalize_value(v) -> str:
    v = str(v).strip().lower()
    v = re.sub(r"(\d+(?:\.\d+)?)\s*(go|gb|to|tb|mo|mb)\b", _stor_repl, v, flags=re.I)
    v = re.sub(r"(\d+(?:\.\d+)?)\s*watts?\b", lambda m: f"{m.group(1)}w", v, flags=re.I)
    v = re.sub(r"(\d+(?:\.\d+)?)\s*(?:pouces?|inch(?:es)?)\b", lambda m: f'{m.group(1)}"', v, flags=re.I)
    v = re.sub(r"free[\s_\-]?dos|sans\s+os\b|no\s+os\b", "freedos", v, flags=re.I)
    v = re.sub(r"(\d+)\.0\b", r"\1", v)
    return v.strip()

def normalize_key(k: str) -> str:
    k = k.strip().lower()
    k = re.sub(r"[éèêë]", "e", k)
    k = re.sub(r"[àâä]", "a", k)
    k = re.sub(r"[ùûü]", "u", k)
    k = re.sub(r"[îï]", "i", k)
    k = re.sub(r"[ôö]", "o", k)
    k = re.sub(r"[ç]", "c", k)
    k = re.sub(r"['‘’ʼ]", " ", k)  # apostrophes → espace
    k = re.sub(r"\s+", " ", k).strip()
    return k

HARD_KEYS    = {normalize_key(k) for k in HARD_KEYS_RAW}
EXCLUDE_KEYS = {normalize_key(k) for k in EXCLUDE_KEYS_RAW}

def normalize_specs(raw: dict) -> dict:
    out = {}
    for k, v in (raw or {}).items():
        nk = normalize_key(k)
        if nk in EXCLUDE_KEYS:
            continue
        nv = normalize_value(v)
        if nv in GENERIC_VALUES:
            continue
        out[nk] = nv
    return out

def model_slug(s: str) -> str:
    s = re.sub(r"(\d+(?:\.\d+)?)\s*(go|gb|to|tb|mo|mb)\b", _stor_repl, s, flags=re.I)
    slug = re.sub(r"[^a-z0-9]", "", s.lower())
    if re.fullmatch(r"\d{8,}", slug):
        return ""
    return slug

def brand_slug(b: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (b or "").lower())

_PROC_SLUG_PAT = re.compile(
    r"^(intel|amd|ryzen|coreultra|corei\d|corei|core\d|i[3579]|"
    r"celeron|pentium|athlon|xeon|snapdragon|rtx|gtx|rx\d|radeon|geforce)"
)

# Tokens d'un nom de produit qui ressemblent a des codes modele
# Ex: "M616", "H111", "K707", "BK-7094", "GC-570", "BM27V9Q"
# Ne capture pas les tokens purement technologiques: USB, RGB, HDMI, FHD...
_MODEL_FROM_NAME_PAT = re.compile(r'\b([A-Z][A-Z0-9\-]*\d[A-Z0-9\-]*)\b')
_SKIP_NAME_TOKENS = {
    'USB', 'USB2', 'USB3', 'USB4',
    'HDMI', 'HDMI2',
    'RGB', 'ARGB',
    'LED', 'OLED', 'AMOLED',
    'FHD', 'UHD', 'QHD', 'WQHD', 'WFHD', 'WUXGA', 'UWQHD',
    'IPS', 'TFT', 'TN', 'VA', 'MVA',
    'SSD', 'HDD', 'SSHD', 'NVME',
    'DDR3', 'DDR4', 'DDR5',
    'PCIe', 'PCIE',
    'WIFI', 'WIFI6',
    'LAN', 'NFC', 'OTG',
    'AC', 'DC',
    'DP', 'DVI', 'VGA',
    '4G', '5G', '3G',
    'GEN3', 'GEN4', 'GEN5',
}

def _is_proc_slug(s: str) -> bool:
    return bool(_PROC_SLUG_PAT.match(s))

def get_model_slugs(raw_specs: dict, nom: str | None, site: str) -> list[str]:
    results = []
    # gtin (mytek et spacenet l'ont — contient le numero de modele fabricant)
    for gtin_key in ("gtin", "GTIN"):
        raw = raw_specs.get(gtin_key)
        if raw:
            s = model_slug(str(raw))
            if s and not _is_proc_slug(s) and s not in results:
                results.append(s)
            break
    # Cle Modele uniquement (pas Référence Processeur)
    for key in ("Modèle", "modèle", "Modele", "modele", "Model", "model"):
        raw = raw_specs.get(key)
        if raw:
            s = model_slug(str(raw))
            if s and not _is_proc_slug(s) and s not in results:
                results.append(s)
            break
    # Fallback : extraire le code modele depuis le nom produit
    # Utile quand le scraper ne remplit pas gtin/Modele (ex: Souris M616, Casque H111)
    if not results and nom:
        for m in _MODEL_FROM_NAME_PAT.finditer(nom):
            token = m.group(1)
            if token in _SKIP_NAME_TOKENS:
                continue
            s = model_slug(token)
            if s and len(s) >= 2 and not _is_proc_slug(s) and s not in results:
                results.append(s)
    return results

_CAP_PAT = re.compile(r'\b(\d+(?:\.\d+)?)\s*(go|gb|to|tb|mo|mb)\b', re.I)

def extract_capacities(nom: str) -> set[str]:
    """Extrait les valeurs de capacite normalisees depuis un nom produit."""
    out = set()
    for m in _CAP_PAT.finditer(nom or ""):
        out.add(normalize_value(f"{m.group(1)}{m.group(2)}"))
    return out

def best_model_ratio(slugs_a: list, slugs_b: list) -> float:
    if not slugs_a or not slugs_b:
        return 0.0
    best = 0.0
    for a in slugs_a:
        for b in slugs_b:
            r = rfuzz.ratio(a, b) / 100
            if r > best:
                best = r
    return best

def score_specs(specs_a: dict, specs_b: dict) -> tuple[float, int, int, int]:
    """Retourne (score, n_common, n_conflict, n_hard_conflict)"""
    common_keys = set(specs_a) & set(specs_b)
    if not common_keys:
        return 0.0, 0, 0, 0
    match = 0
    conflict = 0
    hard_conflict = 0
    for k in common_keys:
        va, vb = specs_a[k], specs_b[k]
        if va == vb:
            match += 1
        else:
            conflict += 1
            if k in HARD_KEYS:
                hard_conflict += 1
    total = match + conflict
    score = match / total if total else 0.0
    return score, len(common_keys), conflict, hard_conflict

# ── Chargement des donnees ─────────────────────────────────────────────────

def load_referentiel(conn, all_cat_ids: list) -> list[dict]:
    """
    Charge tous les referentiels de la famille informatique.
    Pour chaque ref, recupere les specs depuis la meilleure offre spacenet liee.
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT r.id, r.nom_produit, r.marque, r.categorie_id, r.offre_ids
        FROM referentiels r
        WHERE r.categorie_id = ANY(%s)
    """, (all_cat_ids,))
    refs_raw = cur.fetchall()

    # Recuperer les specs spacenet pour chaque ref
    # On prend l'offre spacenet avec le plus de specs
    all_offre_ids = []
    for r in refs_raw:
        all_offre_ids.extend(r['offre_ids'] or [])

    if not all_offre_ids:
        return []

    cur.execute("""
        SELECT id, specs_normalises
        FROM offres_normalisees
        WHERE id = ANY(%s)
    """, (all_offre_ids,))
    offre_specs_map = {r['id']: (r['specs_normalises'] or {}) for r in cur.fetchall()}

    refs = []
    for r in refs_raw:
        # Choisir l'offre spacenet avec le plus de specs
        best_specs = {}
        for oid in (r['offre_ids'] or []):
            sp = offre_specs_map.get(oid, {})
            if len(sp) > len(best_specs):
                best_specs = sp

        norm_specs = normalize_specs(best_specs)
        model_slugs_list = get_model_slugs(best_specs, r['nom_produit'], 'spacenet')

        refs.append({
            'id':         r['id'],
            'nom':        r['nom_produit'],
            'marque':     r['marque'],
            'brand_slug': brand_slug(r['marque']),
            'cat_id':     r['categorie_id'],
            'cat_l2':     None,   # rempli apres
            'specs':      norm_specs,
            'models':     model_slugs_list,
            'offre_ids':  list(r['offre_ids'] or []),  # offres spacenet liees
        })
    print(f"  {len(refs)} produits referentiel charges ({len(all_cat_ids)} categories)")
    return refs

def load_unmatched_offers(conn, all_cat_ids: list, sites: list) -> list[dict]:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT o.id, o.nom, o.marque, o.categorie_id, o.specs_normalises,
               ss.scraper_id AS site
        FROM offres_normalisees o
        JOIN scrappeurs s ON s.id = o.scraper_id
        JOIN sites_source ss ON ss.id = s.site_source_id
        WHERE ss.scraper_id = ANY(%s)
          AND o.categorie_id = ANY(%s)
          AND o.produit_id IS NULL
    """, (sites, all_cat_ids))
    offers = []
    for r in cur.fetchall():
        raw = r['specs_normalises'] or {}
        norm = normalize_specs(raw)
        slugs = get_model_slugs(raw, r['nom'], r['site'])
        offers.append({
            'id':         r['id'],
            'nom':        r['nom'],
            'marque':     r['marque'],
            'brand_slug': brand_slug(r['marque']),
            'cat_id':     r['categorie_id'],
            'cat_l2':     None,   # rempli apres
            'site':       r['site'],
            'specs':      norm,
            'models':     slugs,
        })
    print(f"  {len(offers)} offres non matchees chargees (sites={sites})")
    return offers

# ── Index ──────────────────────────────────────────────────────────────────

def build_indexes(refs: list) -> tuple[dict, dict]:
    """
    brand_cat_idx : (brand_slug, cat_id)  -> [ref]
    brand_idx     : brand_slug            -> [ref]
    """
    brand_cat_idx = defaultdict(list)
    brand_idx = defaultdict(list)
    for ref in refs:
        brand_cat_idx[(ref['brand_slug'], ref['cat_id'])].append(ref)
        brand_idx[ref['brand_slug']].append(ref)
    return brand_cat_idx, brand_idx

# ── Scoring ────────────────────────────────────────────────────────────────

def score_pair(offer: dict, ref: dict) -> dict:
    s_model = best_model_ratio(offer['models'], ref['models'])
    s_name  = rfuzz.token_sort_ratio(offer['nom'], ref['nom']) / 100
    s_spec, n_common, n_conflict, n_hard = score_specs(offer['specs'], ref['specs'])

    # Poids adaptatifs (tout informatique -> model prioritaire)
    w_model, w_spec, w_name = 0.50, 0.35, 0.15

    combined = w_model * s_model + w_spec * s_spec + w_name * s_name

    # Penalite conflit dur
    # Si modele exact (1.0) : penalite reduite car conflit probable artefact scraping
    # Si modele non exact  : penalite pleine
    if n_hard >= 1:
        if s_model >= 0.99:
            penalty = min(n_hard * 0.07, 0.20)   # modele slug identique
        else:
            penalty = min(n_hard * 0.15, 0.45)   # modele different → penalite pleine
        combined = max(0.0, combined - penalty)

    # Penalite conflit modele
    if offer['models'] and ref['models']:
        if s_model < 0.68:
            combined = max(0.0, combined - 0.25)
        elif s_model < 0.95:
            # modele partiellement different → -0.10
            combined = max(0.0, combined - 0.10)

    # Penalite capacite depuis le nom (pour produits sans cle spec explicite)
    # Ex : UC300 32Go vs UC300 256Go → meme slug, capacites differentes
    if s_model >= 0.95:
        cap_offer = extract_capacities(offer.get('nom', ''))
        cap_ref   = extract_capacities(ref.get('nom', ''))
        if cap_offer and cap_ref and cap_offer.isdisjoint(cap_ref):
            combined = max(0.0, combined - 0.30)


    return {
        'score':    round(combined, 4),
        's_model':  round(s_model, 3),
        's_spec':   round(s_spec, 3),
        's_name':   round(s_name, 3),
        'n_common': n_common,
        'n_conflict': n_conflict,
        'n_hard':   n_hard,
    }

# ── Matching principal ─────────────────────────────────────────────────────

def find_best_match(offer: dict, brand_cat_idx: dict, brand_idx: dict,
                    cat_ancestors: dict) -> tuple[dict | None, dict | None, str]:
    """
    Retourne (best_ref, best_scores, layer).
    Strategie : regroupement par marque sur toute la famille informatique.
    La discrimination produit est faite par modele + specs, pas par categorie.
    """
    bs = offer['brand_slug']

    # Pool = tous les referentiels de la meme marque dans toute la famille informatique
    pool = brand_idx.get(bs, [])
    if not pool:
        return None, None, "NO_MATCH"

    # Scorer tous les candidats
    best_ref   = None
    best_sc    = None
    best_score = -1.0

    for ref in pool:
        sc = score_pair(offer, ref)
        if sc['score'] > best_score:
            best_score = sc['score']
            best_ref   = ref
            best_sc    = sc

    # Determiner la layer finale
    # Exiger s_model >= 0.97 pour AUTO : seuls les slugs quasi-identiques (hyphens, prefixes)
    # BGM031 vs BGMP031 = 0.92 → REVIEW ; MS4254 vs MS4254 = 1.0 → AUTO
    model_ok = (best_ref is None) or best_model_ratio(offer['models'], best_ref['models']) >= 0.97
    if best_score >= SEUIL_AUTO and model_ok:
        layer = "AUTO"
    elif best_score >= SEUIL_REVIEW:
        layer = "REVIEW"
    else:
        layer = "NO_MATCH"

    return best_ref, best_sc, layer

# ── Main ──────────────────────────────────────────────────────────────────

# ── LLM Ollama (local) ────────────────────────────────────────────────────

import requests as _requests

OLLAMA_URL    = "http://localhost:11434/api/chat"
OLLAMA_MODEL  = "llama3:latest"
CHECKPOINT    = "scripts/llm_checkpoint_informatique.json"

def _load_checkpoint() -> dict:
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, encoding='utf-8') as f:
            return json.load(f)
    return {}

def _save_checkpoint(data: dict):
    with open(CHECKPOINT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _build_llm_prompt(offer: dict, ref: dict, sc: dict) -> str:
    def fmt_specs(specs: dict) -> str:
        if not specs:
            return "  (aucune spec disponible)"
        return "\n".join(f"  {k}: {v}" for k, v in list(specs.items())[:12])

    return f"""Tu es un expert en produits informatiques et electronique.
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

Scores de similarite:
  Modele : {sc['s_model']:.2f}  Specs: {sc['s_spec']:.2f}  Nom: {sc['s_name']:.2f}  Score: {sc['score']:.3f}

Reponds en UNE SEULE LIGNE avec exactement ce format:
DECISION: OUI|NON|INCERTAIN — <justification courte en francais>

- OUI       = meme produit, memes specs essentielles (couleur peut differer)
- NON       = produits differents (modeles, capacites ou types differents)
- INCERTAIN = impossible de trancher sans plus d'informations
"""

def ask_llm(offer: dict, ref: dict, sc: dict, checkpoint: dict) -> tuple[str, str]:
    """
    Interroge Ollama (local) pour valider un match ambigu.
    Retourne (decision, justification) avec decision in {OUI, NON, INCERTAIN}.
    """
    key = f"{offer['id']}_{ref['id']}"
    if key in checkpoint:
        cached = checkpoint[key]
        return cached['decision'], cached['justification']

    prompt = _build_llm_prompt(offer, ref, sc)
    print(f"    [LLM] {offer['nom'][:50]}", flush=True)

    for attempt in range(3):
        try:
            resp = _requests.post(
                OLLAMA_URL,
                json={
                    "model":  OLLAMA_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": {"temperature": 0},
                },
                timeout=120,
            )
            resp.raise_for_status()
            text = resp.json()["message"]["content"].strip()

            # Parse: "DECISION: OUI — justification"
            decision = "INCERTAIN"
            justification = text
            if "DECISION:" in text:
                after = text.split("DECISION:", 1)[1].strip()
                for d in ("OUI", "NON", "INCERTAIN"):
                    if after.upper().startswith(d):
                        decision = d
                        justification = after[len(d):].lstrip(" —-:").strip()
                        break

            checkpoint[key] = {'decision': decision, 'justification': justification}
            _save_checkpoint(checkpoint)
            return decision, justification

        except Exception as e:
            print(f"    [LLM] erreur (tentative {attempt+1}/3): {e}", flush=True)
            if attempt < 2:
                time.sleep(3)

    return "INCERTAIN", "3 tentatives echouees"

# ── DB writes ──────────────────────────────────────────────────────────────

def write_match(cur, offre_id: int, ref_id: int, layer: str, score: float):
    cur.execute("""
        UPDATE offres_normalisees
        SET produit_id = %s, match_layer = %s, match_score = %s
        WHERE id = %s AND produit_id IS NULL
    """, (ref_id, layer, score, offre_id))
    # Lien inverse : ajouter offre_id dans referentiels.offre_ids s'il n'y est pas deja
    cur.execute("""
        UPDATE referentiels
        SET offre_ids = array_append(offre_ids, %s)
        WHERE id = %s AND NOT (%s = ANY(COALESCE(offre_ids, '{}')))
    """, (offre_id, ref_id, offre_id))

def insert_candidat(cur, offer: dict, ref: dict, sc: dict, justification: str):
    spacenet_offre_id = ref['offre_ids'][0] if ref['offre_ids'] else None
    commentaire = json.dumps({
        'justification': justification,
        's_model': sc['s_model'],
        's_spec':  sc['s_spec'],
        's_name':  sc['s_name'],
        'offer_models': offer['models'],
        'ref_models':   ref['models'],
    }, ensure_ascii=False)
    cur.execute("""
        INSERT INTO candidats
          (offre_a_id, offre_b_id, referentiel_id, score_confluence,
           statut, commentaire, date_proposition)
        VALUES (%s, %s, %s, %s, 'INCERTAIN', %s, %s)
        ON CONFLICT DO NOTHING
    """, (offer['id'], spacenet_offre_id, ref['id'],
          sc['score'], commentaire, datetime.now()))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-db", action="store_true",
                        help="Ecrire les matches en base (defaut: dry-run)")
    parser.add_argument("--llm", action="store_true",
                        help="Activer la verification LLM pour les cas REVIEW")
    parser.add_argument("--site", nargs="+", default=["mytek", "tunisianet"],
                        help="Sites a traiter")
    parser.add_argument("--auto-thresh", type=float, default=SEUIL_AUTO)
    parser.add_argument("--review-thresh", type=float, default=SEUIL_REVIEW)
    args = parser.parse_args()

    write_db = args.write_db
    use_llm  = args.llm

    print("=" * 70)
    print("match_informatique.py — famille informatique (parent_id=9946)")
    print(f"  sites   : {args.site}")
    print(f"  auto    : >= {args.auto_thresh}")
    print(f"  review  : {args.review_thresh} — {args.auto_thresh}  (LLM: {'OUI' if use_llm else 'NON'})")
    print(f"  write_db: {'OUI' if write_db else 'NON (dry-run)'}")
    print("=" * 70)

    conn = psycopg2.connect(DB)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Collecte des categories informatique (L2 + L3)
    cur.execute("SELECT id FROM categories WHERE id_parent = %s", (PARENT_ID,))
    l2_ids = [r['id'] for r in cur.fetchall()]
    cur.execute("SELECT id, id_parent FROM categories WHERE id_parent = ANY(%s)", (l2_ids,))
    l3_rows = cur.fetchall()
    l3_ids = [r['id'] for r in l3_rows]
    all_cat_ids = l2_ids + l3_ids

    # Ancetres : cat_id -> liste d'ancetres [cat_id, parent_id, grandparent_id]
    cat_ancestors = {}
    l3_parent = {r['id']: r['id_parent'] for r in l3_rows}
    for cid in l3_ids:
        pid = l3_parent[cid]
        cat_ancestors[cid] = [cid, pid, PARENT_ID]
    for cid in l2_ids:
        cat_ancestors[cid] = [cid, PARENT_ID]

    print("\nChargement des donnees...")
    refs   = load_referentiel(conn, all_cat_ids)
    offers = load_unmatched_offers(conn, all_cat_ids, args.site)

    # Remplir cat_l2 (parent direct dans la hierarchie L3→L2)
    l3_to_l2 = {r['id']: r['id_parent'] for r in l3_rows}
    for item in refs + offers:
        item['cat_l2'] = l3_to_l2.get(item['cat_id'], item['cat_id'])

    brand_cat_idx, brand_idx = build_indexes(refs)

    # Stats par categorie ref
    cat_names = {}
    cur.execute("SELECT id, nom FROM categories WHERE id = ANY(%s)", (all_cat_ids,))
    for r in cur.fetchall():
        cat_names[r['id']] = r['nom']

    print(f"\nMatching {len(offers)} offres contre {len(refs)} referentiels...")

    auto_matches  = []   # score >= seuil_auto, model_ok
    llm_validated = []   # LLM dit OUI
    llm_incertain = []   # LLM dit INCERTAIN → table candidats
    llm_rejected  = []   # LLM dit NON
    review_queue  = []   # REVIEW sans LLM (dry-run ou --no-llm)
    no_matches    = []

    # Index offer par id pour retrouver l'objet depuis un row
    offer_by_id = {o['id']: o for o in offers}
    ref_by_id   = {r['id']: r for r in refs}

    checkpoint = _load_checkpoint() if use_llm else {}

    n_total = len(offers)
    for i, offer in enumerate(offers, 1):
        if i % 50 == 0 or i == 1:
            a  = len(auto_matches)
            rv = len(llm_validated) + len(review_queue)
            li = len(llm_incertain)
            n  = len(no_matches)
            llm_done = len(llm_validated) + len(llm_incertain) + len(llm_rejected)
            print(f"  [{i:>4}/{n_total}]  auto={a}  review={rv}  incert={li}  no_match={n}"
                  + (f"  llm_calls={llm_done}" if use_llm else ""), flush=True)

        best_ref, best_sc, layer = find_best_match(
            offer, brand_cat_idx, brand_idx, cat_ancestors
        )

        row = {
            'offre_id':     offer['id'],
            'site':         offer['site'],
            'offre_nom':    offer['nom'],
            'offre_marque': offer['marque'],
            'cat_nom':      cat_names.get(offer['cat_id'], str(offer['cat_id'])),
            'ref_id':       best_ref['id']  if best_ref else None,
            'ref_nom':      best_ref['nom'] if best_ref else None,
            'ref_marque':   best_ref['marque'] if best_ref else None,
            'score':        best_sc['score']    if best_sc else 0,
            's_model':      best_sc['s_model']  if best_sc else 0,
            's_spec':       best_sc['s_spec']   if best_sc else 0,
            's_name':       best_sc['s_name']   if best_sc else 0,
            'n_common':     best_sc['n_common'] if best_sc else 0,
            'n_hard':       best_sc['n_hard']   if best_sc else 0,
            'offer_models': str(offer['models']),
            'ref_models':   str(best_ref['models']) if best_ref else '',
            'layer':        layer,
            'llm_decision': '',
            'llm_reason':   '',
        }

        if layer == "AUTO":
            auto_matches.append(row)

        elif layer == "REVIEW":
            if use_llm and best_ref is not None:
                decision, justification = ask_llm(offer, best_ref, best_sc, checkpoint)
                row['llm_decision'] = decision
                row['llm_reason']   = justification
                if decision == "OUI":
                    row['layer'] = 'LLM_VALIDE'
                    llm_validated.append(row)
                    print(f"  [LLM OUI]       {offer['nom'][:55]}")
                elif decision == "NON":
                    row['layer'] = 'LLM_REJETE'
                    llm_rejected.append(row)
                else:
                    row['layer'] = 'LLM_INCERTAIN'
                    llm_incertain.append(row)
                    print(f"  [LLM INCERTAIN] {offer['nom'][:55]}")
            else:
                review_queue.append(row)

        else:
            no_matches.append(row)

    # ── Rapport ─────────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("RESULTATS")
    print("=" * 70)
    print(f"  AUTO (>= {args.auto_thresh})         : {len(auto_matches):>5} offres")
    if use_llm:
        print(f"  LLM_VALIDE                   : {len(llm_validated):>5} offres")
        print(f"  LLM_INCERTAIN (→ candidats)  : {len(llm_incertain):>5} offres")
        print(f"  LLM_REJETE                   : {len(llm_rejected):>5} offres")
    else:
        print(f"  REVIEW ({args.review_thresh}-{args.auto_thresh}) (sans LLM) : {len(review_queue):>5} offres")
    print(f"  NO_MATCH (< {args.review_thresh})       : {len(no_matches):>5} offres")
    print(f"  TOTAL                        : {len(offers):>5} offres")

    # Exemples AUTO
    print()
    print("--- Top 15 AUTO matches (score desc) ---")
    for r in sorted(auto_matches, key=lambda x: -x['score'])[:15]:
        print(f"  [{r['site']}] score={r['score']:.3f}  s_m={r['s_model']:.2f}  s_s={r['s_spec']:.2f}  s_n={r['s_name']:.2f}")
        print(f"    OFFRE : {r['offre_nom'][:60]}")
        print(f"    REF   : {r['ref_nom'][:60]}")
        print(f"    models offre={r['offer_models']}  ref={r['ref_models']}")

    if use_llm:
        if llm_validated:
            print()
            print("--- LLM_VALIDE (10 premiers) ---")
            for r in llm_validated[:10]:
                print(f"  [{r['site']}] score={r['score']:.3f}  {r['offre_nom'][:50]}")
                print(f"    REF: {r['ref_nom'][:50]}")
                print(f"    LLM: {r['llm_reason'][:80]}")

        if llm_incertain:
            print()
            print("--- LLM_INCERTAIN → candidats (10 premiers) ---")
            for r in llm_incertain[:10]:
                print(f"  [{r['site']}] score={r['score']:.3f}  {r['offre_nom'][:50]}")
                print(f"    REF: {r['ref_nom'][:50]}")
                print(f"    LLM: {r['llm_reason'][:80]}")

        if llm_rejected:
            print()
            print("--- LLM_REJETE (10 premiers) ---")
            for r in llm_rejected[:10]:
                print(f"  [{r['site']}] score={r['score']:.3f}  {r['offre_nom'][:50]}")
                print(f"    REF: {r['ref_nom'][:50]}")
                print(f"    LLM: {r['llm_reason'][:80]}")
    else:
        print()
        print("--- 10 exemples REVIEW (a valider manuellement) ---")
        for r in sorted(review_queue, key=lambda x: -x['score'])[:10]:
            print(f"  [{r['site']}] score={r['score']:.3f}  s_m={r['s_model']:.2f}  s_s={r['s_spec']:.2f}  s_n={r['s_name']:.2f}")
            print(f"    OFFRE : {r['offre_nom'][:60]}")
            print(f"    REF   : {r['ref_nom'][:60]}")

    # Exemples NO_MATCH
    print()
    print("--- 10 exemples NO_MATCH (aucun candidat viable) ---")
    for r in no_matches[:10]:
        print(f"  [{r['site']}] {r['cat_nom']} | {r['offre_marque']} | {r['offre_nom'][:55]}")

    # Stats par site
    print()
    print("--- Stats par site ---")
    for site in args.site:
        a  = sum(1 for r in auto_matches   if r['site'] == site)
        lv = sum(1 for r in llm_validated  if r['site'] == site)
        li = sum(1 for r in llm_incertain  if r['site'] == site)
        lr = sum(1 for r in llm_rejected   if r['site'] == site)
        rv = sum(1 for r in review_queue   if r['site'] == site)
        n  = sum(1 for r in no_matches     if r['site'] == site)
        total = a + lv + li + lr + rv + n
        if use_llm:
            print(f"  {site:<12} auto={a}  llm_ok={lv}  incert={li}  rej={lr}  no_match={n}  total={total}")
        else:
            print(f"  {site:<12} auto={a}  review={rv}  no_match={n}  total={total}")

    # Stats par categorie (matches valides)
    print()
    print("--- Matches valides par categorie ---")
    cat_auto = defaultdict(int)
    for r in auto_matches + llm_validated:
        cat_auto[r['cat_nom']] += 1
    for cat, nb in sorted(cat_auto.items(), key=lambda x: -x[1]):
        print(f"  {cat:<40} {nb}")

    # ── Ecriture CSV ─────────────────────────────────────────────────────────
    os.makedirs("data", exist_ok=True)
    FIELDS_BASE = ['offre_id', 'site', 'offre_nom', 'offre_marque', 'cat_nom',
                   'ref_id', 'ref_nom', 'ref_marque', 'score', 's_model', 's_spec', 's_name',
                   'n_common', 'n_hard', 'offer_models', 'ref_models', 'layer']
    FIELDS_LLM  = FIELDS_BASE + ['llm_decision', 'llm_reason']

    def write_csv(path, rows, fields=FIELDS_BASE):
        with open(path, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
            w.writeheader()
            w.writerows(rows)
        print(f"  Ecrit : {path} ({len(rows)} lignes)")

    print()
    print("--- Ecriture CSV ---")
    write_csv("data/informatique_auto_matches.csv", auto_matches)
    if use_llm:
        write_csv("data/informatique_llm_valide.csv",    llm_validated, FIELDS_LLM)
        write_csv("data/informatique_llm_incertain.csv", llm_incertain, FIELDS_LLM)
        write_csv("data/informatique_llm_rejete.csv",    llm_rejected,  FIELDS_LLM)
    else:
        write_csv("data/informatique_review_queue.csv", review_queue)
    write_csv("data/informatique_no_match.csv", no_matches)

    # ── Ecriture en base ──────────────────────────────────────────────────────
    if write_db:
        update_cur = conn.cursor()
        validated = auto_matches + llm_validated
        if validated:
            print()
            print(f"--- Ecriture en base : {len(validated)} matchs (AUTO + LLM_VALIDE) ---")
            n_written = 0
            for r in validated:
                write_match(update_cur, r['offre_id'], r['ref_id'], r['layer'], r['score'])
                n_written += update_cur.rowcount
            conn.commit()
            print(f"  {n_written} lignes mises a jour")

        if llm_incertain:
            print()
            print(f"--- Insertion candidats : {len(llm_incertain)} cas INCERTAIN ---")
            n_inserted = 0
            for r in llm_incertain:
                offer_obj = offer_by_id[r['offre_id']]
                ref_obj   = ref_by_id[r['ref_id']]
                sc_dict   = {k: r[k] for k in ('score', 's_model', 's_spec', 's_name',
                                                'n_common', 'n_hard')}
                insert_candidat(update_cur, offer_obj, ref_obj, sc_dict, r['llm_reason'])
                n_inserted += 1
            conn.commit()
            print(f"  {n_inserted} candidats inseres (ON CONFLICT DO NOTHING)")

        if not validated and not llm_incertain:
            print("  Aucun match a ecrire.")
    else:
        print()
        print("  Mode dry-run : aucune ecriture en base.")
        print("  Utilisez --write-db (sans --dry-run) pour ecrire en base.")

    conn.close()
    print()
    print("=" * 70)
    print("Termine.")
    print("=" * 70)

if __name__ == "__main__":
    main()
