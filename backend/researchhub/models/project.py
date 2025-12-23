"""Project and Task models for research project management."""

from datetime import datetime, date
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

# Maximum allowed hierarchy depth (project → subproject)
MAX_HIERARCHY_DEPTH = 2

if TYPE_CHECKING:
    from researchhub.models.document import Document
    from researchhub.models.idea import Idea
    from researchhub.models.organization import Team
    from researchhub.models.user import User


class Project(BaseModel):
    """Research project - flat by default, optional subprojects."""

    __tablename__ = "projects"

    # Basic info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status and scope
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )  # active, completed, archived, on_hold
    scope: Mapped[str] = mapped_column(
        String(50), nullable=False, default="TEAM"
    )  # PERSONAL, TEAM, ORGANIZATION

    # Organization-public settings (only applies when scope=ORGANIZATION)
    is_org_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    org_public_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="viewer"
    )  # viewer, member

    # Team access control (blocklist mode - default allow all team members)
    allow_all_team_members: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Project type for template/workflow suggestions
    project_type: Mapped[str] = mapped_column(
        String(100), nullable=False, default="general"
    )  # clinical_study, data_analysis, literature_review, lab_operations, general

    # Hierarchy (flat by default, optional subprojects)
    parent_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Ownership
    team_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timeline
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Settings and metadata stored as JSON
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Tags for organization
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Color for visual identification
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color

    # Archive flag
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="projects")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id])
    parent: Mapped["Project | None"] = relationship(
        "Project", remote_side="Project.id", back_populates="subprojects"
    )
    subprojects: Mapped[list["Project"]] = relationship(
        "Project", back_populates="parent", lazy="selectin"
    )
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="project", lazy="selectin"
    )
    members: Mapped[list["ProjectMember"]] = relationship(
        "ProjectMember", back_populates="project", lazy="selectin"
    )
    custom_fields: Mapped[list["ProjectCustomField"]] = relationship(
        "ProjectCustomField", back_populates="project", lazy="selectin"
    )
    recurring_rules: Mapped[list["RecurringTaskRule"]] = relationship(
        "RecurringTaskRule", back_populates="project", lazy="selectin"
    )
    blockers: Mapped[list["Blocker"]] = relationship(
        "Blocker", back_populates="project", lazy="selectin"
    )

    # Multi-team access via project_teams
    project_teams: Mapped[list["ProjectTeam"]] = relationship(
        "ProjectTeam", back_populates="project", lazy="selectin", cascade="all, delete-orphan"
    )

    # User exclusions (blocklist)
    exclusions: Mapped[list["ProjectExclusion"]] = relationship(
        "ProjectExclusion", back_populates="project", lazy="selectin", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        try:
            return f"<Project {self.name}>"
        except Exception:
            try:
                return f"<Project id={self.id}>"
            except Exception:
                return "<Project detached>"

    def get_depth(self) -> int:
        """Calculate the depth of this project in the hierarchy (1 = top-level).

        Note: This method requires the parent relationship to be loaded.
        Call within an active session context.
        """
        depth = 1
        current = self
        while current.parent is not None:
            depth += 1
            current = current.parent
        return depth

    def get_has_children(self) -> bool:
        """Check if this project has any subprojects.

        Note: This method requires the subprojects relationship to be loaded.
        Call within an active session context.
        """
        return len(self.subprojects) > 0

    def get_children_count(self) -> int:
        """Count of direct children (subprojects).

        Note: This method requires the subprojects relationship to be loaded.
        Call within an active session context.
        """
        return len(self.subprojects)


class ProjectMember(BaseModel):
    """Project membership with role-based access."""

    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
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
    )  # owner, admin, member, viewer

    # Notification preferences for this project
    notify_on_task_assigned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    notify_on_document_update: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    notify_on_comment: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="members")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<ProjectMember project={self.project_id} user={self.user_id}>"


