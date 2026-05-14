import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from ..supabase_client import get_client

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_script_row(
    user_id: str,
    script_id: str,
    title: str,
    storage_path: str,
) -> None:
    """Insert a scripts row with status='queued'."""
    client = get_client()
    await asyncio.to_thread(
        lambda: client.table("scripts").insert({
            "id": script_id,
            "user_id": user_id,
            "title": title,
            "status": "queued",
            "storage_path": storage_path,
        }).execute()
    )


async def update_script_status(
    script_id: str,
    status: str,
    *,
    title: str | None = None,
    parse_error: str | None = None,
) -> None:
    """Update status, and optionally title and parse_error, on a scripts row."""
    payload: dict[str, Any] = {"status": status}
    if status == "ready":
        payload["parsed_at"] = _now()
    if title is not None:
        payload["title"] = title
    if parse_error is not None:
        payload["parse_error"] = parse_error
    client = get_client()
    await asyncio.to_thread(
        lambda: client.table("scripts").update(payload).eq("id", script_id).execute()
    )


async def get_scripts_for_user(user_id: str) -> list[dict[str, Any]]:
    """Return all scripts rows for this user (no characters/lines)."""
    client = get_client()
    resp = await asyncio.to_thread(
        lambda: client.table("scripts").select("id, storage_path, status")
        .eq("user_id", user_id)
        .execute()
    )
    return resp.data or []


async def get_script_status_for_user(
    script_id: str, user_id: str
) -> dict[str, Any] | None:
    """Return the scripts row if it belongs to user_id, else None."""
    client = get_client()
    resp = await asyncio.to_thread(
        lambda: client.table("scripts")
        .select("id, status, parse_error")
        .eq("id", script_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


async def get_full_script_for_user(user_id: str) -> dict[str, Any] | None:
    """Return the user's most recent ready/non-deleted script with characters and lines."""
    client = get_client()

    # 1. Get the most recent script row
    script_resp = await asyncio.to_thread(
        lambda: client.table("scripts")
        .select("id, title, status, created_at, parsed_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = script_resp.data or []
    if not rows:
        return None
    script = rows[0]

    # Return early if not ready — no lines/characters yet
    if script["status"] != "ready":
        return {**script, "characters": [], "lines": []}

    # 2. Fetch characters and lines in parallel
    char_resp, line_resp = await asyncio.gather(
        asyncio.to_thread(
            lambda: client.table("characters")
            .select("id, name, line_count, display_order")
            .eq("script_id", script["id"])
            .order("display_order")
            .execute()
        ),
        asyncio.to_thread(
            lambda: client.table("lines")
            .select("id, sequence, kind, character_id, text")
            .eq("script_id", script["id"])
            .order("sequence")
            .execute()
        ),
    )

    return {
        **script,
        "characters": char_resp.data or [],
        "lines": line_resp.data or [],
    }


async def delete_script_row(script_id: str, user_id: str) -> bool:
    """Delete the scripts row (cascades to characters + lines).
    Returns True if a row was deleted, False if it didn't exist / belong to user."""
    client = get_client()
    resp = await asyncio.to_thread(
        lambda: client.table("scripts")
        .delete()
        .eq("id", script_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(resp.data)


async def write_parsed_script(
    script_id: str,
    parsed: dict[str, Any],
) -> None:
    """Write characters + lines to DB, then mark the script ready.

    Inserts all characters first to get their UUIDs, then inserts all lines
    with the correct character_id foreign keys.
    """
    client = get_client()

    characters = parsed["characters"]
    lines = parsed["lines"]

    # Pre-compute line counts per character (dialogue lines only)
    line_counts: dict[str, int] = {}
    for line in lines:
        if line["kind"] == "dialogue" and line.get("character"):
            name = line["character"]
            line_counts[name] = line_counts.get(name, 0) + 1

    # Sort characters: most lines first, ties alphabetical
    sorted_chars = sorted(
        characters,
        key=lambda c: (-line_counts.get(c["name"], 0), c["name"]),
    )

    char_rows = [
        {
            "script_id": script_id,
            "name": c["name"],
            "line_count": line_counts.get(c["name"], 0),
            "display_order": i,
        }
        for i, c in enumerate(sorted_chars)
    ]

    char_resp = await asyncio.to_thread(
        lambda: client.table("characters").insert(char_rows).execute()
    )
    char_id_map: dict[str, str] = {row["name"]: row["id"] for row in char_resp.data}

    line_rows = [
        {
            "script_id": script_id,
            "sequence": line["sequence"],
            "kind": line["kind"],
            "character_id": char_id_map.get(line["character"]) if line.get("character") else None,
            "text": line["text"],
        }
        for line in lines
    ]

    await asyncio.to_thread(
        lambda: client.table("lines").insert(line_rows).execute()
    )

    await update_script_status(
        script_id,
        "ready",
        title=parsed.get("title"),
    )
    logger.info("script_written", extra={"script_id": script_id, "line_count": len(line_rows)})
