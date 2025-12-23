"""Organization, department, and team models."""

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.user import User
    from researchhub.models.project import Project, ProjectTeam


class Organization(BaseModel):
    """Organization model - top level of hierarchy."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Organization settings stored as JSON
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    members: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="organization", lazy="selectin"
    )
    departments: Mapped[list["Department"]] = relationship(
        "Department", back_populates="organization", lazy="selectin"
    )
    teams: Mapped[list["Team"]] = relationship(
        "Team", back_populates="organization", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<Organization {self.slug}>"
        except Exception:
            return f"<Organization id={self.id}>"


class OrganizationMember(BaseModel):
    """Organization membership with role."""

    __tablename__ = "organization_members"

    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member"
    )  # admin, member

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="members"
    )
    user: Mapped["User"] = relationship("User", back_populates="organization_memberships")

    def __repr__(self) -> str:
        return f"<OrganizationMember org={self.organization_id} user={self.user_id}>"


class Department(BaseModel):
    """Department within an organization."""

    __tablename__ = "departments"

    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="departments"
    )
    teams: Mapped[list["Team"]] = relationship(
        "Team", back_populates="department", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<Department {self.name}>"
        except Exception:
            return f"<Department id={self.id}>"


class Team(BaseModel):
    """Team within an organization, optionally under a department.

    Personal teams have organization_id=NULL and is_personal=True.
    """

    __tablename__ = "teams"

    # Nullable for personal teams (org-independent)
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    department_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Team settings stored as JSON
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Personal team flags
    is_personal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    owner_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    organization: Mapped["Organization | None"] = relationship("Organization", back_populates="teams")
    department: Mapped["Department | None"] = relationship(
        "Department", back_populates="teams"
    )
    members: Mapped[list["TeamMember"]] = relationship(
        "TeamMember", back_populates="team", lazy="selectin"
    )
    projects: Mapped[list["Project"]] = relationship(
        "Project", back_populates="team", lazy="selectin"
    )
    owner: Mapped["User | None"] = relationship(
        "User", foreign_keys=[owner_id], back_populates="personal_team"
    )

    # Multi-team project access
    project_teams: Mapped[list["ProjectTeam"]] = relationship(
        "ProjectTeam", back_populates="team", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<Team {self.name}>"
        except Exception:
            return f"<Team id={self.id}>"


class TeamMember(BaseModel):
    """Team membership with role."""

    __tablename__ = "team_members"

    team_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member"
    )  # owner, lead, member

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="team_memberships")

    def __repr__(self) -> str:
        return f"<TeamMember team={self.team_id} user={self.user_id}>"


class InviteCode(BaseModel):
    """Shareable invite codes for joining organizations or teams.

    Unlike email-based Invitations (in collaboration.py), InviteCodes are
    shareable links that anyone can use to join. They target either
    an organization OR a team (mutually exclusive, enforced by DB constraint).
    """

    __tablename__ = "invite_codes"

    # Unique invite code (short, shareable, e.g., "TM-X8B2P4")
    code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, index=True
    )

    # Target - either organization or team (mutually exclusive)
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Role assigned upon joining
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="member")

    # Invitation metadata
    created_by: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Optional: restrict to specific email
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Expiration and usage limits
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_uses: Mapped[int | None] = mapped_column(nullable=True)  # NULL = unlimited
    use_count: Mapped[int] = mapped_column(nullable=False, default=0)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    organization: Mapped["Organization | None"] = relationship("Organization")
    team: Mapped["Team | None"] = relationship("Team")
    creator: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        try:
            target = f"org={self.organization_id}" if self.organization_id else f"team={self.team_id}"
            return f"<InviteCode {self.code} {target}>"
        except Exception:
            return f"<InviteCode id={self.id}>"

    def is_valid(self) -> bool:
        """Check if invitation is still valid."""
        if not self.is_active:
            return False
        if self.expires_at and datetime.now(timezone.utc) > self.expires_at:
            return False
        if self.max_uses is not None and self.use_count >= self.max_uses:
            return False
        return True
