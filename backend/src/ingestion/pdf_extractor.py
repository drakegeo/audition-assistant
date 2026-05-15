import io

import fitz  # pymupdf
import pypdf

MIN_WORD_COUNT = 50
_OCR_DPI = 96          # low enough to keep image tokens reasonable (~9k/page)
_OCR_BATCH_SIZE = 20   # pages per Claude Vision call (fits comfortably in 200k ctx)


def extract_text(pdf_bytes: bytes) -> str:
    """Extract plain text from a text-based PDF using pypdf.

    Raises ValueError if the file is unreadable or has too few words
    (indicating a scanned/image-only PDF).
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc

    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n\n".join(pages)

    if len(text.split()) < MIN_WORD_COUNT:
        raise ValueError(
            "Looks like a scanned PDF — no extractable text found. "
            "Please use a text-based PDF."
        )

    return text


def _pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    """Rasterise every page of a PDF to PNG bytes at _OCR_DPI."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    scale = _OCR_DPI / 72
    mat = fitz.Matrix(scale, scale)
    images: list[bytes] = []
    for page in doc:
        pix = page.get_pixmap(matrix=mat)
        images.append(pix.tobytes("png"))
    doc.close()
    return images


async def extract_text_with_ocr(pdf_bytes: bytes, llm: object) -> str:
    """Extract text from a PDF, using VLM OCR as a fallback for scanned documents.

    1. Tries pypdf (fast, free, works for digital PDFs).
    2. If pypdf yields too few words, rasterises pages with pymupdf and
       sends batches to the LLM's ocr_pages() method (Claude Vision).
    3. Raises ValueError if the LLM client doesn't support vision or if
       OCR still yields too few words.
    """
    try:
        return extract_text(pdf_bytes)
    except ValueError as exc:
        if "scanned" not in str(exc).lower():
            raise  # unreadable PDF — propagate as-is

    if not hasattr(llm, "ocr_pages"):
        raise ValueError(
            "Looks like a scanned PDF — no extractable text found. "
            "Please use a text-based PDF."
        )

    images = _pdf_to_images(pdf_bytes)
    if not images:
        raise ValueError("Could not extract pages from PDF.")

    parts: list[str] = []
    for i in range(0, len(images), _OCR_BATCH_SIZE):
        batch = images[i : i + _OCR_BATCH_SIZE]
        text = await llm.ocr_pages(batch)  # type: ignore[union-attr]
        parts.append(text)

    full_text = "\n\n".join(parts)
    if len(full_text.split()) < MIN_WORD_COUNT:
        raise ValueError("Could not extract enough text from this scanned PDF.")

    return full_text
