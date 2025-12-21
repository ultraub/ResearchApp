"""SQLAlchemy models package."""

from researchhub.models.organization import (
    Department,
    InviteCode,
    Organization,
    OrganizationMember,
    Team,
    TeamMember,
)
from researchhub.models.user import User, UserPreferences
from researchhub.models.idea import Idea
from researchhub.models.project import (
    Blocker,
    BlockerLink,
    Project,
    ProjectMember,
    ProjectTemplate,
    ProjectCustomField,
    RecurringTaskRule,
    Task,
    TaskAssignment,
    TaskComment,
    TaskCustomFieldValue,
    TaskDocument,
)
from researchhub.models.document import (
    Document,
    DocumentVersion,
    DocumentComment,
    DocumentCommentMention,
    DocumentTemplate,
)
from researchhub.models.knowledge import (
    Paper,
    Collection,
    CollectionPaper,
    PaperHighlight,
    PaperLink,
)
from researchhub.models.activity import (
    Activity,
    Notification,
    NotificationPreference,
)
from researchhub.models.collaboration import (
    ProjectShare,
    DocumentShare,
    ShareLink,
    Invitation,
    Comment,
    Reaction,
    CommentRead,
)
from researchhub.models.ai import (
    AIConversation,
    AIConversationMessage,
    AIPromptTemplate,
    AIUsageLog,
    AIOrganizationSettings,
)
from researchhub.models.review import (
    Review,
    ReviewAssignment,
    ReviewComment,
    AutoReviewConfig,
    AutoReviewLog,
)
from researchhub.models.journal import (
    JournalEntry,
    JournalEntryLink,
)

__all__ = [
    # User & Organization
    "User",
    "UserPreferences",
    "Organization",
    "OrganizationMember",
    "Department",
    "Team",
    "TeamMember",
    "InviteCode",
    # Ideas & Projects
    "Blocker",
    "BlockerLink",
    "Idea",
    "Project",
    "ProjectMember",
    "ProjectTemplate",
    "ProjectCustomField",
    "RecurringTaskRule",
    "Task",
    "TaskAssignment",
    "TaskComment",
    "TaskCustomFieldValue",
    "TaskDocument",
    # Documents
    "Document",
    "DocumentVersion",
    "DocumentComment",
    "DocumentTemplate",
    # Knowledge
    "Paper",
    "Collection",
    "CollectionPaper",
    "PaperHighlight",
    "PaperLink",
    # Activity & Notifications
    "Activity",
    "Notification",
    "NotificationPreference",
    # Collaboration
    "ProjectShare",
    "DocumentShare",
    "ShareLink",
    "Invitation",
    "Comment",
    "Reaction",
    "CommentRead",
    # AI
    "AIConversation",
    "AIConversationMessage",
    "AIPromptTemplate",
    "AIUsageLog",
    "AIOrganizationSettings",
    # Review
    "Review",
    "ReviewAssignment",
    "ReviewComment",
    "AutoReviewConfig",
    "AutoReviewLog",
    # Journal
    "JournalEntry",
    "JournalEntryLink",
]
