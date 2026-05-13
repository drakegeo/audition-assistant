MIN_WORD_COUNT = 50


def extract_text(pdf_bytes: bytes) -> str:
    """Extract plain text from a PDF using pypdf.

    Raises ValueError if the extracted text looks like a scanned PDF
    (fewer than MIN_WORD_COUNT words across the whole document).
    """
    # TODO(phase-1): implement using pypdf.
    # import pypdf, io
    # reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    # text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    # if len(text.split()) < MIN_WORD_COUNT:
    #     raise ValueError("Looks like a scanned PDF. Try a text PDF.")
    # return text
    raise NotImplementedError("Phase 1")