class ProjectTeam(BaseModel):
    """Links projects to multiple teams for multi-team access."""

    __tablename__ = "project_teams"

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    team_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member"
    )  # Default role for team members accessing via this link
    added_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="project_teams")
    team: Mapped["Team"] = relationship("Team", back_populates="project_teams")
    added_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        return f"<ProjectTeam project={self.project_id} team={self.team_id}>"


class ProjectExclusion(BaseModel):
    """User exclusion from team-based project access (blocklist)."""

    __tablename__ = "project_exclusions"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_exclusion"),
    )

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    excluded_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="exclusions")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    excluded_by: Mapped["User | None"] = relationship("User", foreign_keys=[excluded_by_id])

    def __repr__(self) -> str:
        return f"<ProjectExclusion project={self.project_id} user={self.user_id}>"


class Task(BaseModel):
    """Task within a project."""

    __tablename__ = "tasks"

    # Basic info
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # TipTap rich text format

    # Status and priority
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="todo"
    )  # idea, todo, in_progress, in_review, done
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium"
    )  # low, medium, high, urgent

    # Task type for specialized handling
    task_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="general"
    )  # general, paper_review, data_analysis, writing, meeting

    # Ownership and assignment
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assignee_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Timeline
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Ordering within status column
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Time tracking (optional)
    estimated_hours: Mapped[float | None] = mapped_column(nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(nullable=True)

    # Parent task for subtasks
    parent_task_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Tags
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Metadata for task type specific data
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Link to recurring rule that created this task (if any)
    recurring_rule_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("recurring_task_rules.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Link to source idea if task was created from personal idea capture
    source_idea_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("ideas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")
    created_by: Mapped["User | None"] = relationship(
        "User", foreign_keys=[created_by_id]
    )
    assignee: Mapped["User | None"] = relationship("User", foreign_keys=[assignee_id])
    parent_task: Mapped["Task | None"] = relationship(
        "Task", remote_side="Task.id", back_populates="subtasks"
    )
    subtasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="parent_task", lazy="selectin",
        cascade="all, delete-orphan", passive_deletes=True
    )
    comments: Mapped[list["TaskComment"]] = relationship(
        "TaskComment", back_populates="task", lazy="selectin",
        cascade="all, delete-orphan", passive_deletes=True
    )
    assignments: Mapped[list["TaskAssignment"]] = relationship(
        "TaskAssignment", back_populates="task", lazy="selectin",
        cascade="all, delete-orphan", passive_deletes=True
    )
    documents: Mapped[list["TaskDocument"]] = relationship(
        "TaskDocument", back_populates="task", lazy="selectin",
        cascade="all, delete-orphan", passive_deletes=True
    )
    custom_field_values: Mapped[list["TaskCustomFieldValue"]] = relationship(
        "TaskCustomFieldValue", back_populates="task", lazy="selectin",
        cascade="all, delete-orphan", passive_deletes=True
    )
    recurring_rule: Mapped["RecurringTaskRule | None"] = relationship(
        "RecurringTaskRule", back_populates="created_tasks"
    )
    votes: Mapped[list["IdeaVote"]] = relationship(
        "IdeaVote", back_populates="task", lazy="selectin",
        cascade="all, delete-orphan", passive_deletes=True
    )
    source_idea: Mapped["Idea | None"] = relationship(
        "Idea", foreign_keys=[source_idea_id]
    )

    def __repr__(self) -> str:
        try:
            return f"<Task {self.title[:30]}>"
        except Exception:
            try:
                return f"<Task id={self.id}>"
            except Exception:
                return "<Task detached>"


class IdeaVote(BaseModel):
    """Vote/endorsement on an idea (task with status='idea').

    Tracks user votes to help prioritize which ideas should be
    converted to tasks or projects.
    """

    __tablename__ = "idea_votes"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_idea_vote_task_user"),
    )

    task_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vote_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="upvote"
    )  # upvote (expandable for future vote types)

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="votes")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<IdeaVote task={self.task_id} user={self.user_id}>"


