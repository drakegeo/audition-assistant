from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient


def test_missing_auth_header_returns_401() -> None:
    from src.api.main import app
    c = TestClient(app)
    assert c.get("/scripts/current").status_code == 401


def test_malformed_bearer_returns_401() -> None:
    from src.api.main import app
    c = TestClient(app)
    assert c.get("/scripts/current", headers={"Authorization": "Token abc"}).status_code == 401


def test_invalid_token_returns_401() -> None:
    from src.api.main import app
    with patch("src.auth.supabase_auth._admin") as mock_admin:
        mock_admin.return_value.auth.get_user.side_effect = Exception("invalid token")
        c = TestClient(app)
        resp = c.get("/scripts/current", headers={"Authorization": "Bearer bad"})
    assert resp.status_code == 401


def test_valid_token_passes_auth(client, auth_headers) -> None:
    """A valid token reaches the endpoint (returns 404 not 401 — no script yet)."""
    with patch("src.api.scripts.db.get_full_script_for_user", return_value=None):
        resp = client.get("/scripts/current", headers=auth_headers)
    assert resp.status_code == 404
