# Authentication & Permissions

## Authentication Flow

### Google OAuth 2.0

Primary authentication method using Google OAuth.

```
1. Frontend redirects to Google OAuth consent
2. User authorizes, Google redirects with auth code
3. Frontend sends code to POST /auth/google/login
4. Backend exchanges code for Google tokens
5. Backend creates/updates user from Google profile
6. Backend issues JWT access + refresh tokens
7. Frontend stores tokens and uses for API calls
```

### JWT Tokens

| Token Type | Expiration | Purpose |
|------------|------------|---------|
| Access Token | 60 minutes | API authentication |
| Refresh Token | 7 days | Obtain new access tokens |

**Token Structure**:
```json
{
  "sub": "user_uuid",
  "exp": 1234567890,
  "type": "access|refresh"
}
```

### Dev Token (Development Only)

For local development without OAuth:

- **Token**: `dev-token-for-testing`
- **Environment**: Only works when `environment=development`
- **Behavior**: Auto-creates dev user with org and team membership
- **Usage**: `Authorization: Bearer dev-token-for-testing`

## User Provisioning

### First Login Flow

When a user logs in for the first time:

1. **User Created**: From Google profile (email, name, avatar)
2. **Personal Team Created**: Auto-created `{name}'s Personal` team
3. **Personal Organization Created**: Auto-created `{name}'s Organization`
4. **Memberships Set**: User is admin of their org, lead of personal team
5. **Onboarding**: User directed to onboarding flow

### Onboarding

Users must complete onboarding before accessing main app:

| Step | Field |
|------|-------|
| 1 | Title, Department |
| 2 | Research Interests |
| 3 | Notification Preferences |
| 4 | Team Selection |
| 5 | Complete |

## Authorization Model

### Role Hierarchy

Roles are compared numerically: higher = more permissions.

```python
ROLE_HIERARCHY = {
    "owner": 5,
    "admin": 4,
    "editor": 3,
    "member": 2,
    "viewer": 1
}
```

### Organization Roles

| Role | Permissions |
|------|-------------|
| admin | Full org management, create teams, manage members |
| member | View org, access org-public projects |

### Team Roles

| Role | Permissions |
|------|-------------|
| owner | Full team management, delete team |
| lead | Manage members, manage projects |
| member | Access team projects |

### Project Roles

| Role | Permissions |
|------|-------------|
| owner | Full project control, delete project |
| admin | Manage members, manage access |
| editor | Create/edit tasks, documents, blockers |
| member | Create tasks, view content, comment |
| viewer | View only |

## Project Access Control

Projects have three scope levels that determine access:

### PERSONAL Scope

- **Access**: Owner only (created_by_id)
- **Use Case**: Private personal projects
- **Team Visibility**: Hidden from team

### TEAM Scope

- **Access**: Members of teams in `project_teams` (blocklist model)
- **Use Case**: Team collaboration projects
- **Blocklist**: Users in `ProjectExclusion` are denied access

**Access Check Flow**:
```
1. Check ProjectMember (explicit) → use that role
2. Check ProjectShare → use share role
3. Check ProjectExclusion → if excluded, deny
4. Check project_teams membership → grant access with team's role
```

### ORGANIZATION Scope

- **Access**: Team members always, org members if `is_org_public=true`
- **Use Case**: Department/org-wide visibility
- **Org Public Role**: `org_public_role` (viewer or member) for non-team org members

**Access Check Flow**:
```
1. Check ProjectMember (explicit) → use that role
2. Check ProjectShare → use share role
3. Check project_teams membership → grant with team's role
4. If is_org_public:
   a. Check org membership → grant org_public_role
5. Deny
```

## Permission Checking

### access_control.py Functions

```python
# Check project access, return effective role or raise 403
role = await check_project_access(
    db, project, user_id,
    required_role="member"  # Optional minimum role
)

# Helper to compare roles
if has_sufficient_role(user_role, "admin"):
    # User has admin or higher

# Get or create personal team
team = await get_or_create_personal_team(db, user)

# Get or create personal organization
org = await get_or_create_personal_organization(db, user)

# Auto-add user to org when joining team
await ensure_org_membership(db, team, user_id)

# Manage project team access
await add_team_to_project(db, project, team_id, role="member")
await remove_team_from_project(db, project, team_id)

# Manage project exclusions
await add_project_exclusion(db, project, user_id, excluded_by_id)
await remove_project_exclusion(db, project, user_id)
```

### API Dependency Pattern

Endpoints use FastAPI dependencies for auth:

```python
from researchhub.api.v1.auth import CurrentUser, OptionalUser

@router.get("/endpoint")
async def endpoint(
    current_user: CurrentUser,  # Required auth
    db: AsyncSession = Depends(get_db_session),
):
    pass

@router.get("/public-endpoint")
async def public_endpoint(
    user: OptionalUser,  # Optional auth
):
    pass
```

### Checking Access in Handlers

```python
from researchhub.services.access_control import check_project_access

@router.get("/projects/{project_id}/tasks")
async def get_tasks(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
):
    # Load project
    project = await get_project(db, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Check access (raises 403 if denied)
    role = await check_project_access(db, project, current_user.id)

    # Proceed with authorized operation
    ...
```

## Invite System

### InviteCode Model

Shareable codes for joining teams or organizations.

| Field | Description |
|-------|-------------|
| code | Short unique code (e.g., "TM-X8B2P4") |
| team_id / organization_id | Target (mutually exclusive) |
| role | Role assigned on join |
| max_uses | Usage limit (null = unlimited) |
| expires_at | Expiration time |
| is_active | Active flag |

### Invite Flow

```
1. Admin creates invite code for team/org
2. Code shared via link: /join/{code}
3. User visits link, authenticated via OAuth
4. Backend validates code (active, not expired, uses available)
5. User added to team/org with specified role
6. Code use_count incremented
```

### Code Validation

```python
def is_valid(self) -> bool:
    if not self.is_active:
        return False
    if self.expires_at and datetime.now(UTC) > self.expires_at:
        return False
    if self.max_uses and self.use_count >= self.max_uses:
        return False
    return True
```

## Guest Access

When `FEATURE_GUEST_ACCESS_ENABLED=true`:

- Users can be invited as guests via email
- Guests have limited, project-scoped access
- Guest tokens expire after `guest_token_expire_days` (default 30)

## Security Considerations

### Token Storage

- **Frontend**: Tokens stored in Zustand with localStorage persistence
- **Sensitive fields**: Use `SecretStr` type in Pydantic
- **Token refresh**: Automatic refresh before expiration

### CORS

Configured via `ALLOWED_ORIGINS`:
```python
allowed_origins: list[str] = ["http://localhost:3000"]
```

### Rate Limiting

- General: 60 requests/minute per user
- AI endpoints: 20 requests/minute per user

### Password Security

No passwords stored - OAuth-only authentication via Google.

### Session Management

- JWT-based stateless authentication
- No server-side session storage
- Token revocation: Not supported (tokens valid until expiry)
- Logout: Client-side token discard
