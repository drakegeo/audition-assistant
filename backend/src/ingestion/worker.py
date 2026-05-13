import logging

logger = logging.getLogger(__name__)


async def run_parse_worker(script_id: str, user_id: str) -> None:
    """Background task: download PDF, extract text, call LLM, write to DB.

    Status flow: queued → parsing → ready | failed.
    On any failure, writes parse_error to the scripts row before returning.
    """
    # TODO(phase-1): implement
    # 1. Update script status to 'parsing'
    # 2. Download PDF bytes from Supabase Storage
    # 3. extract_text(pdf_bytes) — raises ValueError for scanned PDFs
    # 4. parse_script(text, llm) — raises ValueError on validation failure
    # 5. Write characters + lines to DB in a transaction
    # 6. Update script status to 'ready', set parsed_at
    # On exception: update status to 'failed', set parse_error
    raise NotImplementedError("Phase 1")
