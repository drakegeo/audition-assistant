from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

MOCK_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
MOCK_SCRIPT_ID = "11111111-2222-3333-4444-555555555555"


@pytest.fixture
def mock_auth():
    """Patch Supabase auth so any Bearer token resolves to MOCK_USER_ID."""
    mock_user = MagicMock()
    mock_user.id = MOCK_USER_ID
    with patch("src.auth.supabase_auth._admin") as mock_admin:
        mock_admin.return_value.auth.get_user.return_value = MagicMock(user=mock_user)
        yield mock_admin


@pytest.fixture
def client(mock_auth) -> TestClient:
    from src.api.main import app
    return TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid-test-token"}
