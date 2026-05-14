import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile

from ..auth.supabase_auth import get_current_user_id
from ..ingestion.worker import run_parse_worker
from ..models.schemas import ScriptStatusResponse, ScriptUploadResponse
from ..storage import db, pdf_storage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scripts")

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_PDF_MAGIC = b"%PDF-"


def _check_quota(user_id: str) -> None:
    """TODO(phase-3): enforce per-user daily upload quota (5 uploads / 24 h).

    When implemented: query the scripts table for uploads in the last 24 hours
    for this user and raise HTTP 429 if the limit is exceeded. No quota table
    or other infrastructure needed — use the existing scripts.created_at column.
    """


def _require_valid_uuid(value: str) -> str:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "not_found", "detail": "Script not found"})
    return value


@router.post("", status_code=201)
async def upload_script(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
) -> ScriptUploadResponse:
    """Accept a PDF upload, persist to Storage, and enqueue parsing."""
    _check_quota(user_id)

    pdf_bytes = await file.read()

    if len(pdf_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail={"error": "file_too_large", "detail": "Maximum file size is 10 MB"},
        )

    if not pdf_bytes.startswith(_PDF_MAGIC):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_pdf", "detail": "File does not appear to be a valid PDF"},
        )

    script_id = str(uuid.uuid4())
    title = Path(file.filename or "script").stem

    # Enforce one-script-at-a-time: delete any existing scripts for this user
    existing = await db.get_scripts_for_user(user_id)
    for row in existing:
        try:
            await pdf_storage.delete_pdf(row["storage_path"])
        except Exception:
            logger.warning("delete_old_pdf_failed", extra={"path": row["storage_path"]})
        await db.delete_script_row(row["id"], user_id)

    storage_path = await pdf_storage.upload_pdf(user_id, script_id, pdf_bytes)
    await db.create_script_row(user_id, script_id, title, storage_path)

    background_tasks.add_task(run_parse_worker, script_id, user_id)
    logger.info("script_upload_queued", extra={"script_id": script_id, "user_id": user_id})

    return ScriptUploadResponse(script_id=script_id, status="queued")


@router.get("/current")
async def get_current_script(
    user_id: str = Depends(get_current_user_id),
) -> dict:  # type: ignore[type-arg]
    """Return the user's active script. Includes characters and lines when ready."""
    script = await db.get_full_script_for_user(user_id)
    if script is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "detail": "No script found"})
    return script


@router.get("/{script_id}/status")
async def get_script_status(
    script_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ScriptStatusResponse:
    """Lightweight status poll during parsing. No joins."""
    _require_valid_uuid(script_id)
    row = await db.get_script_status_for_user(script_id, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "detail": "Script not found"})
    return ScriptStatusResponse(
        script_id=row["id"],
        status=row["status"],
        parse_error=row.get("parse_error"),
    )


@router.delete("/{script_id}", status_code=204)
async def delete_script(
    script_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a script from Storage and DB (cascades to characters + lines)."""
    _require_valid_uuid(script_id)
    row = await db.get_script_status_for_user(script_id, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "detail": "Script not found"})
    try:
        storage_resp = await db.get_scripts_for_user(user_id)
        path = next((r["storage_path"] for r in storage_resp if r["id"] == script_id), None)
        if path:
            await pdf_storage.delete_pdf(path)
    except Exception:
        logger.warning("delete_pdf_failed", extra={"script_id": script_id})
    await db.delete_script_row(script_id, user_id)
