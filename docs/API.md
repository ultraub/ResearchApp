# API Reference

## Overview

- **Base URL**: `/api/v1`
- **Authentication**: Bearer token (JWT)
- **Content-Type**: `application/json`
- **Interactive Docs**: `/api/v1/docs` (Swagger UI)

## Authentication

All endpoints except `/auth/*` and `/health` require authentication via Bearer token.

```
Authorization: Bearer <access_token>
```

## Endpoints

### Health

#### GET /health
Health check endpoint for load balancers.

**Response**: `{ "status": "healthy", "version": "0.1.0" }`

---

### Authentication (`/auth`)

#### POST /auth/google/login
Exchange Google OAuth authorization code for JWT tokens.

**Request**:
```json
{
  "code": "google_auth_code",
  "redirect_uri": "http://localhost:3000/callback"
}
```

**Response**:
```json
{
  "access_token": "jwt_access_token",
  "refresh_token": "jwt_refresh_token",
  "token_type": "bearer",
  "expires_in": 3600
}
```

#### POST /auth/refresh
Refresh access token using refresh token.

**Headers**: `Authorization: Bearer <refresh_token>`

**Response**: Same as login response.

#### GET /auth/me
Get current authenticated user.

**Response**:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "User Name",
  "avatar_url": "https://...",
  "onboarding_completed": true,
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### POST /auth/logout
Logout current user (client should discard tokens).

---

### Organizations (`/organizations`)

#### GET /organizations
List organizations the user belongs to.

#### GET /organizations/{org_id}
Get organization details.

#### PUT /organizations/{org_id}
Update organization settings. **Requires admin role.**

#### GET /organizations/{org_id}/members
List organization members.

---

### Teams (`/teams`)

#### GET /teams
List teams in current organization.

#### POST /teams
Create a new team. **Requires org admin role.**

#### GET /teams/{team_id}
Get team details.

#### PUT /teams/{team_id}
Update team. **Requires team lead/owner role.**

#### DELETE /teams/{team_id}
Delete team. **Requires team owner or org admin role.**

#### GET /teams/{team_id}/members
List team members.

#### POST /teams/{team_id}/members
Add member to team. **Requires team lead role.**

#### DELETE /teams/{team_id}/members/{user_id}
Remove member from team. **Requires team lead role.**

---

### Projects (`/projects`)

#### GET /projects
List accessible projects.

**Query Parameters**:
- `team_id`: Filter by team
- `status`: Filter by status (active, completed, archived)
- `include_subprojects`: Include subprojects in response

#### POST /projects
Create a new project.

**Request**:
```json
{
  "name": "Project Name",
  "description": "Description",
  "team_id": "uuid",
  "scope": "TEAM",
  "project_type": "general",
  "parent_id": null
}
```

#### GET /projects/{project_id}
Get project details.

#### PUT /projects/{project_id}
Update project. **Requires member role or higher.**

#### DELETE /projects/{project_id}
Delete project. **Requires admin role.**

#### GET /projects/{project_id}/members
List project members.

#### POST /projects/{project_id}/members
Add project member. **Requires admin role.**

#### DELETE /projects/{project_id}/members/{user_id}
Remove project member. **Requires admin role.**

#### POST /projects/{project_id}/teams
Add team access to project. **Requires admin role.**

#### DELETE /projects/{project_id}/teams/{team_id}
Remove team access. **Requires admin role.**

#### POST /projects/{project_id}/exclusions
Add user to exclusion list. **Requires admin role.**

#### DELETE /projects/{project_id}/exclusions/{user_id}
Remove user from exclusion list. **Requires admin role.**

---

### Tasks (`/tasks`)

#### GET /tasks
List tasks.

**Query Parameters**:
- `project_id`: Filter by project (required)
- `status`: Filter by status
- `assignee_id`: Filter by assignee
- `priority`: Filter by priority
- `include_subtasks`: Include subtasks

#### POST /tasks
Create a new task.

**Request**:
```json
{
  "title": "Task Title",
  "description": { "type": "doc", "content": [] },
  "project_id": "uuid",
  "status": "todo",
  "priority": "medium",
  "assignee_id": "uuid",
  "due_date": "2024-12-31"
}
```

#### GET /tasks/{task_id}
Get task details.

#### PUT /tasks/{task_id}
Update task.

#### DELETE /tasks/{task_id}
Delete task.

#### POST /tasks/{task_id}/complete
Mark task as complete.

#### POST /tasks/{task_id}/reopen
Reopen completed task.

#### GET /tasks/{task_id}/comments
List task comments.

#### POST /tasks/{task_id}/comments
Add comment to task.

#### POST /tasks/{task_id}/assignments
Add assignment to task.

#### DELETE /tasks/{task_id}/assignments/{user_id}
Remove assignment.

---

### Blockers (`/blockers`)

#### GET /blockers
List blockers.

**Query Parameters**:
- `project_id`: Filter by project
- `status`: Filter by status (open, in_progress, resolved)

#### POST /blockers
Create a new blocker.

**Request**:
```json
{
  "title": "Blocker Title",
  "description": { "type": "doc", "content": [] },
  "project_id": "uuid",
  "priority": "high",
  "blocker_type": "external_dependency",
  "impact_level": "high"
}
```

#### GET /blockers/{blocker_id}
Get blocker details.

#### PUT /blockers/{blocker_id}
Update blocker.

#### POST /blockers/{blocker_id}/resolve
Resolve blocker.

