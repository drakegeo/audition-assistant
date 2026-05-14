"""Tests for pdf_extractor and parser validation logic. No LLM or DB calls."""

import io

import pypdf
import pytest

from src.ingestion.parser import _validate
from src.ingestion.pdf_extractor import MIN_WORD_COUNT, extract_text

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_blank_pdf() -> bytes:
    """Create a valid but text-free PDF (simulates a scanned document)."""
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


VALID_PARSED = {
    "title": "Test Script",
    "characters": [{"name": "ADAM"}, {"name": "EVELYN"}],
    "lines": [
        {"sequence": 1, "kind": "scene_header", "character": None, "text": "SCENE 1"},
        {"sequence": 2, "kind": "dialogue", "character": "ADAM", "text": "Hello."},
        {"sequence": 3, "kind": "dialogue", "character": "EVELYN", "text": "Hi there."},
    ],
}

# ---------------------------------------------------------------------------
# pdf_extractor
# ---------------------------------------------------------------------------

def test_extract_raises_for_non_pdf() -> None:
    with pytest.raises(ValueError, match="Could not read PDF"):
        extract_text(b"this is not a pdf")


def test_extract_raises_for_scanned_pdf() -> None:
    blank = _make_blank_pdf()
    with pytest.raises(ValueError, match="scanned PDF"):
        extract_text(blank)


# ---------------------------------------------------------------------------
# parser._validate
# ---------------------------------------------------------------------------

def test_validate_passes_for_valid_data() -> None:
    _validate(VALID_PARSED)  # must not raise


def test_validate_fails_for_no_dialogue() -> None:
    data = {
        **VALID_PARSED,
        "lines": [{"sequence": 1, "kind": "stage_direction", "character": None, "text": "..."}],
    }
    with pytest.raises(ValueError, match="No dialogue"):
        _validate(data)


def test_validate_fails_for_unknown_character() -> None:
    data = {
        **VALID_PARSED,
        "lines": [{"sequence": 1, "kind": "dialogue", "character": "GHOST", "text": "Boo."}],
    }
    with pytest.raises(ValueError, match="Unknown character"):
        _validate(data)


def test_validate_fails_for_dialogue_without_character() -> None:
    data = {
        **VALID_PARSED,
        "lines": [{"sequence": 1, "kind": "dialogue", "character": None, "text": "Who said this?"}],
    }
    with pytest.raises(ValueError, match="no character"):
        _validate(data)


def test_validate_fails_for_gap_in_sequences() -> None:
    data = {
        **VALID_PARSED,
        "lines": [
            {"sequence": 1, "kind": "dialogue", "character": "ADAM", "text": "Hi."},
            {"sequence": 3, "kind": "dialogue", "character": "EVELYN", "text": "Hey."},
        ],
    }
    with pytest.raises(ValueError, match="consecutive"):
        _validate(data)
