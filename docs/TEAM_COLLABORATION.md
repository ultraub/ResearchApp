# Team Collaboration Guide

## Organizational Structure

```
Organization
├── Departments (optional grouping)
│   └── Teams
└── Teams (direct under org)
    ├── Members
    └── Projects
        ├── Tasks
        ├── Documents
        └── Blockers
```

## Organizations

### What is an Organization?
The top-level container for all work. Organizations:
- Contain all teams, projects, and users
- Have organization-wide settings
- Control billing and features
- Define shared templates and resources

### Organization Roles

| Role | Capabilities |
|------|-------------|
| **admin** | Full org management, create teams, manage all members |
| **member** | View org, access org-public projects, join teams |

### Organization Settings
- Logo and branding
- Default templates
- AI configuration
- Feature flags
- Access policies

## Departments

Optional organizational grouping:
- Group related teams together
- Provide departmental hierarchy
- No direct permission implications
- Useful for larger organizations

## Teams

### What is a Team?
Working groups within an organization:
- Container for projects
- Member management
- Access control boundary

### Team Types

| Type | Description |
|------|-------------|
| **Regular Team** | Standard team under an organization |
| **Personal Team** | Auto-created for each user's private work |

### Team Roles

| Role | Capabilities |
|------|-------------|
| **owner** | Full team management, can delete team |
| **lead** | Manage members, create projects |
| **member** | Access team projects |

### Personal Teams
Every user has a personal team:
- Auto-created on first login
- `is_personal = true`
- Owner is the user
- Can have personal projects
- Not associated with an organization

## Team Membership

### Adding Members

**Via Invite Code**:
1. Team lead/owner creates invite code
2. Code shared via link (e.g., `TM-X8B2P4`)
3. User clicks link and authenticates
4. User automatically added to team
5. Optional: Restrict to specific email

**Via Direct Add**:
1. Team lead/owner adds user by email
2. If user exists: Added immediately
3. If new: Email invitation sent

### Invite Code Features
- Unique code format: `TM-XXXXXX`
- Optional expiration date
- Optional max uses limit
- Specify role on join
- Track usage count
- Activate/deactivate as needed

### Removing Members
1. Team lead/owner removes member
2. Member loses access to team projects
3. User's contributions remain

## Project Access

### Scope Levels

| Scope | Who Has Access |
|-------|----------------|
| **PERSONAL** | Only project owner |
| **TEAM** | Team members (minus exclusions) |
| **ORGANIZATION** | Team members + optional org visibility |

### Team Projects
Projects with TEAM or ORGANIZATION scope:
- All team members have access by default
- Blocklist model: Exclude specific users
- Multiple teams can access one project

### Multi-Team Access
Projects can be shared across teams:
1. Project owner adds another team
2. All members of that team gain access
3. Each team can have different role level
4. Remove team access when no longer needed

### Project Exclusions
Block specific users from team projects:
- User remains on team
- User cannot access specific project
- Useful for confidential projects
- Exclusion tracked with who excluded and when

## Project Roles

| Role | Capabilities |
|------|-------------|
| **owner** | Full control, delete project |
| **admin** | Manage members and settings |
| **editor** | Create/edit tasks, documents |
| **member** | Create tasks, comment, view |
| **viewer** | Read-only access |

### Role Inheritance
```
owner > admin > editor > member > viewer
```
Higher roles inherit all lower role permissions.

## Invitations

### Email Invitations (Invitation model)
For inviting specific people:

| Status | Meaning |
|--------|---------|
| **pending** | Awaiting response |
| **accepted** | User joined |
| **declined** | User refused |
| **expired** | Past expiration |
| **revoked** | Cancelled by admin |

Features:
- Personal message option
- Email tracking (sent, opened)
- Reminder capability
- Expiration date

### Invite Codes (InviteCode model)
For open invitations:
- Shareable link
- No specific recipient
- Usage limits optional
- Great for onboarding events

---

## Sharing System

The sharing system enables granular access control for projects and documents beyond team membership.

### Sharing Models Overview