**Request**:
```json
{
  "resolution_type": "resolved",
  "notes": "Resolution notes"
}
```

#### POST /blockers/{blocker_id}/links
Link blocker to task or project.

---

### Documents (`/documents`)

#### GET /documents
List documents.

**Query Parameters**:
- `project_id`: Filter by project
- `status`: Filter by status (draft, in_review, approved, published)
- `document_type`: Filter by type

#### POST /documents
Create a new document.

**Request**:
```json
{
  "title": "Document Title",
  "project_id": "uuid",
  "document_type": "general",
  "content": { "type": "doc", "content": [] }
}
```

#### GET /documents/{document_id}
Get document details with content.

#### PUT /documents/{document_id}
Update document.

#### DELETE /documents/{document_id}
Delete document.

#### POST /documents/{document_id}/versions
Create a new version snapshot.

#### GET /documents/{document_id}/versions
List document versions.

#### GET /documents/{document_id}/versions/{version}
Get specific version.

#### GET /documents/{document_id}/comments
List document comments.

#### POST /documents/{document_id}/comments
Add comment to document.

---

### Reviews (`/reviews`)

#### GET /reviews
List reviews.

**Query Parameters**:
- `project_id`: Filter by project
- `document_id`: Filter by document
- `status`: Filter by status
- `assigned_to_me`: Only reviews assigned to current user

#### POST /reviews
Create a new review.

**Request**:
```json
{
  "title": "Review Title",
  "document_id": "uuid",
  "project_id": "uuid",
  "review_type": "peer_review",
  "due_date": "2024-12-31T00:00:00Z"
}
```

#### GET /reviews/{review_id}
Get review details.

#### PUT /reviews/{review_id}
Update review.

#### POST /reviews/{review_id}/assignments
Assign reviewer.

#### POST /reviews/{review_id}/complete
Complete review with decision.

**Request**:
```json
{
  "decision": "approved",
  "decision_notes": "Approved with minor changes"
}
```

#### GET /reviews/{review_id}/comments
List review comments.

#### POST /reviews/{review_id}/comments
Add review comment.

---

### AI Assistant (`/assistant`)

#### POST /assistant/chat
Send message to AI assistant (streaming SSE response).

**Request**:
```json
{
  "message": "What tasks are due this week?",
  "conversation_id": "uuid",
  "page_context": {
    "type": "project",
    "id": "uuid",
    "project_id": "uuid",
    "name": "Project Name"
  },
  "messages": []
}
```

**Response**: Server-Sent Events stream with:
- `event: text` - Text content
- `event: tool_call` - Tool being called
- `event: tool_result` - Query tool result
- `event: action_preview` - Pending action preview
- `event: done` - Stream complete

#### GET /assistant/actions
List pending actions awaiting approval.

#### POST /assistant/actions/{action_id}/approve
Approve pending action.

#### POST /assistant/actions/{action_id}/reject
Reject pending action.

---

### AI (`/ai`)

#### POST /ai/summarize
Summarize text content.

#### POST /ai/suggest
Get AI suggestions for content.

#### POST /ai/detect-phi
Detect potential PHI in content.

---

### Search (`/search`)

#### GET /search
Search across entities with hybrid keyword + semantic ranking.

**Query Parameters**:
- `q`: Search query (required)
- `types`: Entity types to search (projects, tasks, documents, blockers, papers, journal_entries)
- `project_id`: Limit to project scope
- `mode`: Search mode - `hybrid` (default), `keyword`, or `semantic`

**Response**:
```json
{
  "results": [
    {
      "id": "uuid",
      "type": "task",
      "title": "Task Title",
      "snippet": "...matching content...",
      "score": 85.5,
      "project_id": "uuid",
      "project_name": "Project Name"
    }
  ],
  "total": 15,
  "mode": "hybrid"
}
```

**Scoring** (hybrid mode):
- Exact title match: +100 points
- Partial title match: +50 points
- Content match: +20 points
- Semantic similarity: 0-40 points (cosine similarity × 40)

---

### Invites (`/invites`)

#### GET /invites/codes
List invite codes for current team/org.

#### POST /invites/codes
Create a new invite code.

**Request**:
```json
{
  "team_id": "uuid",
  "role": "member",
  "max_uses": 10,
  "expires_at": "2024-12-31T00:00:00Z"
}
```

#### DELETE /invites/codes/{code}
Delete invite code.

#### POST /invites/join/{code}
Join team/org using invite code.

---

### Journals (`/journals`)

#### GET /journals
List journal entries.

#### POST /journals
Create journal entry.

#### GET /journals/{entry_id}
Get journal entry.

#### PUT /journals/{entry_id}
Update journal entry.

---

### Knowledge (`/knowledge`)

#### GET /knowledge/papers
List papers.

#### POST /knowledge/papers
Add paper to knowledge base.

#### GET /knowledge/collections
List collections.

#### POST /knowledge/collections
Create collection.

---

### Analytics (`/analytics`)

#### GET /analytics/dashboard
Get dashboard analytics.

#### GET /analytics/project/{project_id}
Get project analytics.

---

### Exports (`/exports`)

#### POST /exports/project/{project_id}
Export project data.

**Query Parameters**:
- `format`: pdf, csv, json

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate or conflicting state |
| 422 | Validation Error - Pydantic validation failed |
| 500 | Internal Server Error |

## Rate Limiting

- **General endpoints**: 60 requests/minute
- **AI endpoints**: 20 requests/minute

Rate limit headers:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp
