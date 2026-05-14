"""End-to-end tests for POST /scripts and GET /scripts/* with mocked storage and LLM."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import MOCK_SCRIPT_ID, MOCK_USER_ID

# Minimal valid PDF bytes (magic bytes present, enough content for the check)
_FAKE_PDF = b"%PDF-1.4 fake content for testing purposes only " + b"word " * 60


# ---------------------------------------------------------------------------
# POST /scripts
# ---------------------------------------------------------------------------

def test_upload_requires_auth(client) -> None:
    resp = client.post("/scripts", files={"file": ("script.pdf", _FAKE_PDF, "application/pdf")})
    # auth_headers not passed → conftest mock still applies but Bearer missing
    assert resp.status_code == 401


def test_upload_rejects_non_pdf(client, auth_headers) -> None:
    resp = client.post(
        "/scripts",
        files={"file": ("doc.pdf", b"this is not a pdf", "application/pdf")},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "invalid_pdf"


def test_upload_rejects_oversized_file(client, auth_headers) -> None:
    big = b"%PDF-" + b"x" * (10 * 1024 * 1024 + 1)
    resp = client.post(
        "/scripts",
        files={"file": ("big.pdf", big, "application/pdf")},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "file_too_large"


def test_upload_happy_path(client, auth_headers) -> None:
    with (
        patch("src.api.scripts.db.get_scripts_for_user", new_callable=AsyncMock, return_value=[]),
        patch("src.api.scripts.pdf_storage.upload_pdf", new_callable=AsyncMock, return_value="u/s.pdf"),
        patch("src.api.scripts.db.create_script_row", new_callable=AsyncMock),
        patch("src.api.scripts.run_parse_worker", new_callable=AsyncMock),
    ):
        resp = client.post(
            "/scripts",
            files={"file": ("hamlet.pdf", _FAKE_PDF, "application/pdf")},
            headers=auth_headers,
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "queued"
    assert "script_id" in body


# ---------------------------------------------------------------------------
# GET /scripts/current
# ---------------------------------------------------------------------------

def test_get_current_returns_404_when_none(client, auth_headers) -> None:
    with patch("src.api.scripts.db.get_full_script_for_user", new_callable=AsyncMock, return_value=None):
        resp = client.get("/scripts/current", headers=auth_headers)
    assert resp.status_code == 404


def test_get_current_returns_script_when_ready(client, auth_headers) -> None:
    fake_script = {
        "id": MOCK_SCRIPT_ID,
        "title": "Hamlet",
        "status": "ready",
        "created_at": "2026-05-14T10:00:00Z",
        "parsed_at": "2026-05-14T10:00:42Z",
        "characters": [{"id": "c1", "name": "HAMLET", "line_count": 5, "display_order": 0}],
        "lines": [{"id": "l1", "sequence": 1, "kind": "dialogue", "character_id": "c1", "text": "To be."}],
    }
    with patch("src.api.scripts.db.get_full_script_for_user", new_callable=AsyncMock, return_value=fake_script):
        resp = client.get("/scripts/current", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Hamlet"


# ---------------------------------------------------------------------------
# GET /scripts/{id}/status
# ---------------------------------------------------------------------------

def test_status_returns_404_for_unknown_id(client, auth_headers) -> None:
    with patch("src.api.scripts.db.get_script_status_for_user", new_callable=AsyncMock, return_value=None):
        resp = client.get(f"/scripts/{MOCK_SCRIPT_ID}/status", headers=auth_headers)
    assert resp.status_code == 404


def test_status_returns_404_for_invalid_uuid(client, auth_headers) -> None:
    resp = client.get("/scripts/not-a-uuid/status", headers=auth_headers)
    assert resp.status_code == 404


def test_status_returns_queued(client, auth_headers) -> None:
    row = {"id": MOCK_SCRIPT_ID, "status": "queued", "parse_error": None}
    with patch("src.api.scripts.db.get_script_status_for_user", new_callable=AsyncMock, return_value=row):
        resp = client.get(f"/scripts/{MOCK_SCRIPT_ID}/status", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"