| Model | Purpose | Granularity |
|-------|---------|-------------|
| **ProjectShare** | Share project with individual user | User-level |
| **DocumentShare** | Share document outside project context | User-level |
| **ShareLink** | Public/semi-public link access | Link-based |

### ProjectShare

Direct sharing of a project with a specific user. Useful when:
- User needs project access but isn't on the team
- Different access level than team default
- Temporary collaborators

**ProjectShare Fields**:
| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project being shared |
| user_id | UUID | User receiving access |
| role | string | Access role (viewer, member, editor, admin) |
| shared_by_id | UUID | User who created the share |
| message | string | Optional personal message |
| expires_at | datetime | Optional expiration |
| accepted_at | datetime | When user accepted |
| is_active | boolean | Share status |

### DocumentShare

Share individual documents with users who may not have project access.

**DocumentShare Fields**:
| Field | Type | Description |
|-------|------|-------------|
| document_id | UUID | Document being shared |
| user_id | UUID | User receiving access |
| permission | string | view, comment, or edit |
| shared_by_id | UUID | User who created the share |
| message | string | Optional personal message |
| expires_at | datetime | Optional expiration |
| accepted_at | datetime | When user accepted |
| is_active | boolean | Share status |

### ShareLink (Public Links)

Create shareable links that don't require user accounts (optional).

**ShareLink Fields**:
| Field | Type | Description |
|-------|------|-------------|
| token | string | Unique 64-char link token |
| resource_type | string | project, document, collection |
| resource_id | UUID | Resource being shared |
| access_level | string | view, comment, edit |
| requires_auth | boolean | Require login to access |
| password_hash | string | Optional password protection |
| allowed_domains | string[] | Restrict to email domains |
| expires_at | datetime | Optional expiration |
| max_uses | int | Maximum access count |
| use_count | int | Current access count |
| is_active | boolean | Link status |
| created_by_id | UUID | Link creator |

### Share Link Security Options

| Option | Description |
|--------|-------------|
| **Public** | Anyone with link can access |
| **Auth Required** | Must be logged in |
| **Password Protected** | Requires password |
| **Domain Restricted** | Only specific email domains |
| **Expiring** | Auto-deactivates after date |
| **Limited Uses** | Deactivates after N accesses |

### Sharing Workflows

**Sharing a Project with a User**:
1. Navigate to project settings → Sharing
2. Enter user's email
3. Select access role
4. Optionally add message
5. Optionally set expiration
6. User receives notification/email

**Creating a Share Link**:
1. Navigate to resource settings → Share Link
2. Configure access level
3. Set security options (auth, password, domains)
4. Set expiration/use limits
5. Copy and distribute link

---

## Comments and Discussions

### Comment Types in the System

The system has multiple comment implementations for different contexts:

| Comment Type | Location | Model |
|--------------|----------|-------|
| **Task Comments** | Task detail view | TaskComment |
| **Document Comments** | Document editor | DocumentComment |
| **Review Comments** | Review workflow | ReviewComment |
| **Generic Comments** | Any resource | Comment (polymorphic) |

### Generic Comment Model (Polymorphic)

The `Comment` model supports discussions on any resource type.

**Polymorphic Targeting**:
| resource_type | Description |
|---------------|-------------|
| project | Project-level discussions |
| task | Task discussions |
| document | Document feedback |
| idea | Idea comments |
| paper | Research paper discussions |

**Comment Fields**:
| Field | Type | Description |
|-------|------|-------------|
| content | text | Plain text content |
| content_html | text | Rendered HTML with mentions/links |
| resource_type | string | Target resource type |
| resource_id | UUID | Target resource ID |
| parent_id | UUID | Parent comment (for replies) |
| thread_id | UUID | Root comment ID for threading |
| author_id | UUID | Comment author |
| mentioned_user_ids | string[] | @mentioned user IDs |
| is_edited | boolean | Whether comment was edited |
| edited_at | datetime | Last edit timestamp |
| is_deleted | boolean | Soft delete flag |
| deleted_at | datetime | Deletion timestamp |
| is_resolved | boolean | Resolution status |
| resolved_by_id | UUID | User who resolved |
| resolved_at | datetime | Resolution timestamp |

