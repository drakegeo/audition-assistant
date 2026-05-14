import asyncio
import logging

from ..supabase_client import get_client

logger = logging.getLogger(__name__)

BUCKET = "user-scripts"


async def upload_pdf(user_id: str, script_id: str, pdf_bytes: bytes) -> str:
    """Upload PDF to Supabase Storage. Returns the storage path."""
    path = f"{user_id}/{script_id}.pdf"
    client = get_client()
    await asyncio.to_thread(
        lambda: client.storage.from_(BUCKET).upload(
            path=path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf", "upsert": "false"},
        )
    )
    logger.info("pdf_uploaded", extra={"path": path})
    return path


async def download_pdf(storage_path: str) -> bytes:
    """Download PDF bytes from Supabase Storage."""
    client = get_client()
    data: bytes = await asyncio.to_thread(
        lambda: client.storage.from_(BUCKET).download(storage_path)
    )
    return data


async def delete_pdf(storage_path: str) -> None:
    """Delete a PDF from Supabase Storage. Silent if the file doesn't exist."""
    client = get_client()
    await asyncio.to_thread(
        lambda: client.storage.from_(BUCKET).remove([storage_path])
    )
    logger.info("pdf_deleted", extra={"path": storage_path})
