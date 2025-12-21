"""Azure AD authentication service."""

from typing import Any

import httpx
import msal
import structlog

from researchhub.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class AzureADService:
    """Service for Azure AD authentication operations."""

    def __init__(self) -> None:
        """Initialize the Azure AD service."""
        self._msal_app: msal.ConfidentialClientApplication | None = None

    @property
    def msal_app(self) -> msal.ConfidentialClientApplication:
        """Get or create MSAL confidential client application."""
        if self._msal_app is None:
            self._msal_app = msal.ConfidentialClientApplication(
                client_id=settings.azure_client_id,
                client_credential=settings.azure_client_secret.get_secret_value(),
                authority=settings.azure_authority_url,
            )
        return self._msal_app

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for tokens."""
        result = self.msal_app.acquire_token_by_authorization_code(
            code=code,
            scopes=["User.Read", "openid", "profile", "email"],
            redirect_uri=redirect_uri,
        )

        if "error" in result:
            logger.error(
                "Azure AD token exchange failed",
                error=result.get("error"),
                description=result.get("error_description"),
            )
            raise ValueError(f"Token exchange failed: {result.get('error_description')}")

        return result

    async def get_user_info(self, access_token: str) -> dict[str, Any]:
        """Get user information from Microsoft Graph API."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if response.status_code != 200:
                logger.error(
                    "Failed to get user info from Microsoft Graph",
                    status_code=response.status_code,
                    response=response.text,
                )
                raise ValueError("Failed to get user info")

            user_data = response.json()

            return {
                "oid": user_data.get("id"),
                "email": user_data.get("mail") or user_data.get("userPrincipalName"),
                "name": user_data.get("displayName"),
                "given_name": user_data.get("givenName"),
                "family_name": user_data.get("surname"),
                "tid": user_data.get("tenantId"),
            }

    def get_authorization_url(self, redirect_uri: str, state: str | None = None) -> str:
        """Generate Azure AD authorization URL."""
        auth_url = self.msal_app.get_authorization_request_url(
            scopes=["User.Read", "openid", "profile", "email"],
            redirect_uri=redirect_uri,
            state=state,
        )
        return auth_url

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """Refresh access token using refresh token."""
        result = self.msal_app.acquire_token_by_refresh_token(
            refresh_token=refresh_token,
            scopes=["User.Read", "openid", "profile", "email"],
        )

        if "error" in result:
            logger.error(
                "Azure AD token refresh failed",
                error=result.get("error"),
                description=result.get("error_description"),
            )
            raise ValueError(f"Token refresh failed: {result.get('error_description')}")

        return result
