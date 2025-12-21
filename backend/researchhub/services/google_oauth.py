"""Google OAuth authentication service."""

from typing import Any

import httpx
import structlog

from researchhub.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


class GoogleOAuthService:
    """Service for Google OAuth authentication operations."""

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for tokens."""
        # Validate credentials are configured
        if not settings.google_client_id or not settings.google_client_secret.get_secret_value():
            logger.error("Google OAuth credentials not configured")
            raise ValueError("Google OAuth not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret.get_secret_value(),
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if response.status_code != 200:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                error_code = error_data.get("error", "unknown")
                error_desc = error_data.get("error_description", response.text)

                logger.error(
                    "Google token exchange failed",
                    status_code=response.status_code,
                    error_code=error_code,
                    error_description=error_desc,
                    redirect_uri=redirect_uri,
                )

                # Provide specific error messages for common issues
                if error_code == "invalid_grant":
                    raise ValueError("Authorization code expired or already used. Please try signing in again.")
                elif error_code == "redirect_uri_mismatch":
                    raise ValueError(f"Redirect URI mismatch. Expected URI registered in Google Console.")
                else:
                    raise ValueError(f"Token exchange failed: {error_desc}")

            return response.json()

    async def get_user_info(self, access_token: str) -> dict[str, Any]:
        """Get user information from Google userinfo endpoint."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if response.status_code != 200:
                logger.error(
                    "Failed to get user info from Google",
                    status_code=response.status_code,
                    response=response.text,
                )
                raise ValueError("Failed to get user info")

            user_data = response.json()

            return {
                "id": user_data.get("id"),
                "email": user_data.get("email"),
                "name": user_data.get("name"),
                "given_name": user_data.get("given_name"),
                "family_name": user_data.get("family_name"),
                "picture": user_data.get("picture"),
                "verified_email": user_data.get("verified_email", False),
            }
