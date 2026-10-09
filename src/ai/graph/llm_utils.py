import logging
import os
import re

import httpx
from langsmith import traceable

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
LLM_TIMEOUT = 60.0

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def _strip_think(text: str) -> str:
    return _THINK_RE.sub("", text).strip()


@traceable(run_type="llm", name="Ollama")
def call_ollama(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.0,
    format: str | None = None,
) -> str:
    payload: dict = {
        "model": model,
        "stream": False,
        "options": {"temperature": temperature},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if format:
        payload["format"] = format

    try:
        r = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            timeout=LLM_TIMEOUT,
        )
        r.raise_for_status()
        raw = r.json().get("message", {}).get("content", "")
        return _strip_think(raw)
    except Exception as exc:
        logger.error("Ollama call failed (model=%s): %s", model, exc)
        return ""
