import io

import pypdf

MIN_WORD_COUNT = 50


def extract_text(pdf_bytes: bytes) -> str:
    """Extract plain text from a PDF using pypdf.

    Raises ValueError if the file is not a valid PDF or if the extracted text
    looks like a scanned PDF (fewer than MIN_WORD_COUNT words).
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
