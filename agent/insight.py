"""Insight — background weekly-digest + proactive-suggestion task.

A sibling of the curator (``agent/curator.py``) but with a different job:
instead of maintaining agent-created skills, the insight task periodically
distills the last few days of conversation history into a compact digest
and a short list of proactive suggestions, then writes them to
``$HERMES_HOME/insight.md`` for the holographic memory provider to inject
at turn start.

Design mirrors the curator on purpose so the two stay easy to reason about:

  - Inactivity-triggered (no cron daemon). ``maybe_run_insight()`` is called
    from the same startup hooks as ``maybe_run_curator()`` and self-gates on
    ``interval_hours`` + ``min_idle_hours``.
  - Runs a forked ``AIAgent`` on the auxiliary client (``auxiliary.insight``
    slot, falling back to the main chat model). Never touches the main
    session's prompt cache: ``skip_memory=True``, ``skip_context_files=True``,
    ``quiet_mode=True``, ``platform="insight"``.
  - Output is written atomically. Consumption is cheap and decoupled — the
    provider just reads the file.

Strict invariants:
  - NEVER mutates skills, the curator state, or the user's data. Read-only
    over ``state.db`` + the holographic fact store; write-only to
    ``insight.md`` + ``.insight_state.json``.
  - Best-effort: every entry point swallows exceptions and degrades to "no
    insight" rather than ever breaking session startup.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, NamedTuple, Optional

from hermes_constants import get_hermes_home
from utils import atomic_json_write

logger = logging.getLogger(__name__)


DEFAULT_INTERVAL_HOURS = 24
DEFAULT_MIN_IDLE_HOURS = 2
DEFAULT_WINDOW_DAYS = 7
DEFAULT_MAX_TURNS_SCANNED = 400
DEFAULT_MAX_SUGGESTIONS = 3

# How long the digest text may grow before we trust the model to have
# over-produced; a hard ceiling keeps the turn-start injection cheap.
_MAX_OUTPUT_CHARS = 4000


# ---------------------------------------------------------------------------
# Output + state file locations
# ---------------------------------------------------------------------------

def insight_file() -> Path:
    """The digest the holographic provider reads at turn start."""
    return get_hermes_home() / "insight.md"


def _state_file() -> Path:
    return get_hermes_home() / ".insight_state.json"


def _default_state() -> Dict[str, Any]:
    return {
        "last_run_at": None,
        "last_run_duration_seconds": None,
        "last_run_summary": None,
        "paused": False,
        "run_count": 0,
    }


def load_state() -> Dict[str, Any]:
    path = _state_file()
    if not path.exists():
        return _default_state()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            base = _default_state()
            base.update({k: v for k, v in data.items() if k in base})
            return base
    except (OSError, json.JSONDecodeError) as e:
        logger.debug("Failed to read insight state: %s", e)
    return _default_state()


def save_state(data: Dict[str, Any]) -> None:
    try:
        atomic_json_write(_state_file(), data, indent=2, sort_keys=True)
    except Exception as e:
        logger.debug("Failed to save insight state: %s", e, exc_info=True)


def set_paused(paused: bool) -> None:
    state = load_state()
    state["paused"] = bool(paused)
    save_state(state)


def is_paused() -> bool:
    return bool(load_state().get("paused"))


# ---------------------------------------------------------------------------
# Config access (insight.* in config.yaml)
# ---------------------------------------------------------------------------

def _load_config() -> Dict[str, Any]:
    try:
        from hermes_cli.config import load_config
        cfg = load_config()
    except Exception as e:
        logger.debug("Failed to load config for insight: %s", e)
        return {}
    if not isinstance(cfg, dict):
        return {}
    section = cfg.get("insight") or {}
    return section if isinstance(section, dict) else {}


def _cfg_int(key: str, default: int) -> int:
    try:
        return int(_load_config().get(key, default))
    except (TypeError, ValueError):
        return default


def _cfg_float(key: str, default: float) -> float:
    try:
        return float(_load_config().get(key, default))
    except (TypeError, ValueError):
        return default


def is_enabled() -> bool:
    """Default ON unless config says otherwise."""
    return bool(_load_config().get("enabled", True))


def get_interval_hours() -> int:
    return _cfg_int("interval_hours", DEFAULT_INTERVAL_HOURS)


def get_min_idle_hours() -> float:
    return _cfg_float("min_idle_hours", DEFAULT_MIN_IDLE_HOURS)


def get_window_days() -> int:
    return _cfg_int("window_days", DEFAULT_WINDOW_DAYS)


def get_max_turns_scanned() -> int:
    return _cfg_int("max_turns_scanned", DEFAULT_MAX_TURNS_SCANNED)


def get_max_suggestions() -> int:
    return _cfg_int("max_suggestions", DEFAULT_MAX_SUGGESTIONS)


# ---------------------------------------------------------------------------
# Idle / interval gate (mirrors curator.should_run_now)
# ---------------------------------------------------------------------------

def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts)
    except (TypeError, ValueError):
        return None


def should_run_now(now: Optional[datetime] = None) -> bool:
    """Return True if an insight pass is due.

    Gates: enabled, not paused, and last_run_at older than interval_hours.
    First-run behavior differs from the curator: there is no destructive
    action here (we only produce a digest), so the FIRST observation runs
    immediately — a fresh install benefits from an early digest rather than
    waiting a full interval.
    """
    if not is_enabled() or is_paused():
        return False

    if now is None:
        now = datetime.now(timezone.utc)

    last = _parse_iso(load_state().get("last_run_at"))
    if last is None:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (now - last) >= timedelta(hours=get_interval_hours())


# ---------------------------------------------------------------------------
# History harvesting (read-only over state.db)
# ---------------------------------------------------------------------------

def _collect_recent_history(window_days: int, max_turns: int) -> str:
    """Return a compact transcript of the last ``window_days`` of activity.

    Read-only. Opens state.db in read-only mode, walks recently-active
    sessions newest-first, and flattens user/assistant text turns until the
    turn budget is exhausted. Tool calls and reasoning are dropped — the
    digest only needs the conversational substance.
    """
    try:
        from hermes_state import SessionDB
    except Exception as e:
        logger.debug("insight: SessionDB import failed: %s", e)
        return ""

    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    db = None
    lines: List[str] = []
    turns_used = 0
    try:
        db = SessionDB(read_only=True)
        sessions = db.list_sessions_rich(
            exclude_sources=["insight", "curator"],
            limit=60,
            order_by_last_active=True,
        )
        for sess in sessions:
            if turns_used >= max_turns:
                break
            if not _session_within_window(sess, cutoff):
                continue
            sid = sess.get("id")
            if not sid:
                continue
            title = (sess.get("title") or sess.get("preview") or "").strip()
            try:
                convo = db.get_messages_as_conversation(sid)
            except Exception:
                continue
            header_added = False
            for msg in convo:
                if turns_used >= max_turns:
                    break
                role = msg.get("role")
                if role not in ("user", "assistant"):
                    continue
                content = msg.get("content")
                if not isinstance(content, str):
                    continue
                text = content.strip()
                if not text:
                    continue
                if not header_added:
                    when = sess.get("last_active") or sess.get("started_at") or ""
                    lines.append(f"\n### Session {when} — {title}".rstrip())
                    header_added = True
                # Clip each turn so one runaway message can't dominate.
                clipped = text[:600]
                lines.append(f"{role}: {clipped}")
                turns_used += 1
    except Exception as e:
        logger.debug("insight: history harvest failed: %s", e, exc_info=True)
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass

    return "\n".join(lines).strip()


def _session_within_window(sess: Dict[str, Any], cutoff: datetime) -> bool:
    """True if the session's last activity is at or after ``cutoff``."""
    raw = sess.get("last_active") or sess.get("started_at")
    ts = _parse_iso(str(raw)) if raw else None
    if ts is None:
        # Unknown timestamp: keep it (better to over-include than silently drop).
        return True
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts >= cutoff


