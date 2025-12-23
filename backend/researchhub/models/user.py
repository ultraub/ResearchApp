"""User and preferences models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Float
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel, TimestampMixin

if TYPE_CHECKING:
    from researchhub.models.organization import OrganizationMember, TeamMember, Team


class User(BaseModel):
    """User model for Google OAuth authenticated users and guests."""

    __tablename__ = "users"

    # Basic info
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Profile info
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    research_interests: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Google OAuth integration
    google_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )

    # Azure AD integration (legacy, kept for migration)
    azure_oid: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    azure_tenant_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Account status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Onboarding state
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    onboarding_step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Timestamps
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Personal team reference (created lazily on first personal project)
    personal_team_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    preferences: Mapped["UserPreferences"] = relationship(
        "UserPreferences", back_populates="user", uselist=False, lazy="joined"
    )
    organization_memberships: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="user", lazy="selectin"
    )
    team_memberships: Mapped[list["TeamMember"]] = relationship(
        "TeamMember", back_populates="user", lazy="selectin"
    )
    personal_team: Mapped["Team | None"] = relationship(
        "Team", foreign_keys=[personal_team_id], lazy="joined"
    )

    def __repr__(self) -> str:
        try:
            return f"<User {self.email}>"
        except Exception:
            return f"<User id={self.id}>"


class UserPreferences(BaseModel):
    """User preferences for customization."""

    __tablename__ = "user_preferences"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Display preferences
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="system")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")

    # Notification preferences
    notification_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notification_email_digest: Mapped[str] = mapped_column(
        String(20), nullable=False, default="daily"
    )
    notification_in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Project view preferences
    default_project_view: Mapped[str] = mapped_column(String(20), nullable=False, default="list")

    # Editor preferences
    editor_font_size: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
    editor_line_height: Mapped[float] = mapped_column(Float, nullable=False, default=1.6)

    # AI preferences
    ai_suggestions_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Additional settings stored as JSON
    additional_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="preferences")

    def __repr__(self) -> str:
        return f"<UserPreferences user_id={self.user_id}>"
