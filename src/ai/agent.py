from langchain_core.messages import SystemMessage
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent

from src.ai.tools import make_tools
from src.ai import OLLAMA_MODEL

OLLAMA_BASE_URL = "http://host.docker.internal:11434"
MAIN_MODEL      = OLLAMA_MODEL


def build_agent(
    db,
    tenant_id: int,
    tenant_nom: str,
    profil_client: str,
    own_site_slug: str | None,
    own_brand: str | None,
    own_site_id: int | None,
):
    tools = make_tools(db, tenant_id, own_site_id, own_brand, profil_client)

    llm = ChatOllama(
        model=MAIN_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0.1,
    )

    if profil_client == "SITE_ECOMMERCE":
        context = (
            f"Tu travailles pour {tenant_nom}, un site e-commerce tunisien. "
            "Tu surveilles les concurrents: Mytek, Spacenet, Tunisianet, Carrefour, Aziza, Géant. "
            "Tu aides à analyser les prix, promotions et ruptures de stock des concurrents."
        )
    else:
        context = (
            f"Tu travailles pour {tenant_nom}, une marque ({own_brand}). "
            "Tu surveilles comment vos produits sont vendus sur les différents sites tunisiens "
            "et comment vous vous positionnez face aux marques concurrentes."
        )

    system_prompt = (
        f"Tu es PW-Insight, assistant de veille concurrentielle pour {tenant_nom}. "
        f"{context} "
        "Réponds TOUJOURS en français. "
        "Sois concis, précis et actionnable. "
        "Tu DOIS utiliser les outils disponibles pour récupérer des données réelles avant de répondre. "
        "Ne réponds jamais sans avoir d'abord appelé au moins un outil. "
        "Cite toujours tes sources de données dans ta réponse."
    )

    return create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=SystemMessage(content=system_prompt),
    )
