import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile

from ..auth.supabase_auth import get_current_user_id
from ..ingestion.worker import run_parse_worker
from ..models.schemas import (
    ScriptListItem,
    ScriptStatusResponse,
    ScriptUpdateRequest,
    ScriptUploadResponse,
)
from ..storage import db, pdf_storage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scripts")

_MAX_BYTES = 10 * 1024 * 1024
_PDF_MAGIC = b"%PDF-"


_ADMIN_IDS: set[str] = {
    uid.strip()
    for uid in os.getenv("ADMIN_USER_IDS", "").split(",")
    if uid.strip()
}


async def _check_quota(user_id: str) -> None:
    """Enforce free plan: max 3 total script uploads per user (lifetime).

    Users listed in ADMIN_USER_IDS env var bypass the quota entirely.
    """
    if user_id in _ADMIN_IDS:
        return
    count = await db.count_total_uploads(user_id)
    if count >= db.MAX_FREE_UPLOADS:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "quota_exceeded",
                "detail": f"Free plan allows {db.MAX_FREE_UPLOADS} scripts total.",
            },
        )


def _require_valid_uuid(value: str) -> str:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": "Script not found"},
        )
    return value


# ── List all scripts ──────────────────────────────────────────────────────────

@router.get("", response_model=list[ScriptListItem])
async def list_scripts(
    user_id: str = Depends(get_current_user_id),
) -> list[dict]:
    """Return all active scripts for this user, newest first."""
    return await db.list_scripts_for_user(user_id)


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def upload_script(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
) -> ScriptUploadResponse:
    """Accept a PDF upload, persist to Storage, and enqueue parsing."""
    await _check_quota(user_id)

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

    storage_path = await pdf_storage.upload_pdf(user_id, script_id, pdf_bytes)
    await db.create_script_row(user_id, script_id, title, storage_path)
    background_tasks.add_task(run_parse_worker, script_id, user_id)

    logger.info("script_upload_queued", extra={"script_id": script_id, "user_id": user_id})
    return ScriptUploadResponse(script_id=script_id, status="queued")


# ── Get by ID ─────────────────────────────────────────────────────────────────

@router.get("/current")
async def get_current_script(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Return the user's most recent active script (backward-compat)."""
    scripts = await db.list_scripts_for_user(user_id)
    if not scripts:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": "No script found"},
        )
    # Return the most recent ready script, or just the most recent
    ready = [s for s in scripts if s["status"] == "ready"]
    target_id = ready[0]["id"] if ready else scripts[0]["id"]
    script = await db.get_script_by_id_for_user(target_id, user_id)
    if script is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": "No script found"},
        )
    return script


@router.get("/{script_id}/status")
async def get_script_status(
    script_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ScriptStatusResponse:
    """Lightweight status poll during parsing."""
    _require_valid_uuid(script_id)
    row = await db.get_script_status_for_user(script_id, user_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": "Script not found"},
        )
    hints = {
        "queued": "Waiting to start…",
        "parsing": "AI is reading your script — this takes 1–2 min for a full play…",
    }
    return ScriptStatusResponse(
        script_id=row["id"],
        status=row["status"],
        parse_error=row.get("parse_error"),
        progress_hint=hints.get(row["status"]),
    )


@router.get("/{script_id}")
async def get_script(
    script_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Return full script with characters and lines."""
    _require_valid_uuid(script_id)
    script = await db.get_script_by_id_for_user(script_id, user_id)
    if script is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": "Script not found"},
        )
    return script


# ── Rename ────────────────────────────────────────────────────────────────────

@router.patch("/{script_id}")
async def rename_script(
    script_id: str,
    body: ScriptUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Update the title of a script."""
    _require_valid_uuid(script_id)
    updated = await db.update_script_title(script_id, user_id, body.title)
    if not updated:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": "Script not found"},
        )
    return {"ok": True}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{script_id}", status_code=204)
async def delete_script(
    script_id: str,
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Soft-delete a script."""
    _require_valid_uuid(script_id)
    row = await db.get_script_status_for_user(script_id, user_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": "Script not found"},
        )
    try:
        storage_rows = await db.get_scripts_for_user(user_id)
        path = next((r["storage_path"] for r in storage_rows if r["id"] == script_id), None)
        if path:
            await pdf_storage.delete_pdf(path)
    except Exception:
        logger.warning("delete_pdf_failed", extra={"script_id": script_id})
    await db.delete_script_row(script_id, user_id)
