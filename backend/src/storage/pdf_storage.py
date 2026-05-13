import logging

logger = logging.getLogger(__name__)

BUCKET = "user-scripts"


async def upload_pdf(user_id: str, script_id: str, pdf_bytes: bytes) -> str:
    """Upload PDF to Supabase Storage. Returns the storage path."""
    # TODO(phase-1): implement
    # path = f"{user_id}/{script_id}.pdf"
    # supabase.storage.from_(BUCKET).upload(path, pdf_bytes)
    # return path
    raise NotImplementedError("Phase 1")


async def download_pdf(storage_path: str) -> bytes:
    """Download PDF bytes from Supabase Storage."""
    # TODO(phase-1): implement
    raise NotImplementedError("Phase 1")


async def delete_pdf(storage_path: str) -> None:
    """Delete a PDF from Supabase Storage."""
    # TODO(phase-1): implement
    raise NotImplementedError("Phase 1")
