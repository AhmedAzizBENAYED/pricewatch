import logging
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from .state import RagState
from .llm_utils import call_ollama
from .retrieval import hybrid_search
from src.common.database import SessionLocal
from src.common.models import TenantDocument
from src.ai import OLLAMA_MODEL, OLLAMA_FAST_MODEL

logger = logging.getLogger(__name__)

_REWRITE_MODEL = OLLAMA_FAST_MODEL
_ROUTE_MODEL   = OLLAMA_FAST_MODEL
_GRADE_MODEL   = OLLAMA_FAST_MODEL

_MAX_CHUNKS_TO_GRADE = 6
_AGENT_TIMEOUT       = 60  # seconds; wall-clock limit for the ReACT loop
_DB_FALLBACK_MSG     = "Je n'ai pas pu récupérer les données. Veuillez réessayer."
_THINK_STRIP_RE      = re.compile(r"<think>.*?</think>", re.DOTALL)
_GENERATE_MODEL      = OLLAMA_MODEL
_GRADER_MODEL        = OLLAMA_MODEL   # use full model for accurate grading
_SOURCE_CITE_RE      = re.compile(r"\[Source:\s*([^\]]+)\]", re.IGNORECASE)
_EMPTY_CTX_MSG       = (
    "Je n'ai pas trouvé de données suffisantes pour répondre à cette question. "
    "Veuillez reformuler ou vérifier que les outils ont bien été exécutés."
)
_MAX_CORRECTION_LOOPS = 2
_MIN_GENERATION_LEN   = 30
_GRADING_CTX_LIMIT    = 2000  # truncate context fed to graders to stay within token budget

_SUMMARIZE_MODEL      = OLLAMA_FAST_MODEL
_EXTRACT_MODEL        = OLLAMA_FAST_MODEL
_SUMMARIZE_THRESHOLD  = 12   # total messages before episodic compression kicks in
_KEEP_LAST_N          = 4    # messages to preserve unsummarized
_MAX_MEMORIES         = 20   # hard ceiling on stored facts per user

_SUMMARIZE_SYSTEM = (
    "Tu es un résumeur de conversations. "
    "Résume cette conversation en 3-5 phrases qui capturent les sujets abordés, "
    "les données demandées, et les conclusions importantes. Résume en français."
)

_EXTRACT_SYSTEM = (
    "Tu es un extracteur de préférences utilisateur. "
    "Analyse cet échange et extrais les faits durables sur l'utilisateur.\n\n"
    "Types de faits à extraire:\n"
    "- Produits ou catégories qui intéressent l'utilisateur\n"
    "- Concurrents que l'utilisateur surveille\n"
    "- Préférences de format ou de fréquence\n"
    "- Objectifs stratégiques mentionnés\n\n"
    "Règles:\n"
    "- Extrais UNIQUEMENT des faits durables, pas des questions ponctuelles\n"
    "- Si aucun fait durable n'est présent, réponds exactement: AUCUN\n"
    "- Sinon, retourne UN fait par ligne, maximum 3\n"
    "- Chaque fait en une phrase courte"
)

_GROUNDING_SYSTEM = (
    "Tu es un évaluateur de fidélité STRICT.\n"
    "Tu vérifies si chaque affirmation factuelle de la réponse est soutenue par le contexte source.\n\n"
    "Réponds UNIQUEMENT par 'oui' ou 'non'.\n"
    "- 'oui' = toutes les données chiffrées et affirmations factuelles viennent du contexte\n"
    "- 'non' = la réponse invente des chiffres, cite des sources inexistantes, "
    "ou affirme des faits absents du contexte\n\n"
    "Ignore le style et la mise en forme. Juge uniquement la fidélité aux faits du contexte."
)

