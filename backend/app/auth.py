"""Google ID-token authentication for account-owned API resources."""

import os
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None


bearer = HTTPBearer(auto_error=False)


def verify_google_token(token: str) -> AuthenticatedUser:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured")
    try:
        claims = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=client_id,
        )
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token") from None

    subject = claims.get("sub")
    if not subject or claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return AuthenticatedUser(
        id=str(subject),
        email=claims.get("email"),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")
    return verify_google_token(credentials.credentials)
