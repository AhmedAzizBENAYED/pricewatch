from datetime import datetime, timezone


def get_conversation_history(db, conversation_id: str, limit: int = 10) -> list[dict]:
    from src.common.models import MessageIA
    msgs = (
        db.query(MessageIA)
        .filter(MessageIA.id_conversation == conversation_id)
        .order_by(MessageIA.date_creation.desc())
        .limit(limit)
        .all()
    )
    return [{"role": m.role, "content": m.contenu} for m in reversed(msgs)]


def save_message(
    db,
    conversation_id: str,
    user_id: int,
    role: str,
    content: str,
    sources: list = None,
):
    from src.common.models import ConversationIA, MessageIA
    import uuid

    msg = MessageIA(
        id              = uuid.uuid4(),
        id_utilisateur  = user_id,
        id_conversation = conversation_id,
        role            = role,
        contenu         = content,
        sources         = sources or [],
    )
    db.add(msg)

    conv = db.get(ConversationIA, conversation_id)
    if conv:
        conv.date_derniere_activite = datetime.now(timezone.utc)
        if not conv.titre and role == "user":
            conv.titre = content[:60]

    db.commit()


def get_user_memories(db, user_id: int, limit: int = 5) -> str:
    from src.common.models import UserMemory
    mems = (
        db.query(UserMemory)
        .filter(UserMemory.id_utilisateur == user_id)
        .order_by(UserMemory.last_accessed.desc())
        .limit(limit)
        .all()
    )
    if not mems:
        return ""
    return "Contexte utilisateur:\n" + "\n".join(f"- {m.content}" for m in mems)


def load_full_context(db, user_id: int, conversation_id: str) -> dict:
    """Load all three memory tiers for injection into the graph's initial state."""
    from src.common.models import ConversationIA, UserMemory

    # Tier 1 — Working memory (last 10 messages)
    try:
        recent_messages = get_conversation_history(db, conversation_id, limit=10)
    except Exception:
        recent_messages = []

    # Tier 2 — Episodic memory (compressed summary of older exchanges)
    episodic_summary: str | None = None
    try:
        conv = db.get(ConversationIA, conversation_id)
        episodic_summary = conv.resume if conv else None
    except Exception:
        pass

    # Tier 3 — Semantic memory (durable user facts); update last_accessed on retrieval
    user_memories: list[str] = []
    try:
        mems = (
            db.query(UserMemory)
            .filter(UserMemory.id_utilisateur == user_id)
            .order_by(UserMemory.last_accessed.desc())
            .limit(5)
            .all()
        )
        if mems:
            now = datetime.now(timezone.utc)
            for m in mems:
                m.last_accessed = now
            db.commit()
            user_memories = [m.content for m in mems]
    except Exception:
        pass

    return {
        "conversation_history": recent_messages,
        "episodic_summary":     episodic_summary,
        "user_memories":        user_memories,
    }