_RELEVANCE_SYSTEM = (
    "Tu es un évaluateur de pertinence STRICT.\n"
    "Tu vérifies si une réponse répond PRÉCISÉMENT à la question posée.\n\n"
    "Réponds UNIQUEMENT par 'oui' ou 'non'.\n"
    "- 'oui' = la réponse fournit directement l'information demandée par la question\n"
    "- 'non' si la réponse :\n"
    "  * traite du même sujet mais ne répond pas à la question précise\n"
    "  * contient des messages d'erreur, 'impossible de récupérer', 'non disponible'\n"
    "  * dit qu'elle ne peut pas répondre\n"
    "  * répond à une autre question que celle posée\n\n"
    "Exemples de 'non':\n"
    "  Question: 'Quel est le seuil recommandé ?' → Réponse liste les prix actuels → non\n"
    "  Question: 'Résume le document' → Réponse: 'impossible de récupérer les données' → non"
)

_REWRITE_SYSTEM = (
    "Tu es un moteur de réécriture de requêtes. "
    "Ta seule tâche est de transformer une question de suivi en une question autonome complète.\n\n"
    "Règles:\n"
    "- Si la question est déjà autonome, retourne-la telle quelle\n"
    "- Remplace les pronoms (il, elle, ça, les, y) par les entités mentionnées dans l'historique\n"
    "- Ajoute le contexte implicite de la conversation\n"
    "- Garde la question en français\n"
    "- Retourne UNIQUEMENT la question réécrite, rien d'autre — pas d'explication"
)


