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

## Sharing Workflows

### Sharing a Project with Another Team

1. Project owner/admin opens project settings
2. Navigate to "Team Access"
3. Select team to add
4. Choose access role
5. Confirm addition
6. Team members can now access

### Creating an Invite Link

1. Team lead opens team settings
2. Click "Create Invite Link"
3. Set role for new members
4. Set expiration (optional)
5. Set max uses (optional)
6. Share the generated link
7. Monitor usage

### Excluding a User from a Project

1. Project admin opens project settings
2. Navigate to "Member Access"
3. Find user to exclude
4. Click "Remove Access"
5. User loses access immediately
6. They remain on the team

## Comments and Discussions

### Where Comments Happen

| Location | Purpose |
|----------|---------|
| Tasks | Task-specific discussion |
| Documents | Document feedback (inline or general) |
| Reviews | Formal review feedback |

### Comment Features

**Threading**: Reply to comments for conversations
**@Mentions**: Notify specific users
**Reactions**: Quick emoji responses
**Resolution**: Mark comments as resolved
**Edit Tracking**: See when comments were edited

### Comment Read Tracking
System tracks which comments users have read:
- Count unread comments per resource
- Mark as read on view
- Filter to show unread only

## Notifications

### Notification Triggers
- Task assigned to you
- Mentioned in comment
- Task you created was updated
- Due date approaching
- Task completed
- Review requested
- Document updated

### Notification Preferences
Configure per user:
- Email notifications on/off
- In-app notifications
- Per-type preferences

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

### For Team Members
- Check assigned tasks regularly
- Respond to mentions promptly
- Keep task status current
- Use comments for discussion
- Respect access boundaries

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

## Access Troubleshooting

### User Can't Access Project
Check:
1. Is user on a team that has access?
2. Is user in project exclusion list?
3. Does project scope allow access?
4. What is user's effective role?

### Access Flow Decision Tree
```
1. Check ProjectMember → if found, use that role
2. Check ProjectShare → if found, use share role
3. Check ProjectExclusion → if excluded, deny
4. Check team membership → if on team, grant team role
5. Check org membership + is_org_public → grant org_public_role
6. Deny access
```
