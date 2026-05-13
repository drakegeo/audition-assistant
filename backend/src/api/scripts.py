import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile

from ..auth.supabase_auth import get_current_user_id
from ..models.schemas import ScriptStatusResponse, ScriptUploadResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scripts")

_NOT_IMPLEMENTED = HTTPException(
    status_code=501,
    detail={"error": "not_implemented", "detail": "Phase 1"},
)


def _check_quota(user_id: str) -> None:
    """TODO(phase-3): enforce per-user daily upload quota (5 uploads / 24 h).

    When implemented: query the scripts table for uploads in the last 24 hours
    for this user and raise HTTP 429 if the limit is exceeded. No quota table
    or other infrastructure needed — use the existing scripts.created_at column.
    """


@router.post("", status_code=201)
async def upload_script(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
) -> ScriptUploadResponse:
    """Accept a PDF upload, persist to Storage, and enqueue parsing."""
    _check_quota(user_id)
    # TODO(phase-1): validate PDF magic bytes, check 10 MB cap, save to
    # Supabase Storage, insert scripts row with status='queued', enqueue
    # background parse task via background_tasks.add_task(parse_script, ...).
    raise _NOT_IMPLEMENTED


@router.get("/current")
async def get_current_script(
    user_id: str = Depends(get_current_user_id),
) -> dict:  # type: ignore[type-arg]
    """Return the user's active script with characters and lines."""
    # TODO(phase-1): query scripts, characters, lines tables filtered by user_id.
    raise _NOT_IMPLEMENTED


@router.get("/{script_id}/status")
async def get_script_status(
    script_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ScriptStatusResponse:
    """Lightweight status poll during parsing. Cheap — no joins."""
    # TODO(phase-1): validate script_id is a UUID, query scripts table,
    # confirm ownership (return 404 if not found or not owned).
    raise _NOT_IMPLEMENTED


@router.delete("/{script_id}", status_code=204)
async def delete_script(
    script_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a script from Storage and DB (cascades to characters + lines)."""
    # TODO(phase-1): verify ownership (404 if not found/not owned, never 403),
    # delete from Storage, delete from DB.
    raise _NOT_IMPLEMENTED