def _format_history(history: list) -> str:
    lines = []
    for msg in history[-4:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        label = "assistant" if role == "assistant" else "user"
        lines.append(f"{label}: {content}")
    return "\n".join(lines)


def analyze_query_node(state: RagState) -> dict:
    logger.debug("node: analyze_query")
    query = state["original_query"]
    history = state.get("conversation_history") or []

    # No history → nothing to rewrite against
    if not history:
        return {"rewritten_query": query}

    history_text = _format_history(history)
    user_prompt = (
        f"Historique de la conversation:\n{history_text}\n\n"
        f"Question de suivi: {query}\n\n"
        "Question réécrite:"
    )

    rewritten = call_ollama(
        model=_REWRITE_MODEL,
        system_prompt=_REWRITE_SYSTEM,
        user_prompt=user_prompt,
        temperature=0.0,
    )

    if not rewritten:
        logger.warning("analyze_query: LLM returned empty, using original query")
        return {"rewritten_query": query}

    logger.info("analyze_query: '%s' → '%s'", query, rewritten)
    return {"rewritten_query": rewritten}


_VALID_ROUTES = {"DIRECT", "DB_TOOLS", "DOCUMENTS", "HYBRID"}

_ROUTE_SYSTEM = (
    "Tu es un routeur de requêtes pour une plateforme de veille concurrentielle.\n\n"
    "Classifie chaque requête dans exactement une catégorie. "
    "Réponds avec UN SEUL MOT — le nom de la catégorie.\n\n"
    "DIRECT — salutations, remerciements, questions générales, chitchat sans besoin de données\n"
    "DB_TOOLS — questions sur les prix, produits, concurrents, événements, promotions, "
    "ruptures, positionnement, alertes, KPIs, tableaux de bord\n"
    "DOCUMENTS — questions demandant de résumer, analyser ou extraire des informations depuis "
    "des documents uploadés (rapports annuels, études de marché, analyses PDF, fichiers)\n"
    "HYBRID — questions nécessitant à la fois les données en base ET les documents uploadés "
    "(ex: comparer les données réelles avec ce que dit le rapport)\n\n"
    "Exemples DOCUMENTS: 'résume le rapport', 'que dit le document', 'selon l'analyse', "
    "'contenu du fichier', 'd'après le rapport annuel'\n"
    "En cas de doute entre DIRECT et DB_TOOLS, choisis DB_TOOLS.\n"
    "En cas de doute entre DOCUMENTS et HYBRID, choisis HYBRID."
)

_GREETING_RE  = re.compile(r"^(bonjour|salut|hello|merci|bonsoir|hey|ok)\b", re.IGNORECASE)
_DOC_RE       = re.compile(
    r"\b(document|fichier|upload[eé]|pdf|le\s+doc|rapport\s+upload[eé]|"
    r"rapport\s+annuel|rapport\s+\d{4}|contenu\s+du\s+rapport|"
    r"selon\s+le\s+rapport|d['\s]apr[eè]s\s+le|que\s+dit\s+le|"
    r"dans\s+le\s+document|r[eé]sum[eé].*rapport|analyser\s+le\s+rapport)\b",
    re.IGNORECASE,
)
_ROUTE_WORD_RE = re.compile(r"\b(DIRECT|DB_TOOLS|DOCUMENTS|HYBRID)\b")


def _parse_route(text: str) -> str:
    m = _ROUTE_WORD_RE.search(text.strip().upper())
    if m and m.group(1) in _VALID_ROUTES:
        return m.group(1)
    return "DB_TOOLS"


def route_node(state: RagState) -> dict:
    logger.debug("node: route")
    query = state.get("rewritten_query") or state.get("original_query", "")

    # Fast path: short greeting → DIRECT, no LLM call
    if len(query) < 20 and _GREETING_RE.match(query.strip()):
        logger.info("route: DIRECT (greeting fast-path) for '%s'", query)
        return {"route": "DIRECT"}

    # Fast path: explicit document/file reference → DOCUMENTS, no LLM call
    # This ensures CRAG is triggered for document-related queries
    if _DOC_RE.search(query):
        logger.info("route: DOCUMENTS (doc fast-path) for '%s'", query)
        return {"route": "DOCUMENTS"}

    raw = call_ollama(
        model=_ROUTE_MODEL,
        system_prompt=_ROUTE_SYSTEM,
        user_prompt=query,
        temperature=0.0,
    )

    if not raw:
        logger.warning("route: LLM returned empty, defaulting to DB_TOOLS")
        return {"route": "DB_TOOLS"}

    route = _parse_route(raw)
    logger.info("route: %s for '%s' (raw: '%s')", route, query, raw)
    return {"route": route}


_GRADE_SYSTEM = (
    "Tu es un évaluateur de pertinence pour un système RAG. "
    "Tu dois juger si un extrait de document est pertinent pour répondre à la question de l'utilisateur.\n\n"
    "Réponds UNIQUEMENT par 'oui' ou 'non'.\n"
    "- 'oui' = l'extrait contient des informations utiles pour répondre à la question\n"
    "- 'non' = l'extrait est hors sujet ou trop vague pour être utile"
)


_DIRECT_GREETINGS = re.compile(r"^(bonjour|salut|hello|bonsoir|hey)\b", re.IGNORECASE)
_DIRECT_THANKS    = re.compile(r"^(merci|ok\b|parfait|super|très bien)", re.IGNORECASE)


def direct_answer_node(state: RagState) -> dict:
    logger.debug("node: direct_answer")
    query   = state.get("rewritten_query") or state.get("original_query", "")
    user_id = state["user_id"]

    if _DIRECT_GREETINGS.match(query.strip()):
        nom = "vous"
        try:
            from src.common.database import SessionLocal as _SL  # noqa: PLC0415
            from src.common.models import Utilisateur             # noqa: PLC0415
            db = _SL()
            try:
                user = db.get(Utilisateur, user_id)
                if user and user.nom:
                    nom = user.nom.split()[0]
            finally:
                db.close()
        except Exception:
            pass
        response = (
            f"Bonjour {nom} ! Comment puis-je vous aider dans "
            "votre veille concurrentielle aujourd'hui ?"
        )
    elif _DIRECT_THANKS.match(query.strip()):
        response = "Je vous en prie ! N'hésitez pas si vous avez d'autres questions."
    else:
        response = (
            "Je suis PW-Insight, votre assistant de veille concurrentielle. "
            "Je peux vous aider à analyser les prix, suivre vos concurrents, "
            "identifier les ruptures de stock et évaluer votre positionnement. "
            "Posez-moi une question sur vos données !"
        )

    return {"generation": response, "sources": []}


def _extract_content(content) -> str:
    """Flatten AIMessage content (str or list of blocks) and strip <think> blocks."""
    if isinstance(content, list):
        text = " ".join(
            b.get("text", "") if isinstance(b, dict) else str(b)
            for b in content
        )
    else:
        text = str(content or "")
    return _THINK_STRIP_RE.sub("", text).strip()


def _build_doc_context(graded_docs: list) -> str:
    parts = ["Documents pertinents trouvés:"]
    for doc in graded_docs:
        fname = doc.get("source_filename", "document")
        snippet = doc.get("content", "")[:300]
        parts.append(f"--- Document: {fname}\n{snippet}...")
    return "\n".join(parts)


def _invoke_agent(
    tenant_id: int,
    tenant_context: dict,
    query: str,
    graded_docs: list,
) -> dict:
    """Runs in a worker thread — opens its own DB session so the session is thread-local."""
    # Lazy imports to avoid circular dependency at module load time
    from src.common.database import SessionLocal as _SL  # noqa: PLC0415
    from src.ai.agent import build_agent               # noqa: PLC0415

    db = _SL()
    try:
        ctx = tenant_context
        agent = build_agent(
            db=db,
            tenant_id=tenant_id,
            tenant_nom=ctx.get("nom", ""),
            profil_client=ctx.get("profil_client", "SITE_ECOMMERCE"),
            own_site_slug=ctx.get("own_site_slug"),
            own_brand=ctx.get("own_brand"),
            own_site_id=ctx.get("own_site_id"),
        )

        messages: list = []
        if graded_docs:
            messages.append(SystemMessage(content=_build_doc_context(graded_docs)))
        messages.append(HumanMessage(content=query))

        result = agent.invoke(
            {"messages": messages},
            config={"recursion_limit": 20},  # caps ReACT iterations (~7-8 tool calls)
        )

        tools_used: list[str] = []
        generation_text = ""

        for msg in result.get("messages", []):
            # Collect every distinct tool name that was called
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
                    if name and name not in tools_used:
                        tools_used.append(name)
            # The final AIMessage without tool_calls is the answer
            if (
                isinstance(msg, AIMessage)
                and msg.content
                and not getattr(msg, "tool_calls", None)
            ):
                generation_text = _extract_content(msg.content)

        return {"tools_used": tools_used, "generation_text": generation_text}
    finally:
        db.close()


def db_agent_node(state: RagState) -> dict:
    logger.debug("node: db_agent")
    query = state.get("rewritten_query") or state.get("original_query", "")
    tenant_id = state["tenant_id"]
    tenant_context = state.get("tenant_context") or {}
    graded_docs = state.get("graded_docs") or []

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                _invoke_agent, tenant_id, tenant_context, query, graded_docs
            )
            agent_result = future.result(timeout=_AGENT_TIMEOUT)

        tools_used = agent_result["tools_used"]
        generation_text = agent_result["generation_text"]

        # Sources: tool names + filenames from any documents that informed the answer
        doc_sources = [
            d["source_filename"]
            for d in graded_docs
            if d.get("source_filename")
        ]
        sources = tools_used + doc_sources

        logger.info(
            "db_agent: tools=%s answer_len=%d",
            tools_used, len(generation_text),
        )
        return {
            "db_results": {
                "tools_called": tools_used,
                "raw_output": generation_text,
            },
            "sources": sources,
        }

    except FuturesTimeoutError:
        logger.error("db_agent: timed out after %ds for tenant %d", _AGENT_TIMEOUT, tenant_id)
        return {
            "db_results": {"tools_called": [], "raw_output": ""},
            "generation": _DB_FALLBACK_MSG,
            "sources": [],
        }
    except Exception as exc:
        logger.error("db_agent: unexpected error: %s", exc, exc_info=True)
        return {
            "db_results": {"tools_called": [], "raw_output": ""},
            "generation": _DB_FALLBACK_MSG,
            "sources": [],
        }