class TaskComment(BaseModel):
    """Comment on a task."""

    __tablename__ = "task_comments"

    task_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # For threaded comments
    parent_comment_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("task_comments.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Edit tracking
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="comments")
    user: Mapped["User"] = relationship("User")
    parent_comment: Mapped["TaskComment | None"] = relationship(
        "TaskComment", remote_side="TaskComment.id", back_populates="replies"
    )
    replies: Mapped[list["TaskComment"]] = relationship(
        "TaskComment", back_populates="parent_comment", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<TaskComment {self.id} on task={self.task_id}>"


class CommentReaction(BaseModel):
    """Emoji reaction on a task comment."""

    __tablename__ = "comment_reactions"
    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", "emoji", name="uq_comment_reaction"),
    )

    comment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("task_comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    emoji: Mapped[str] = mapped_column(String(50), nullable=False)

    # Relationships
    comment: Mapped["TaskComment"] = relationship("TaskComment")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<CommentReaction {self.emoji} by user={self.user_id} on comment={self.comment_id}>"


class CommentMention(BaseModel):
    """@mention of a user in a task comment."""

    __tablename__ = "comment_mentions"
    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", name="uq_comment_mention"),
    )

    comment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("task_comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationships
    comment: Mapped["TaskComment"] = relationship("TaskComment")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<CommentMention user={self.user_id} in comment={self.comment_id}>"


class ProjectTemplate(BaseModel):
    """Reusable project templates."""

    __tablename__ = "project_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Template type
    template_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # clinical_study, data_analysis, literature_review, lab_operations

    # Template content as JSON
    structure: Mapped[dict] = mapped_column(
        JSONB, nullable=False
    )  # Contains default tasks, documents, settings

    # Default settings
    default_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Ownership - null means system template
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # System template flag
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Active flag
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Usage tracking
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:
        try:
            return f"<ProjectTemplate {self.name}>"
        except Exception:
            try:
                return f"<ProjectTemplate id={self.id}>"
            except Exception:
                return "<ProjectTemplate detached>"


class TaskAssignment(BaseModel):
    """Assignment of a user to a task - enables multiple assignees."""

    __tablename__ = "task_assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_assignment"),
    )

    task_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Who assigned this user
    assigned_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Assignment role/type
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="assignee"
    )  # assignee, lead, reviewer, observer

    # Individual status tracking
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="assigned"
    )  # assigned, accepted, in_progress, completed

    # Optional individual due date override
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Notes about this assignment
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Completion tracking
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="assignments")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    assigned_by: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_by_id])

    def __repr__(self) -> str:
        return f"<TaskAssignment task={self.task_id} user={self.user_id}>"


class TaskDocument(BaseModel):
    """Links tasks to related documents (attachments/deliverables)."""

    __tablename__ = "task_documents"
    __table_args__ = (
        UniqueConstraint("task_id", "document_id", name="uq_task_document"),
    )

    task_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Link type
    link_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="reference"
    )  # reference, attachment, deliverable, input, output

    # Is this the primary document for the task?
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Does task completion require this document to be reviewed/approved?
    requires_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Display order
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Notes about the link
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who created the link
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="documents")
    document: Mapped["Document"] = relationship("Document")
    created_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        return f"<TaskDocument task={self.task_id} doc={self.document_id}>"


class RecurringTaskRule(BaseModel):
    """Rule for automatically creating recurring tasks."""

    __tablename__ = "recurring_task_rules"

    # Template task properties
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    estimated_hours: Mapped[float | None] = mapped_column(nullable=True)

    # Project and ownership
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Default assignees (stored as JSON array of user IDs)
    default_assignee_ids: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )

    # Recurrence pattern
    recurrence_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # daily, weekly, biweekly, monthly, quarterly, yearly, custom

    # Recurrence configuration (days_of_week, day_of_month, etc.)
    recurrence_config: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    # Schedule
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Due date offset (days after task creation)
    due_date_offset_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Next scheduled creation
    next_occurrence: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    # Tracking
    last_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Active status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Extra configuration
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="recurring_rules")
    created_by: Mapped["User | None"] = relationship("User")
    created_tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="recurring_rule", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<RecurringTaskRule {self.title[:30]}>"
        except Exception:
            try:
                return f"<RecurringTaskRule id={self.id}>"
            except Exception:
                return "<RecurringTaskRule detached>"


