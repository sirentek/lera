"""Lera insight injection.

The background insight task (``agent/insight.py``) writes ``$HERMES_HOME/insight.md`` with a
``## This Week`` digest and a ``## Suggestions`` list. This plugin feeds both to the agent:

* the weekly digest as a system prompt section — day-stable text (it changes at most once per
  insight interval), so it belongs in the cached prompt, frozen per session by core;
* the suggestions through ``pre_llm_call`` as turn-start context, so the agent can raise them
  naturally when relevant — it is not required to act on them.

Lived inside the in-tree holographic memory provider until 0.22.3 moved that provider out of core;
it is provider-independent now. Missing or unparsable digest = nothing injected (zero token cost).
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Mapping, Optional

logger = logging.getLogger(__name__)

# Core skips a section over its max_chars outright; trim instead so a long digest still lands.
_SECTION_MAX_CHARS = 4000
_WEEK_BODY_MAX_CHARS = 3600


def _read_insight_sections() -> Dict[str, str]:
    """Return {'week': ..., 'suggestions': ...} from $HERMES_HOME/insight.md.

    Read-only and best-effort. Splits on the two known headings the insight task emits.
    """
    out = {"week": "", "suggestions": ""}
    try:
        from hermes_constants import get_hermes_home
        path = get_hermes_home() / "insight.md"
        if not path.exists():
            return out
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            return out
        # Strip the generation-stamp comment line if present.
        text = re.sub(r"^<!--.*?-->\s*", "", text, flags=re.DOTALL)
        week_m = re.search(r"##\s*This Week\s*\n(.*?)(?=\n##\s|\Z)", text, re.IGNORECASE | re.DOTALL)
        sugg_m = re.search(r"##\s*Suggestions?\s*\n(.*?)(?=\n##\s|\Z)", text, re.IGNORECASE | re.DOTALL)
        if week_m:
            out["week"] = week_m.group(1).strip()
        if sugg_m:
            out["suggestions"] = sugg_m.group(1).strip()
    except Exception as e:
        logger.debug("Failed to read insight digest: %s", e)
    return out


def _suggestions_meaningful(suggestions: str) -> bool:
    """False when the suggestions section is empty or an explicit 'none'."""
    s = suggestions.strip().lower()
    return bool(s) and s not in ("none right now.", "none right now", "none.", "none")


def _weekly_digest_section(_session_info: Mapping[str, Any]) -> str:
    week = _read_insight_sections().get("week", "")
    if not week:
        return ""  # core skips an empty section silently
    if len(week) > _WEEK_BODY_MAX_CHARS:
        week = week[:_WEEK_BODY_MAX_CHARS].rstrip() + "\n…"
    return (
        "## Recent Context (last ~week)\n"
        "Background summary of what the user has been working on. "
        "Use it to stay oriented; do not recite it verbatim.\n"
        f"{week}"
    )


def _on_pre_llm_call(**_kwargs: Any) -> Optional[dict]:
    suggestions = _read_insight_sections().get("suggestions", "")
    if not _suggestions_meaningful(suggestions):
        return None
    return {
        "context": (
            "## Proactive Suggestions\n"
            "Optional next steps surfaced from recent activity. Offer the "
            "relevant one when it fits the conversation; never force them.\n"
            f"{suggestions}"
        )
    }


def register(ctx) -> None:
    ctx.register_system_prompt_section(
        "lera-insight.weekly-digest", _weekly_digest_section,
        position="after_memory", max_chars=_SECTION_MAX_CHARS,
    )
    ctx.register_hook("pre_llm_call", _on_pre_llm_call)
