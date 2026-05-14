import os
from functools import lru_cache

from fastapi import Header, HTTPException
from supabase import Client, create_client


@lru_cache(maxsize=1)
def _admin() -> Client:
    """Return a cached Supabase admin client (service-role key).

    Lazy so that importing this module in tests doesn't fail when env vars
    are absent. The client is created on first authenticated request.
    """
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def get_current_user_id(authorization: str = Header(None)) -> str:
    """FastAPI dependency — verify Supabase JWT and return the user's UUID."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "detail": "Missing or invalid Authorization header"},
        )
    token = authorization[7:]
    try:
        result = _admin().auth.get_user(token)
        return str(result.user.id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "auth_failed token_len=%d error=%s", len(token), exc
        )
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "detail": "Token invalid or expired"},
        )