def retrieve_docs_node(state: RagState) -> dict:
    logger.debug("node: retrieve_docs")
    query = state.get("rewritten_query") or state.get("original_query", "")
    tenant_id = state["tenant_id"]

    db = SessionLocal()
    try:
        docs = hybrid_search(db, tenant_id, query, limit=5)
    except Exception as exc:
        logger.error("retrieve_docs: hybrid_search raised unexpectedly: %s", exc)
        docs = []
    finally:
        db.close()

    logger.info("retrieve_docs: %d chunks retrieved for tenant %d", len(docs), tenant_id)
    return {"retrieved_docs": docs}


def grade_docs_node(state: RagState) -> dict:
    logger.debug("node: grade_docs")
    retrieved = state.get("retrieved_docs") or []
    query = state.get("rewritten_query") or state.get("original_query", "")

    if not retrieved:
        return {"graded_docs": []}

    to_grade = retrieved[:_MAX_CHUNKS_TO_GRADE]
    graded: list[dict] = []
    all_empty = True  # tracks whether Ollama responded at all

    for chunk in to_grade:
        user_prompt = (
            f"Question: {query}\n\n"
            f"Extrait de document:\n{chunk['content']}\n\n"
            "Cet extrait est-il pertinent? (oui/non)"
        )
        raw = call_ollama(
            model=_GRADE_MODEL,
            system_prompt=_GRADE_SYSTEM,
            user_prompt=user_prompt,
            temperature=0.0,
        )

        if raw:
            all_empty = False
            relevant = "non" not in raw.strip().lower()
        else:
            relevant = True  # fail-open: include chunk when Ollama is silent

        if relevant:
            graded.append(chunk)

    if all_empty and to_grade:
        logger.warning(
            "CRAG: Ollama unreachable, skipping grading — passing all %d chunks through",
            len(to_grade),
        )

    # CRAG decision log
    n = len(graded)
    if n == 0:
        logger.info("CRAG: no relevant documents found, falling back to DB agent")
    elif n == 1:
        logger.info("CRAG: only 1 relevant chunk, marginal")
    else:
        logger.info("CRAG: %d relevant chunks found, proceeding", n)

    # Enrich passing chunks with source filename for later citation
    if graded:
        doc_ids = list({c["document_id"] for c in graded})
        db = SessionLocal()
        try:
            docs = db.query(TenantDocument).filter(TenantDocument.id.in_(doc_ids)).all()
            filename_map = {d.id: d.filename for d in docs}
        except Exception as exc:
            logger.warning("grade_docs: could not fetch source filenames: %s", exc)
            filename_map = {}
        finally:
            db.close()

        for chunk in graded:
            chunk["source_filename"] = filename_map.get(chunk["document_id"], "unknown")

    return {"graded_docs": graded}


