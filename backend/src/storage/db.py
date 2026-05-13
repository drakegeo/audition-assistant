import logging
from typing import Any

logger = logging.getLogger(__name__)


async def create_script_row(
    user_id: str,
    script_id: str,
    title: str,
    storage_path: str,
) -> None:
    """Insert a new scripts row with status='queued'."""
    # TODO(phase-1): implement
    raise NotImplementedError("Phase 1")


async def update_script_status(
    script_id: str,
    status: str,
    *,
    parse_error: str | None = None,
) -> None:
    """Update the status (and optionally parse_error) of a scripts row."""
    # TODO(phase-1): implement
    raise NotImplementedError("Phase 1")


async def get_script_for_user(script_id: str, user_id: str) -> dict[str, Any] | None:
    """Return the scripts row if it belongs to user_id, else None."""
    # TODO(phase-1): implement — always filter by user_id to prevent IDOR.
    raise NotImplementedError("Phase 1")


async def get_current_script_for_user(user_id: str) -> dict[str, Any] | None:
    """Return the user's most recent active script with characters and lines."""
    # TODO(phase-1): implement
    raise NotImplementedError("Phase 1")


async def delete_script_row(script_id: str, user_id: str) -> bool:
    """Delete the scripts row (cascades to characters + lines). Returns True if deleted."""
    # TODO(phase-1): implement — confirm ownership before deleting.
    raise NotImplementedError("Phase 1")


async def write_parsed_script(
    script_id: str,
    characters: list[dict[str, Any]],
    lines: list[dict[str, Any]],
) -> None:
    """Write characters and lines to DB in a single transaction, then mark ready."""
    # TODO(phase-1): implement inside a DB transaction.
    raise NotImplementedError("Phase 1")
