import json
import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from src.ai import OLLAMA_FAST_MODEL
from src.ai.document_processor import process_document
from src.ai.graph import build_rag_graph
from src.ai.graph.llm_utils import call_ollama
from src.ai.memory import load_full_context, save_message
from src.api.deps import get_db, require_plan, require_role
from src.common.models import ConversationIA, MessageIA, Tenant, TenantDocument

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", dependencies=[Depends(require_plan('PREMIUM'))])

_ROLES = ("MANAGER", "RESP_MARKETING", "EQUIPE_MARKETING")


class ConversationCreate(BaseModel):
    titre: str | None = None


class MessageCreate(BaseModel):
    content: str


def _get_tenant(db: Session, tenant_id: int) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


# ── Conversations ─────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    convs = (
        db.query(ConversationIA)
        .filter(ConversationIA.id_utilisateur == current_user.id)
        .order_by(ConversationIA.date_derniere_activite.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id":                     str(c.id),
            "titre":                  c.titre or "Nouvelle conversation",
            "date_debut":             c.date_debut,
            "date_derniere_activite": c.date_derniere_activite,
        }
        for c in convs
    ]


@router.post("/conversations", status_code=201)
def create_conversation(
    body: ConversationCreate = ConversationCreate(),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    conv = ConversationIA(
        id             = uuid.uuid4(),
        id_utilisateur = current_user.id,
        type           = "assistant",
        titre          = body.titre,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {
        "id":         str(conv.id),
        "titre":      conv.titre or "Nouvelle conversation",
        "date_debut": conv.date_debut,
    }


@router.get("/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    conv = db.get(ConversationIA, conversation_id)
    if not conv or conv.id_utilisateur != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msgs = (
        db.query(MessageIA)
        .filter(MessageIA.id_conversation == conversation_id)
        .order_by(MessageIA.date_creation.asc())
        .all()
    )
    return [
        {
            "id":            str(m.id),
            "role":          m.role,
            "content":       m.contenu,
            "sources":       m.sources or [],
            "date_creation": m.date_creation,
        }
        for m in msgs
    ]


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    conv = db.get(ConversationIA, conversation_id)
    if not conv or conv.id_utilisateur != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    tenant = _get_tenant(db, current_user.tenant_id)

    # Pre-extract all ORM-lazy values before entering the async generator
    tenant_id     = tenant.id
    tenant_nom    = tenant.nom_organisation
    profil_client = tenant.profil_client
    own_site_id   = tenant.own_site_id
    own_brand     = tenant.own_brand
    own_site_slug = tenant.own_site.scraper_id if tenant.own_site else None
    user_id       = current_user.id

    # Load all three memory tiers while the session is still open
    context          = load_full_context(db, user_id, conversation_id)
    is_first_message = len(context["conversation_history"]) == 0

    # Persist the user message before the graph runs so it is never lost
    save_message(db, conversation_id, user_id, "user", body.content)

    async def generate():
        import asyncio

        # Inject episodic summary as a synthetic system message if present
        conversation_history = list(context["conversation_history"])
        if context.get("episodic_summary"):
            conversation_history = [
                {"role": "system",
                 "content": "Résumé de la conversation précédente: " + context["episodic_summary"]}
            ] + conversation_history

        initial_state = {
            "original_query":       body.content,
            "rewritten_query":      "",
            "conversation_id":      str(conversation_id),
            "user_id":              user_id,
            "tenant_id":            tenant_id,
            "tenant_context": {
                "nom":           tenant_nom,
                "profil_client": profil_client,
                "own_site_slug": own_site_slug,
                "own_brand":     own_brand,
                "own_site_id":   own_site_id,
            },
            "route":            "",
            "retrieved_docs":   [],
            "graded_docs":      [],
            "db_results":       {},
            "generation":       "",
            "sources":          [],
            "grounding_ok":     True,
            "relevance_ok":     True,
            "correction_count": 0,
            "conversation_history": conversation_history,
            "user_memories":    context["user_memories"],
            "messages":         [],
            "error":            None,
        }

        yield {"event": "status", "data": json.dumps({"status": "Analyse de la question…"})}

        try:
            loop = asyncio.get_event_loop()
            graph = build_rag_graph()
            final_state = await loop.run_in_executor(None, graph.invoke, initial_state)

            route          = final_state.get("route", "DB_TOOLS")
            correction_cnt = final_state.get("correction_count", 0)
            sources        = final_state.get("sources", [])

            # Emit node-progress status pills (Approach A: after graph, before text)
            _route_labels = {
                "DIRECT":    "Réponse directe",
                "DB_TOOLS":  "Requête base de données",
                "DOCUMENTS": "Recherche documentaire",
                "HYBRID":    "Analyse hybride",
            }
            yield {"event": "status", "data": json.dumps({
                "status": f"Routage: {_route_labels.get(route, route)}",
                "route":  route,
            })}
            await asyncio.sleep(0)

            if route in ("DOCUMENTS", "HYBRID"):
                yield {"event": "status", "data": json.dumps({"status": "Recherche dans les documents…"})}
                await asyncio.sleep(0)
                yield {"event": "status", "data": json.dumps({"status": "Évaluation de la pertinence…"})}
                await asyncio.sleep(0)

            if route in ("DB_TOOLS", "HYBRID"):
                yield {"event": "status", "data": json.dumps({"status": "Collecte de données…"})}
                await asyncio.sleep(0)

            yield {"event": "status", "data": json.dumps({"status": "Génération de la réponse…"})}
            await asyncio.sleep(0)

            if correction_cnt > 0:
                yield {"event": "status", "data": json.dumps({
                    "status": f"Vérification de la réponse… ({correction_cnt} correction{'s' if correction_cnt > 1 else ''})"
                })}
                await asyncio.sleep(0)

            # Emit tool pills before the text so they appear as context
            for source in sources:
                yield {"event": "tool_use", "data": json.dumps({"tool": source})}
                await asyncio.sleep(0.05)

            # Stream the generation text in small chunks
            text = final_state.get("generation", "")
            chunk_size = 12
            for i in range(0, len(text), chunk_size):
                yield {"event": "message", "data": json.dumps({"content": text[i:i + chunk_size]})}
                await asyncio.sleep(0.02)

            # Send the final source list so the frontend can render source pills
            yield {"event": "sources", "data": json.dumps({"sources": sources})}

            # Auto-generate a better conversation title after the first exchange
            if is_first_message:
                try:
                    new_title = call_ollama(
                        model=OLLAMA_FAST_MODEL,
                        system_prompt=(
                            "Génère un titre de 5 mots maximum en français pour cette "
                            "conversation. Retourne UNIQUEMENT le titre, rien d'autre."
                        ),
                        user_prompt=f"Q: {body.content}\nR: {text[:200]}",
                        temperature=0.0,
                    )
                    if new_title:
                        new_title = new_title.strip()[:100]
                        from src.common.database import SessionLocal as _SL
                        title_db = _SL()
                        try:
                            c = title_db.get(ConversationIA, conversation_id)
                            if c:
                                c.titre = new_title
                                title_db.commit()
                        finally:
                            title_db.close()
                        yield {"event": "title", "data": json.dumps({"title": new_title})}
                except Exception as title_exc:
                    logger.warning("Title generation failed: %s", title_exc)

        except Exception as exc:
            logger.error("Graph invocation failed: %s", exc, exc_info=True)
            yield {"event": "message", "data": json.dumps({
                "content": (
                    "Désolé, une erreur s'est produite lors du traitement de votre question. "
                    "Veuillez réessayer."
                )
            })}

        finally:
            yield {"event": "done", "data": ""}

    return EventSourceResponse(generate())


# ── Documents ─────────────────────────────────────────────────────────────────

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/documents", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Format non supporté. Utilisez PDF, DOCX ou TXT.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop grand. Maximum 10 MB.")

    doc = TenantDocument(
        tenant_id      = current_user.tenant_id,
        id_utilisateur = current_user.id,
        filename       = file.filename,
        file_type      = ext,
        chunk_count    = 0,
    )
    db.add(doc)
    db.flush()

    chunk_count = process_document(
        file_bytes  = file_bytes,
        filename    = file.filename,
        tenant_id   = current_user.tenant_id,
        document_id = doc.id,
        db          = db,
    )
    doc.chunk_count = chunk_count
    db.commit()

    return {
        "id":          doc.id,
        "filename":    doc.filename,
        "chunk_count": chunk_count,
        "message":     f"Document indexé en {chunk_count} segments.",
    }


@router.get("/documents")
def list_documents(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    docs = (
        db.query(TenantDocument)
        .filter(TenantDocument.tenant_id == current_user.tenant_id)
        .order_by(TenantDocument.uploaded_at.desc())
        .all()
    )
    return [
        {
            "id":          d.id,
            "filename":    d.filename,
            "file_type":   d.file_type,
            "chunk_count": d.chunk_count,
            "uploaded_at": d.uploaded_at,
        }
        for d in docs
    ]


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(*_ROLES)),
):
    doc = db.get(TenantDocument, document_id)
    if not doc or doc.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