### Comment Features

**Threading**:
- Replies linked via `parent_id`
- Thread tracking via `thread_id`
- Nested conversation support

**@Mentions**:
- Store mentioned users in `mentioned_user_ids` array
- Rendered in `content_html`
- Trigger notifications to mentioned users

**Edit Tracking**:
- `is_edited` flag shows modified comments
- `edited_at` timestamp for last edit
- Original content preserved in history

**Resolution**:
- Mark comments as resolved
- Track who resolved and when
- Useful for feedback workflows

**Soft Delete**:
- `is_deleted` flag preserves thread structure
- Shows "[deleted]" in place of content
- Maintains reply context

### Task Comment Model (TaskComment)

Specific implementation for task discussions:

**TaskComment Fields**:
| Field | Type | Description |
|-------|------|-------------|
| task_id | UUID | Parent task |
| user_id | UUID | Comment author |
| content | text | Comment text (TipTap JSON) |
| is_edited | boolean | Edit flag |
| edited_at | datetime | Edit timestamp |

### Document Comment Model (DocumentComment)

For inline and general document feedback:

**DocumentComment Fields**:
| Field | Type | Description |
|-------|------|-------------|
| document_id | UUID | Parent document |
| user_id | UUID | Comment author |
| content | text | Comment text |
| quote_text | text | Quoted document text |
| position_data | JSONB | Selection position in doc |
| is_inline | boolean | Inline vs general comment |
| is_resolved | boolean | Resolution status |
| resolved_by_id | UUID | Resolver |
| resolved_at | datetime | Resolution time |

---

## Reactions

### Reaction Types

The system supports two reaction implementations:

| Model | Used For | Scope |
|-------|----------|-------|
| **CommentReaction** | Task comments only | Task discussions |
| **Reaction** | Any resource (polymorphic) | Universal |

### CommentReaction (Task Comments)

**CommentReaction Fields**:
| Field | Type | Description |
|-------|------|-------------|
| comment_id | UUID | Task comment being reacted to |
| user_id | UUID | User adding reaction |
| emoji | string | Emoji or reaction code |

**Constraints**: One reaction per user per emoji per comment

### Reaction (Polymorphic)

Universal reaction model for any resource type.

**Reaction Fields**:
| Field | Type | Description |
|-------|------|-------------|
| resource_type | string | Type of resource (comment, task, etc.) |
| resource_id | UUID | Resource being reacted to |
| user_id | UUID | User adding reaction |
| emoji | string | Emoji or reaction code |

**Constraints**: One reaction per user per emoji per resource

### Common Reactions

| Emoji | Typical Meaning |
|-------|-----------------|
| 👍 | Agree / Approve |
| ❤️ | Love it |
| 🎉 | Celebrate |
| 👀 | Looking into it |
| 🚀 | Ship it |
| 😕 | Confused |
| ➕ | +1 / Me too |

---

## Comment Read Tracking

### CommentRead Model

Tracks which comments a user has read across all comment types.

**Polymorphic Design**:
Works across task, document, review, and generic comments using `comment_type` + `comment_id`.

**CommentRead Fields**:
| Field | Type | Description |
|-------|------|-------------|
| comment_type | string | task, document, review, generic |
| comment_id | UUID | Comment being tracked |
| user_id | UUID | User who read |
| read_at | datetime | When read |

### Comment Types for Read Tracking

| comment_type | Source Model |
|--------------|--------------|
| task | TaskComment |
| document | DocumentComment |
| review | ReviewComment |
| generic | Comment |

### Read Tracking Behavior

**Auto-Mark Read**:
- Comments marked read after viewing for ~2 seconds
- Prevents accidental mark-as-read on scroll-by
- Frontend hook `useCommentReads` handles timing

**Manual Mark Unread**:
- Users can mark comments as unread
- Useful for "come back to this" workflow

**Unread Counts**:
- Badge counts on tasks/documents
- Filter views to show only unread
- Per-resource unread aggregation