class ProjectCustomField(BaseModel):
    """User-defined custom fields for a project."""

    __tablename__ = "project_custom_fields"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_custom_field_name"),
    )

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Field definition
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Field type and configuration
    field_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # text, number, date, select, multi_select, user, checkbox, url

    # Configuration for the field (options, required, default, min, max, etc.)
    field_config: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    # Which entity types can have this field
    applies_to: Mapped[str] = mapped_column(
        String(50), nullable=False, default="task"
    )  # task, document, all

    # Display order
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Active status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Who created
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="custom_fields")
    created_by: Mapped["User | None"] = relationship("User")
    values: Mapped[list["TaskCustomFieldValue"]] = relationship(
        "TaskCustomFieldValue", back_populates="field", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<ProjectCustomField {self.name} project={self.project_id}>"
        except Exception:
            try:
                return f"<ProjectCustomField id={self.id}>"
            except Exception:
                return "<ProjectCustomField detached>"


class TaskCustomFieldValue(BaseModel):
    """Stores custom field values for tasks."""

    __tablename__ = "task_custom_field_values"
    __table_args__ = (
        UniqueConstraint("task_id", "field_id", name="uq_task_custom_field_value"),
    )

    task_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("project_custom_fields.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Value stored as JSONB to support all types
    value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    task: Mapped["Task"] = relationship("Task", back_populates="custom_field_values")
    field: Mapped["ProjectCustomField"] = relationship("ProjectCustomField", back_populates="values")

    def __repr__(self) -> str:
        return f"<TaskCustomFieldValue task={self.task_id} field={self.field_id}>"


class Blocker(BaseModel):
    """Blocker entity - represents blocking issues that can block tasks or projects."""

    __tablename__ = "blockers"

    # Basic info (mirrors Task structure)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # TipTap rich text format

    # Status and priority
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="open"
    )  # open, in_progress, resolved, wont_fix
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium"
    )  # low, medium, high, urgent

    # Blocker-specific fields
    blocker_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="general"
    )  # general, external_dependency, resource, technical, approval
    resolution_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # resolved, wont_fix, deferred, duplicate
    impact_level: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium"
    )  # low, medium, high, critical

    # Ownership
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assignee_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Timeline
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Tags
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Metadata for blocker type specific data
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="blockers")
    created_by: Mapped["User | None"] = relationship(
        "User", foreign_keys=[created_by_id]
    )
    assignee: Mapped["User | None"] = relationship("User", foreign_keys=[assignee_id])
    blocked_items: Mapped[list["BlockerLink"]] = relationship(
        "BlockerLink", back_populates="blocker", lazy="selectin", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        try:
            return f"<Blocker {self.title[:30]}>"
        except Exception:
            try:
                return f"<Blocker id={self.id}>"
            except Exception:
                return "<Blocker detached>"


class BlockerLink(BaseModel):
    """Links blockers to tasks or projects they block."""

    __tablename__ = "blocker_links"
    __table_args__ = (
        UniqueConstraint(
            "blocker_id", "blocked_entity_type", "blocked_entity_id",
            name="uq_blocker_link"
        ),
    )

    blocker_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("blockers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Polymorphic reference to blocked entity
    blocked_entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "task" or "project"
    blocked_entity_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )

    # Optional notes about this blocking relationship
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who created the link
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    blocker: Mapped["Blocker"] = relationship("Blocker", back_populates="blocked_items")
    created_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        return f"<BlockerLink blocker={self.blocker_id} blocks {self.blocked_entity_type}={self.blocked_entity_id}>"