def _build_generation_context(state: RagState) -> str:
    """Assemble grounding context from DB results and/or graded document chunks."""
    parts = []
    db_results = state.get("db_results") or {}
    raw_output = db_results.get("raw_output", "")
    if raw_output:
        parts.append("=== DONNÉES DE LA BASE ===\n" + raw_output)

    for doc in (state.get("graded_docs") or []):
        fname = doc.get("source_filename", "document")
        page  = (doc.get("metadata") or {}).get("page", "?")
        parts.append(f"=== DOCUMENT: {fname} (page {page}) ===\n{doc.get('content', '')}")

    return "\n\n".join(parts)


def _extract_cited_sources(text: str) -> list[str]:
    seen: set[str] = set()
    result = []
    for match in _SOURCE_CITE_RE.findall(text):
        name = match.strip()
        if name not in seen:
            seen.add(name)
            result.append(name)
    return result


def generate_node(state: RagState) -> dict:
    logger.debug("node: generate")
    query          = state.get("rewritten_query") or state.get("original_query", "")
    ctx            = state.get("tenant_context") or {}
    tenant_nom     = ctx.get("nom", "")
    profil_client  = ctx.get("profil_client", "SITE_ECOMMERCE")
    own_site       = ctx.get("own_site_slug") or ""
    own_brand      = ctx.get("own_brand") or ""
    history        = state.get("conversation_history") or []
    correction_cnt = state.get("correction_count", 0)

    full_context = _build_generation_context(state)

    # Empty context: db_agent errored or routing sent something unexpected here
    if not full_context:
        existing = state.get("generation", "")
        return {
            "generation": existing or _EMPTY_CTX_MSG,
            "sources":    state.get("sources") or [],
            "correction_count": correction_cnt,
        }

    # Tenant-specific context line
    if profil_client == "SITE_ECOMMERCE" and own_site:
        tenant_desc = f"Tu surveilles les concurrents de {own_site}."
    elif profil_client == "MARQUE" and own_brand:
        tenant_desc = f"Tu surveilles la marque {own_brand} sur tous les distributeurs."
    else:
        tenant_desc = ""

    system_prompt = (
        f"Tu es PW-Insight, assistant de veille concurrentielle pour {tenant_nom}.\n"
        f"Profil: {profil_client}. {tenant_desc}\n\n"
        "Réponds en français. Sois concis et actionnable.\n\n"
        "RÈGLES DE CITATION OBLIGATOIRES:\n"
        "- Base chaque affirmation sur le contexte fourni\n"
        "- Après chaque affirmation clé, indique la source entre crochets: [Source: nom_de_la_source]\n"
        "- Sources possibles: les noms d'outils (aperçu_marché, événements_récents, "
        "positionnement, recherche_produits, activité_concurrents, ruptures_stock) "
        "ou les noms de documents uploadés\n"
        "- Si une information ne vient pas du contexte, dis-le explicitement: "
        "'cette information n'est pas disponible dans mes sources'\n"
        "- Ne fabrique JAMAIS de données chiffrées\n"
        "- Structure ta réponse avec des sections claires\n"
        "- Termine par une recommandation actionnable"
    )

    # Retry awareness: previous answer failed grounding — add a stricter anti-hallucination warning
    is_grounding_retry = correction_cnt > 0 and not state.get("grounding_ok", True)
    if is_grounding_retry:
        system_prompt += (
            "\n\nATTENTION: ta réponse précédente contenait des informations non soutenues "
            "par le contexte. Cette fois, cite UNIQUEMENT des données présentes dans le "
            "contexte ci-dessus. Si tu ne trouves pas l'information, dis explicitement "
            "que tu ne la trouves pas."
        )

    # User prompt: recent conversation + grounding context + question
    user_parts: list[str] = []

    if history:
        user_parts.append("Conversation récente:\n" + _format_history(history[-3:]))

    user_parts.append("Contexte disponible:\n" + full_context)
    user_parts.append(
        f"Question de l'utilisateur:\n{query}\n\n"
        "Réponds en utilisant uniquement le contexte ci-dessus. Cite tes sources."
    )

    raw = call_ollama(
        model=_GENERATE_MODEL,
        system_prompt=system_prompt,
        user_prompt="\n\n".join(user_parts),
        temperature=0.1,
    )

    if not raw:
        logger.warning("generate: LLM returned empty, returning fallback")
        return {
            "generation": state.get("generation") or _EMPTY_CTX_MSG,
            "sources":    state.get("sources") or [],
            "correction_count": correction_cnt,
        }

    # Prefer sources the LLM actually cited; fall back to state sources if none found
    cited   = _extract_cited_sources(raw)
    sources = cited if cited else (state.get("sources") or [])

    logger.info("generate: %d chars, %d sources cited: %s", len(raw), len(cited), cited)
    return {
        "generation":     raw,
        "sources":        sources,
        "correction_count": correction_cnt,
    }


_FALLBACK_RE = re.compile(
    r"(impossible\s+de\s+r[eé]cup[eé]rer|"
    r"je\s+n['\s]ai\s+pas\s+pu\s+r[eé]cup[eé]rer|"
    r"toutes\s+les\s+requ[eê]tes\s+(ont\s+)?[eé]chou[eé]|"
    r"erreur\s+lors\s+de\s+la\s+r[eé]cup[eé]ration|"
    r"diagnostic\s+technique\s+[aà]\s+l['\s][eé]quipe|"
    r"veuillez\s+r[eé]essayer\s+ult[eé]rieurement)",
    re.IGNORECASE,
)


def grade_answer_node(state: RagState) -> dict:
    logger.debug("node: grade_answer")
    generation     = state.get("generation", "")
    correction_cnt = state.get("correction_count", 0)
    query          = state.get("rewritten_query") or state.get("original_query", "")

    # Skip grading when we're at the retry cap or when the answer is a short fallback
    if correction_cnt >= _MAX_CORRECTION_LOOPS or len(generation) < _MIN_GENERATION_LEN:
        logger.debug(
            "grade_answer: skipping graders (correction_count=%d, gen_len=%d)",
            correction_cnt, len(generation),
        )
        return {"grounding_ok": True, "relevance_ok": True, "correction_count": correction_cnt}

    # Auto-fail: error/fallback messages are never relevant — no LLM call needed
    if _FALLBACK_RE.search(generation):
        logger.info(
            "Self-RAG: auto-fail relevance — fallback/error message detected (attempt %d)",
            correction_cnt + 1,
        )
        return {
            "grounding_ok":    True,
            "relevance_ok":    False,
            "correction_count": correction_cnt + 1,
        }

    # --- Grader A: Grounding (anti-hallucination) ---
    grounding_context = _build_generation_context(state)[:_GRADING_CTX_LIMIT]
    grounding_raw = call_ollama(
        model=_GRADER_MODEL,
        system_prompt=_GROUNDING_SYSTEM,
        user_prompt=(
            f"Contexte source:\n{grounding_context}\n\n"
            f"Réponse générée:\n{generation}\n\n"
            "La réponse est-elle fidèle au contexte? (oui/non)"
        ),
        temperature=0.0,
    )

    if grounding_raw:
        grounding_ok = "non" not in grounding_raw.strip().lower()
    else:
        logger.warning("grade_answer: grounding grader unreachable, failing open")
        grounding_ok = True

    # --- Grader B: Relevance (answer quality) ---
    relevance_raw = call_ollama(
        model=_GRADER_MODEL,
        system_prompt=_RELEVANCE_SYSTEM,
        user_prompt=(
            f"Question de l'utilisateur:\n{query}\n\n"
            f"Réponse générée:\n{generation}\n\n"
            "La réponse est-elle pertinente? (oui/non)"
        ),
        temperature=0.0,
    )

    if relevance_raw:
        relevance_ok = "non" not in relevance_raw.strip().lower()
    else:
        logger.warning("grade_answer: relevance grader unreachable, failing open")
        relevance_ok = True

    # Increment correction counter only when a retry is needed
    if grounding_ok and relevance_ok:
        new_cnt = correction_cnt
        logger.info("Self-RAG: answer accepted (grounding=ok, relevance=ok)")
    else:
        new_cnt = correction_cnt + 1
        if not grounding_ok:
            logger.info("Self-RAG: grounding failure, regenerating (attempt %d)", new_cnt)
        if not relevance_ok:
            logger.info("Self-RAG: relevance failure, rewriting query (attempt %d)", new_cnt)

    return {
        "grounding_ok":    grounding_ok,
        "relevance_ok":    relevance_ok,
        "correction_count": new_cnt,
    }