def _collect_top_facts(limit: int = 15) -> str:
    """Return the highest-trust durable facts, if the holographic store exists.

    Read-only. Failures degrade to an empty string — the digest still runs
    on raw history alone.
    """
    try:
        from hermes_constants import get_hermes_home as _ghh
        db_path = _ghh() / "memory_store.db"
        if not db_path.exists():
            return ""
        import sqlite3
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            rows = conn.execute(
                "SELECT content, trust_score FROM facts "
                "ORDER BY trust_score DESC, updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        finally:
            conn.close()
        if not rows:
            return ""
        return "\n".join(f"- [{r[1]:.1f}] {r[0]}" for r in rows)
    except Exception as e:
        logger.debug("insight: fact harvest failed: %s", e)
        return ""


def _collect_workspace_context() -> str:
    """Best-effort one-liner about the current working environment.

    Keeps the digest grounded in where the user actually works (#2 in the
    plan) without opening a separate code path.
    """
    parts: List[str] = []
    try:
        from agent.runtime_cwd import resolve_context_cwd
        cwd = resolve_context_cwd()
        if cwd:
            parts.append(f"cwd: {cwd}")
    except Exception:
        pass
    return "  ".join(parts)


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

def _build_prompt(history: str, facts: str, workspace: str, max_suggestions: int,
                  window_days: int) -> str:
    fact_block = f"\n\nDurable facts about the user (highest trust first):\n{facts}" if facts else ""
    ws_block = f"\n\nWorkspace: {workspace}" if workspace else ""
    return (
        f"You are Hermes's background insight task. Below is the user's activity "
        f"over roughly the last {window_days} days plus durable facts you already "
        f"know about them. Produce a SINGLE markdown document with exactly two "
        f"sections and nothing else (no preamble, no closing remarks):\n\n"
        f"## This Week\n"
        f"5-8 bullet points distilling what the user has been working on, recurring "
        f"themes, open threads, and unfinished work. Be concrete and specific. SKIP "
        f"anything already completed, trivial, or stale.\n\n"
        f"## Suggestions\n"
        f"At most {max_suggestions} proactive, genuinely useful next steps phrased as "
        f"short offers (e.g. 'Want me to finish X?', 'Y looks half-done — shall I…?'). "
        f"Only suggest things that reduce the user's future effort. If nothing is worth "
        f"suggesting, write 'None right now.' and stop.\n\n"
        f"Keep the whole document under 300 words. Write declaratively; do not address "
        f"yourself.{ws_block}{fact_block}\n\n"
        f"--- ACTIVITY ---\n{history}"
    )


# ---------------------------------------------------------------------------
# Aux-model runtime resolution (mirrors curator._resolve_review_runtime)
# ---------------------------------------------------------------------------

class _Runtime(NamedTuple):
    provider: str
    model: str
    api_key: Optional[str]
    base_url: Optional[str]


def _strip(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _resolve_runtime(cfg: Dict[str, Any]) -> _Runtime:
    """Pick (provider, model) for the insight fork.

    Precedence: ``auxiliary.insight.{provider,model}`` when both set non-auto,
    else the main chat model — same convention as every other aux task.
    """
    _main = cfg.get("model", {}) if isinstance(cfg.get("model"), dict) else {}
    main_provider = _main.get("provider") or "auto"
    main_model = _main.get("default") or _main.get("model") or ""

    _aux = cfg.get("auxiliary", {}) if isinstance(cfg.get("auxiliary"), dict) else {}
    _task = _aux.get("insight", {}) if isinstance(_aux.get("insight"), dict) else {}
    provider = (_task.get("provider") or "").strip() or None
    model = (_task.get("model") or "").strip() or None
    if provider and provider != "auto" and model:
        return _Runtime(
            provider, model,
            _strip(_task.get("api_key")), _strip(_task.get("base_url")),
        )
    return _Runtime(main_provider, main_model, None, None)


# ---------------------------------------------------------------------------
# Core pass
# ---------------------------------------------------------------------------

def run_insight_pass(
    on_summary: Optional[Callable[[str], None]] = None,
    synchronous: bool = False,
) -> Dict[str, Any]:
    """Execute one insight pass.

    Harvests recent history + facts, forks an aux AIAgent to produce the
    digest, writes ``insight.md``, and records state. Spawns a daemon thread
    unless ``synchronous=True``.
    """
    if not synchronous:
        result: Dict[str, Any] = {"summary": "insight pass started (background)"}
        t = threading.Thread(
            target=lambda: _run_insight_pass_sync(on_summary),
            name="insight-pass",
            daemon=True,
        )
        t.start()
        return result
    return _run_insight_pass_sync(on_summary)


def _run_insight_pass_sync(on_summary: Optional[Callable[[str], None]]) -> Dict[str, Any]:
    start = datetime.now(timezone.utc)
    meta: Dict[str, Any] = {"summary": "no insight", "provider": "", "model": ""}

    history = _collect_recent_history(get_window_days(), get_max_turns_scanned())
    if not history:
        meta["summary"] = "no recent activity to summarize"
        _record_run(start, meta["summary"])
        return meta

    facts = _collect_top_facts()
    workspace = _collect_workspace_context()
    prompt = _build_prompt(
        history, facts, workspace, get_max_suggestions(), get_window_days()
    )

    try:
        from run_agent import AIAgent
    except Exception as e:
        meta["summary"] = f"AIAgent import failed: {e}"
        _record_run(start, meta["summary"])
        return meta

    # Resolve provider/model the same way the curator does.
    api_key = base_url = api_mode = resolved_provider = None
    model_name = ""
    try:
        from hermes_cli.config import load_config
        from hermes_cli.runtime_provider import resolve_runtime_provider
        cfg = load_config()
        binding = _resolve_runtime(cfg)
        model_name = binding.model
        rp = resolve_runtime_provider(
            requested=binding.provider,
            target_model=binding.model,
            explicit_api_key=binding.api_key,
            explicit_base_url=binding.base_url,
        )
        api_key = rp.get("api_key")
        base_url = rp.get("base_url")
        api_mode = rp.get("api_mode")
        resolved_provider = rp.get("provider") or binding.provider
    except Exception as e:
        logger.debug("insight: provider resolution failed: %s", e, exc_info=True)

    meta["provider"] = resolved_provider or ""
    meta["model"] = model_name

    review_agent = None
    try:
        review_agent = AIAgent(
            model=model_name,
            provider=resolved_provider,
            api_key=api_key,
            base_url=base_url,
            api_mode=api_mode,
            max_iterations=8,
            quiet_mode=True,
            platform="insight",
            skip_context_files=True,
            skip_memory=True,
        )
        # The insight fork must never trigger nudges or its own background tasks.
        try:
            review_agent._memory_nudge_interval = 0
            review_agent._skill_nudge_interval = 0
        except Exception:
            pass

        with open(os.devnull, "w", encoding="utf-8") as _devnull, \
                contextlib.redirect_stdout(_devnull), \
                contextlib.redirect_stderr(_devnull):
            conv = review_agent.run_conversation(user_message=prompt)

        digest = ""
        if isinstance(conv, dict):
            digest = str(conv.get("final_response") or "").strip()
        digest = digest[:_MAX_OUTPUT_CHARS].strip()

        if digest:
            _write_insight(digest)
            meta["summary"] = "insight digest updated"
        else:
            meta["summary"] = "insight produced no digest"
    except Exception as e:
        meta["summary"] = f"insight pass error: {e}"
        logger.debug("insight: pass failed: %s", e, exc_info=True)
    finally:
        if review_agent is not None:
            try:
                review_agent.close()
            except Exception:
                pass

    _record_run(start, meta["summary"])
    if on_summary:
        try:
            on_summary(meta["summary"])
        except Exception:
            pass
    return meta


def _write_insight(digest: str) -> None:
    """Atomically write the digest with a generation timestamp header."""
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    body = f"<!-- generated: {stamp} -->\n{digest}\n"
    path = insight_file()
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp.write_text(body, encoding="utf-8")
        os.replace(tmp, path)
    except Exception as e:
        logger.debug("insight: write failed: %s", e, exc_info=True)
        with contextlib.suppress(Exception):
            tmp.unlink()


def _record_run(start: datetime, summary: str) -> None:
    state = load_state()
    state["last_run_at"] = start.isoformat()
    state["last_run_duration_seconds"] = (
        datetime.now(timezone.utc) - start
    ).total_seconds()
    state["last_run_summary"] = summary
    state["run_count"] = int(state.get("run_count", 0)) + 1
    save_state(state)


# ---------------------------------------------------------------------------
# Public entry point for the startup hook (mirrors maybe_run_curator)
# ---------------------------------------------------------------------------

def maybe_run_insight(
    *,
    idle_for_seconds: Optional[float] = None,
    on_summary: Optional[Callable[[str], None]] = None,
) -> Optional[Dict[str, Any]]:
    """Best-effort: run an insight pass if all gates pass. Never raises."""
    try:
        if not should_run_now():
            return None
        if idle_for_seconds is not None:
            if idle_for_seconds < get_min_idle_hours() * 3600.0:
                return None
        return run_insight_pass(on_summary=on_summary)
    except Exception as e:
        logger.debug("maybe_run_insight failed: %s", e, exc_info=True)
        return None
