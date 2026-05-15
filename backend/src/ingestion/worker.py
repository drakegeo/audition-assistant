import asyncio
import logging

from ..llm.factory import get_llm_client
from ..storage import db, pdf_storage
from .parser import parse_script
from .pdf_extractor import extract_text_with_ocr

logger = logging.getLogger(__name__)

_LLM_RETRY_ATTEMPTS = 2
_LLM_RETRY_DELAY_S = 5.0


async def run_parse_worker(script_id: str, user_id: str) -> None:
    """Background task: Storage → extract → LLM parse → DB write.

    Status flow: queued → parsing → ready | failed.
    Catches all exceptions so a crash never goes unrecorded.
    """
    logger.info("parse_worker_started", extra={"script_id": script_id})
    try:
        await db.update_script_status(script_id, "parsing")

        script_row = await _get_script_row(script_id, user_id)
        if script_row is None:
            logger.warning("parse_worker_script_missing", extra={"script_id": script_id})
            return

        pdf_bytes = await pdf_storage.download_pdf(script_row["storage_path"])
        llm = get_llm_client()
        text = await extract_text_with_ocr(pdf_bytes, llm)
        word_count = len(text.split())
        logger.info("pdf_extracted", extra={"script_id": script_id, "words": word_count})

        parsed = await _parse_with_retry(text, llm)

        await db.write_parsed_script(script_id, parsed)
        logger.info("parse_worker_done", extra={"script_id": script_id})

    except Exception as exc:
        error_msg = str(exc)
        logger.error("parse_worker_failed",
                     extra={"script_id": script_id, "error": error_msg}, exc_info=True)
        try:
            await db.update_script_status(script_id, "failed", parse_error=error_msg)
        except Exception:
            logger.error("parse_worker_status_update_failed",
                         extra={"script_id": script_id})


async def _get_script_row(script_id: str, user_id: str) -> dict | None:  # type: ignore[type-arg]
    from ..supabase_client import get_client

    client = get_client()
    resp = await asyncio.to_thread(
        lambda: client.table("scripts")
        .select("id, storage_path")
        .eq("id", script_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


async def _parse_with_retry(text: str, llm: object) -> dict:  # type: ignore[type-arg]
    last_exc: Exception | None = None
    for attempt in range(1, _LLM_RETRY_ATTEMPTS + 1):
        try:
            return await parse_script(text, llm)  # type: ignore[arg-type]
        except Exception as exc:
            last_exc = exc
            if attempt < _LLM_RETRY_ATTEMPTS:
                logger.warning("parse_worker_llm_retry",
                               extra={"attempt": attempt, "error": str(exc)})
                await asyncio.sleep(_LLM_RETRY_DELAY_S)
    raise last_exc  # type: ignore[misc]
