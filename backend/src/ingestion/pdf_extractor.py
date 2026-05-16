import io
import os

import fitz  # pymupdf
import pypdf

MIN_WORD_COUNT = 50
_MIN_CLEAN_RATIO = 0.35  # min fraction of words that must be pure alpha, len>=3
_OCR_DPI = 150           # good quality for VLM OCR; ~200KB JPEG per page at this DPI


def _is_garbage(text: str) -> bool:
    """Return True when pypdf extracted text but it's mostly font-glyph gibberish.

    Some scanned PDFs embed enough font data that pypdf returns hundreds of
    "words" that are actually random characters.  A real script has a high
    proportion of plain alphabetic words (length >= 3); garbage text does not.
    """
    words = text.split()
    if not words:
        return True
    clean = sum(1 for w in words if w.isalpha() and len(w) >= 3)
    return (clean / len(words)) < _MIN_CLEAN_RATIO


def extract_text(pdf_bytes: bytes) -> str:
    """Extract plain text from a text-based PDF using pypdf.

    Raises ValueError if the file is unreadable, has too few words, or the
    extracted text looks like font-glyph garbage (scanned PDF).
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc

    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n\n".join(pages)

    if len(text.split()) < MIN_WORD_COUNT or _is_garbage(text):
        raise ValueError(
            "Looks like a scanned PDF — no extractable text found. "
            "Please use a text-based PDF."
        )

    return text


def _pdf_to_jpegs(pdf_bytes: bytes) -> list[bytes]:
    """Rasterise every page of a PDF to JPEG bytes at _OCR_DPI."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    scale = _OCR_DPI / 72
    mat = fitz.Matrix(scale, scale)
    images: list[bytes] = []
    for page in doc:
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        images.append(pix.tobytes("jpeg", jpg_quality=85))
    doc.close()
    return images


def _get_groq_ocr_client() -> object | None:
    """Return a GroqClient when GROQ_API_KEY is set, otherwise None."""
    if not os.getenv("GROQ_API_KEY"):
        return None
    from ..llm.groq import GroqClient
    return GroqClient()


async def extract_text_with_ocr(pdf_bytes: bytes, llm: object) -> str:
    """Extract text from a PDF, using Groq VLM OCR as a fallback for scanned documents.

    1. Tries pypdf — fast, free, works for digital PDFs.
    2. If pypdf yields too few words or garbage glyphs, rasterises pages with
       pymupdf and sends each page to Groq's Llama 4 Scout vision model.
    3. Raises ValueError if GROQ_API_KEY is not set or OCR yields too few words.

    The `llm` parameter is the main parsing client and is not used for OCR —
    OCR always uses Groq so it works regardless of which LLM handles parsing.
    """
    try:
        return extract_text(pdf_bytes)
    except ValueError as exc:
        if "scanned" not in str(exc).lower():
            raise  # unreadable PDF — propagate as-is

    ocr_client = _get_groq_ocr_client()
    if ocr_client is None:
        raise ValueError(
            "Looks like a scanned PDF — no extractable text found. "
            "Set GROQ_API_KEY to enable VLM OCR for scanned documents."
        )

    images = _pdf_to_jpegs(pdf_bytes)
    if not images:
        raise ValueError("Could not extract pages from PDF.")

    parts: list[str] = []
    for img in images:
        text = await ocr_client.ocr_page(img)  # type: ignore[union-attr]
        parts.append(text)

    full_text = "\n\n".join(parts)
    if len(full_text.split()) < MIN_WORD_COUNT:
        raise ValueError("Could not extract enough text from this scanned PDF.")

    return full_text
