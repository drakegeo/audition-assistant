import asyncio
import io
import logging
import re

import edge_tts
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth.supabase_auth import get_current_user_id
from ..storage.audio_cache import get_cached_url, store_audio
from ..supabase_client import get_client

router = APIRouter(prefix="/tts", tags=["tts"])
logger = logging.getLogger(__name__)


class PrepareRequest(BaseModel):
    script_id: str
    voice_map: dict[str, str]  # {character_id: voice_id}


class PrepareResponse(BaseModel):
    urls: dict[str, str]   # {line_id: signed_url}
    generated: int
    cached: int
    failed: int


def _preprocess(text: str) -> str:
    """
    Convert script conventions into cues Edge TTS understands naturally.
    Only affects the audio — original text in the DB and on screen is untouched.
    All improvements work through text substitution — edge_tts escapes content
    before embedding in SSML so inline <break> tags are not available.
    """
    # --- Titles & honorifics (unambiguous only) ---
    # Only safe ones where the abbreviation has one clear spoken form.
    # Skipped: St. (Saint/Street), Gen. (General/generic), No. (Number/negation)
    _TITLES = [
        (r"\bMs\.",   "Miz"),
        (r"\bMs\b",   "Miz"),        # Ms without period
        (r"\bMr\.",   "Mister"),
        (r"\bMrs\.",  "Missus"),
        (r"\bDr\.",   "Doctor"),
        (r"\bProf\.", "Professor"),
        (r"\bRev\.",  "Reverend"),
        (r"\bLt\.",   "Lieutenant"),
        (r"\bSgt\.",  "Sergeant"),
        (r"\bCpl\.",  "Corporal"),
        (r"\bPvt\.",  "Private"),
        (r"\bCapt\.", "Captain"),
        (r"\bCol\.",  "Colonel"),
        (r"\bAdm\.",  "Admiral"),
        (r"\bJr\.",   "Junior"),
        (r"\bSr\.",   "Senior"),
    ]
    for pattern, replacement in _TITLES:
        text = re.sub(pattern, replacement, text)

    # --- Stage directions & formatting ---
    # Remove parenthetical directions: (pause), (thinking), (beat), (to John), etc.
    text = re.sub(r"\s*\([^)]{1,60}\)\s*", " ", text)
    # Remove continuation markers
    text = re.sub(r"\(CONT[‘’’]?D\)", "", text, flags=re.IGNORECASE)

    # --- Interruption & pauses ---
    # Trailing dash/hyphen = cut-off line  →  trail off with ellipsis
    text = re.sub(r"\s*[-–—]\s*$", "...", text)
    # Mid-sentence em dash = beat/pause
    text = re.sub(r"\s*—\s*", "... ", text)
    # Spaced en-dash used as pause: " - "
    text = re.sub(r"\s+-\s+", "... ", text)

    # --- Punctuation normalisation ---
    # Multiple ! or ? → single (TTS gets confused by !! or ??)
    text = re.sub(r"!{2,}", "!", text)
    text = re.sub(r"\?{2,}", "?", text)
    # Mixed ?! / !? → keep the first one
    text = re.sub(r"([?!])[?!]+", r"\1", text)

    # --- Rhythm & natural speech ---
    # Repeated adjacent words without comma: "no no no" → "no, no, no"
    # Commas force TTS to breathe between repetitions
    text = re.sub(
        r"\b(\w+)((?:\s+\1){1,})\b",
        lambda m: ", ".join([m.group(1)] * (1 + len(m.group(2).split()))),
        text,
        flags=re.IGNORECASE,
    )
    # Slash between words = "or": "yes/no" → "yes or no"
    text = re.sub(r"(?<=\w)/(?=\w)", " or ", text)
    # Ampersand → "and"
    text = re.sub(r"\s*&\s*", " and ", text)

    # Collapse extra whitespace
    return re.sub(r" {2,}", " ", text).strip()


async def _generate(text: str, voice_id: str) -> bytes | None:
    """Generate MP3 bytes from Edge TTS with up to 3 attempts. Returns None on failure."""
    processed = _preprocess(text)
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(processed, voice_id)
            buf = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    buf.write(chunk["data"])
            data = buf.getvalue()
            if data:
                return data
        except Exception as exc:
            logger.warning("edge_tts_generate_failed attempt=%d voice=%s error=%s", attempt + 1, voice_id, exc)
            if attempt < 2:
                await asyncio.sleep(1)
    return None


async def _get_lines(script_id: str, character_ids: list[str], user_id: str) -> list[dict]:  # type: ignore[type-arg]
    """Return dialogue lines for given characters, verifying script ownership."""
    client = get_client()
    owns = await asyncio.to_thread(
        lambda: client.table("scripts")
        .select("id")
        .eq("id", script_id)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not (owns.data or []):
        return []
    resp = await asyncio.to_thread(
        lambda: client.table("lines")
        .select("id, text, character_id, script_id")
        .eq("script_id", script_id)
        .eq("kind", "dialogue")
        .in_("character_id", character_ids)
        .execute()
    )
    return resp.data or []


@router.post("/prepare", response_model=PrepareResponse)
async def prepare_tts(
    body: PrepareRequest,
    user_id: str = Depends(get_current_user_id),
) -> PrepareResponse:
    """
    Generate (or return cached) audio for all dialogue lines of the given characters.
    Returns a map of line_id -> signed URL for each line.
    First call generates and caches; subsequent calls return cached URLs instantly.
    """
    if not body.voice_map:
        return PrepareResponse(urls={}, generated=0, cached=0, failed=0)

    lines = await _get_lines(body.script_id, list(body.voice_map.keys()), user_id)
    if not lines:
        raise HTTPException(status_code=404, detail={"error": "not_found", "detail": "Script not found or not owned by user"})

    urls: dict[str, str] = {}
    generated = 0
    cached = 0
    failed = 0

    # Process lines concurrently but cap parallelism to avoid rate limits
    sem = asyncio.Semaphore(5)

    async def process_line(line: dict) -> None:  # type: ignore[type-arg]
        nonlocal generated, cached, failed
        line_id: str = line["id"]
        voice_id: str = body.voice_map.get(line["character_id"], "")
        if not voice_id:
            return
        async with sem:
            url = await get_cached_url(line_id, voice_id)
            if url:
                urls[line_id] = url
                cached += 1
                return
            audio = await _generate(line["text"], voice_id)
            if audio is None:
                failed += 1
                return
            storage_path = f"tts/{body.script_id}/{line_id}/{voice_id}.mp3"
            url = await store_audio(line_id, voice_id, storage_path, audio)
            if url:
                urls[line_id] = url
                generated += 1
            else:
                failed += 1

    await asyncio.gather(*(process_line(l) for l in lines))

    logger.info(
        "tts_prepare_done script=%s generated=%d cached=%d failed=%d",
        body.script_id, generated, cached, failed,
    )
    return PrepareResponse(urls=urls, generated=generated, cached=cached, failed=failed)
