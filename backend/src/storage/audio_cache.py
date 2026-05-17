import asyncio
import logging

from ..supabase_client import get_client

BUCKET = "user-scripts"
SIGNED_URL_EXPIRY = 86400  # 24 hours

logger = logging.getLogger(__name__)


async def get_cached_url(line_id: str, voice_id: str) -> str | None:
    """Return a fresh signed URL for a cached audio file, or None if not cached."""
    client = get_client()
    resp = await asyncio.to_thread(
        lambda: client.table("audio_cache")
        .select("storage_path")
        .eq("line_id", line_id)
        .eq("voice_id", voice_id)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    path = rows[0]["storage_path"]
    try:
        signed = await asyncio.to_thread(
            lambda: client.storage.from_(BUCKET).create_signed_url(path, SIGNED_URL_EXPIRY)
        )
        return signed.get("signedURL") or signed.get("signedUrl")
    except Exception as exc:
        logger.warning("signed_url_failed path=%s error=%s", path, exc)
        return None


async def store_audio(line_id: str, voice_id: str, storage_path: str, audio: bytes) -> str | None:
    """Upload audio to Supabase Storage, write cache row, return signed URL."""
    client = get_client()
    try:
        await asyncio.to_thread(
            lambda: client.storage.from_(BUCKET).upload(
                path=storage_path,
                file=audio,
                file_options={"content-type": "audio/mpeg", "upsert": "true"},
            )
        )
    except Exception as exc:
        logger.error("audio_upload_failed path=%s error=%s", storage_path, exc)
        return None

    try:
        await asyncio.to_thread(
            lambda: client.table("audio_cache").upsert(
                {"line_id": line_id, "voice_id": voice_id, "storage_path": storage_path},
                on_conflict="line_id,voice_id",
            ).execute()
        )
    except Exception as exc:
        logger.error("audio_cache_insert_failed line_id=%s error=%s", line_id, exc)
        return None

    try:
        signed = await asyncio.to_thread(
            lambda: client.storage.from_(BUCKET).create_signed_url(storage_path, SIGNED_URL_EXPIRY)
        )
        return signed.get("signedURL") or signed.get("signedUrl")
    except Exception as exc:
        logger.warning("signed_url_after_store_failed path=%s error=%s", storage_path, exc)
        return None