def _is_duplicate(new_fact: str, existing_contents: list[str]) -> bool:
    """True if ≥50% of the significant words in new_fact appear in any existing memory."""
    key_words = {w for w in new_fact.lower().split() if len(w) > 5}
    if not key_words:
        return False
    for existing in existing_contents:
        matches = sum(1 for w in key_words if w in existing)
        if matches >= max(1, len(key_words) // 2):
            return True
    return False


def _classify_fact(text: str) -> str:
    lower = text.lower()
    if any(w in lower for w in ["produit", "marque", "laptop", "smartphone", "télé",
                                  "iphone", "samsung", "intel", "amd", "catégorie"]):
        return "product"
    if any(w in lower for w in ["mytek", "spacenet", "tunisianet", "concurrent",
                                  "carrefour", "géant", "aziza", "distributeur"]):
        return "competitor"
    if any(w in lower for w in ["stratégi", "objectif", "préfèr", "format",
                                  "fréquence", "rapport", "alerte"]):
        return "preference"
    return "context"


def update_memory_node(state: RagState) -> dict:
    logger.debug("node: update_memory")
    user_id         = state["user_id"]
    conversation_id = state["conversation_id"]
    generation      = state.get("generation", "")
    sources         = state.get("sources") or []
    original_query  = state.get("original_query", "")

    from src.common.database import SessionLocal as _SL          # noqa: PLC0415
    from src.common.models import ConversationIA, MessageIA, UserMemory  # noqa: PLC0415
    from src.ai.memory import save_message                       # noqa: PLC0415
    from sqlalchemy import func as _func                         # noqa: PLC0415

    db = _SL()
    try:
        # Part A — Persist the assistant response
        try:
            save_message(db, conversation_id, user_id, "assistant", generation, sources)
        except Exception as exc:
            logger.error("Memory: failed to save assistant message: %s", exc)

        # Part B — Episodic memory: compress old messages into a summary
        try:
            total = (
                db.query(_func.count(MessageIA.id))
                .filter(MessageIA.id_conversation == conversation_id)
                .scalar()
            ) or 0

            if total > _SUMMARIZE_THRESHOLD:
                all_msgs = (
                    db.query(MessageIA)
                    .filter(MessageIA.id_conversation == conversation_id)
                    .order_by(MessageIA.date_creation.asc())
                    .all()
                )
                to_summarize = all_msgs[:-_KEEP_LAST_N] if len(all_msgs) > _KEEP_LAST_N else []

                if to_summarize:
                    history_text = "\n".join(
                        f"{m.role}: {m.contenu}" for m in to_summarize
                    )
                    summary = call_ollama(
                        model=_SUMMARIZE_MODEL,
                        system_prompt=_SUMMARIZE_SYSTEM,
                        user_prompt=history_text,
                        temperature=0.0,
                    )
                    if summary:
                        conv = db.get(ConversationIA, conversation_id)
                        if conv:
                            conv.resume = summary
                        for msg in to_summarize:
                            db.delete(msg)
                        db.commit()
                        logger.info(
                            "Memory: summarized conversation (%d→%d messages) for conv %s",
                            total, _KEEP_LAST_N, conversation_id,
                        )
        except Exception as exc:
            logger.warning("Memory: episodic summarization failed: %s", exc)

        # Part C — Semantic memory: extract and store durable user facts
        try:
            raw = call_ollama(
                model=_EXTRACT_MODEL,
                system_prompt=_EXTRACT_SYSTEM,
                user_prompt=f"Question: {original_query}\nRéponse: {generation[:500]}",
                temperature=0.0,
            )

            if not raw or "AUCUN" in raw.upper():
                logger.info("Memory: skipped extraction (AUCUN) for user %d", user_id)
            else:
                facts = [
                    line.strip()
                    for line in raw.splitlines()
                    if line.strip() and len(line.strip()) >= 10
                ]
                if facts:
                    existing = (
                        db.query(UserMemory)
                        .filter(UserMemory.id_utilisateur == user_id)
                        .all()
                    )
                    existing_contents = [m.content.lower() for m in existing]
                    new_count = 0

                    for fact in facts:
                        if _is_duplicate(fact, existing_contents):
                            continue
                        db.add(UserMemory(
                            id_utilisateur=user_id,
                            content=fact,
                            category=_classify_fact(fact),
                        ))
                        existing_contents.append(fact.lower())  # prevent same-batch dups
                        new_count += 1

                    if new_count:
                        db.commit()

                        # Prune to _MAX_MEMORIES
                        total_mems = (
                            db.query(_func.count(UserMemory.id))
                            .filter(UserMemory.id_utilisateur == user_id)
                            .scalar()
                        ) or 0
                        if total_mems > _MAX_MEMORIES:
                            oldest = (
                                db.query(UserMemory)
                                .filter(UserMemory.id_utilisateur == user_id)
                                .order_by(UserMemory.created_at.asc())
                                .limit(total_mems - _MAX_MEMORIES)
                                .all()
                            )
                            for m in oldest:
                                db.delete(m)
                            db.commit()

                        logger.info(
                            "Memory: extracted %d new facts for user %d", new_count, user_id
                        )
                    else:
                        logger.info(
                            "Memory: all %d extracted facts were duplicates for user %d",
                            len(facts), user_id,
                        )
        except Exception as exc:
            logger.warning("Memory: fact extraction failed: %s", exc)

    finally:
        db.close()

    return {}