### Frontend Integration

```typescript
// useCommentReads hook
const {
  unreadCount,      // Number of unread comments
  isRead,           // Check if specific comment is read
  markAsRead,       // Mark comments as read
  markAsUnread,     // Mark comment as unread
} = useTaskCommentReads(commentIds);
```

---

## Notifications

### Notification Triggers

| Trigger | Recipients |
|---------|------------|
| Task assigned | Assignee |
| @mentioned in comment | Mentioned users |
| Task you own updated | Task creator |
| Due date approaching | Assignee |
| Task completed | Watchers, creator |
| Review requested | Reviewers |
| Document updated | Collaborators |
| Comment on your content | Content author |
| Reply to your comment | Parent comment author |

### Notification Model

**Notification Fields**:
| Field | Type | Description |
|-------|------|-------------|
| user_id | UUID | Recipient |
| notification_type | string | Type of notification |
| title | string | Short title |
| message | text | Full message |
| resource_type | string | Related resource type |
| resource_id | UUID | Related resource ID |
| actor_id | UUID | User who triggered |
| is_read | boolean | Read status |
| read_at | datetime | When read |

### Notification Preferences

**NotificationPreference Fields**:
| Field | Type | Description |
|-------|------|-------------|
| user_id | UUID | User |
| notification_type | string | Type of notification |
| email_enabled | boolean | Send emails |
| in_app_enabled | boolean | Show in-app |
| push_enabled | boolean | Push notifications |

### Configurable Preferences

Users can configure per notification type:
- Email notifications on/off
- In-app notifications on/off
- Push notifications on/off (future)
- Quiet hours (future)

---

## Real-Time Collaboration

### Document Collaboration
- Multiple editors can work simultaneously
- Changes saved automatically
- Version history tracks all changes
- Comments appear in real-time

### Activity Feeds
Stay updated on team activity:
- Recent task changes
- Document updates
- New comments
- Team member changes

---

## Best Practices

### For Team Leads
- Keep team membership current
- Remove inactive members
- Use invite codes for onboarding
- Review project access regularly
- Set clear role expectations

### For Project Owners
- Define access at project creation
- Use exclusions sparingly
- Add teams rather than individuals
- Review org visibility settings
- Document project purpose
- Use share links for external collaborators

### For Team Members
- Check assigned tasks regularly
- Respond to mentions promptly
- Keep task status current
- Use comments for discussion
- Respect access boundaries
- React to comments to show engagement

---

## Onboarding New Members

### New User Flow
1. User receives invite (code or email)
2. User authenticates (Google OAuth)
3. User completes onboarding:
   - Title, Department
   - Research Interests
   - Notification Preferences
   - Team Selection
4. User gains access to team projects
5. Dashboard shows relevant tasks

### Team Onboarding Checklist
- [ ] Create invite code with appropriate role
- [ ] Share invite link
- [ ] Prepare project access
- [ ] Brief new member on team processes
- [ ] Assign initial tasks
- [ ] Add to relevant reviews

---

## Access Troubleshooting

### User Can't Access Project
Check:
1. Is user on a team that has access?
2. Is user in project exclusion list?
3. Does project scope allow access?
4. What is user's effective role?
5. Is there a ProjectShare granting access?
6. Is there a valid ShareLink they should use?

### Access Flow Decision Tree
```
1. Check ProjectMember → if found, use that role
2. Check ProjectShare → if found, use share role
3. Check ProjectExclusion → if excluded, deny
4. Check team membership → if on team, grant team role
5. Check org membership + is_org_public → grant org_public_role
6. Check ShareLink with valid token → grant link access_level
7. Deny access
```

### Common Access Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Access denied" | Not on team | Add to team or create ProjectShare |
| "Project not found" | Excluded from project | Remove from ProjectExclusion |
| "Link expired" | ShareLink past expires_at | Create new ShareLink |
| "Max uses reached" | ShareLink use_count ≥ max_uses | Increase max_uses or new link |
| "Domain not allowed" | Email not in allowed_domains | Add domain or remove restriction |
