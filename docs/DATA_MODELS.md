# Data Models

## Entity Hierarchy

```
Organization (top-level container)
├── Department (optional grouping)
├── Team (work group)
│   ├── TeamMember (user membership with role)
│   └── Project (work container)
│       ├── ProjectMember (explicit project access)
│       ├── ProjectTeam (multi-team access)
│       ├── ProjectExclusion (user blocklist)
│       ├── Task (work item)
│       │   ├── TaskAssignment (multi-assignee)
│       │   ├── TaskComment (discussion)
│       │   ├── TaskDocument (linked docs)
│       │   └── TaskCustomFieldValue
│       ├── Blocker (blocking issues)
│       ├── Document (content)
│       │   ├── DocumentVersion (history)
│       │   └── DocumentComment (feedback)
│       ├── ProjectCustomField (custom attributes)
│       └── RecurringTaskRule (automation)
└── User (authenticated person)
    ├── OrganizationMember
    ├── TeamMember
    └── personal_team (auto-created)
```

## Core Models

### User
Primary user account model.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | String | Unique email address |
| display_name | String | Display name |
| google_id | String | Google OAuth ID |
| avatar_url | String | Profile image URL |
| title | String | Job title |
| department | String | Department name |
| is_active | Boolean | Account active status |
| onboarding_completed | Boolean | Onboarding finished |
| personal_team_id | UUID | Auto-created personal team |

### Organization
Top-level container for teams and users.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Organization name |
| slug | String | URL-safe unique identifier |
| logo_url | String | Logo image URL |
| settings | JSONB | Organization settings |

### Team
Work group within an organization.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Team name |
| description | Text | Team description |
| organization_id | UUID | Parent organization (nullable for personal teams) |
| department_id | UUID | Optional department grouping |
| is_personal | Boolean | Personal team flag |
| owner_id | UUID | Owner user (for personal teams) |
| settings | JSONB | Team settings |

### Project
Container for tasks, documents, and collaboration.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Project name |
| description | Text | Project description |
| status | String | active, completed, archived, on_hold |
| scope | String | PERSONAL, TEAM, ORGANIZATION |
| project_type | String | clinical_study, data_analysis, etc. |
| team_id | UUID | Primary owning team |
| parent_id | UUID | Parent project (for subprojects) |
| is_org_public | Boolean | Visible to all org members |
| org_public_role | String | Role for org-public access (viewer, member) |
| allow_all_team_members | Boolean | Team-based access enabled |
| start_date | Date | Project start |
| target_end_date | Date | Target completion |
| tags | String[] | Project tags |
| color | String | Hex color code |
| emoji | String | Icon emoji |
| is_demo | Boolean | Demo project flag |

**Hierarchy**: Maximum depth of 2 (project → subproject).

### Task
Work item within a project.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Task title |
| description | JSONB | TipTap rich text content |
| status | String | idea, todo, in_progress, in_review, done |
| priority | String | low, medium, high, urgent |
| task_type | String | general, paper_review, data_analysis, etc. |
| project_id | UUID | Parent project |
| assignee_id | UUID | Primary assignee (legacy) |
| due_date | Date | Due date |
| completed_at | DateTime | Completion timestamp |
| position | Integer | Ordering within status |
| parent_task_id | UUID | Parent task (for subtasks) |
| recurring_rule_id | UUID | Source recurring rule |
| source_idea_id | UUID | Source personal idea |
| tags | String[] | Task tags |
| extra_data | JSONB | Type-specific metadata |

### Blocker
Issues blocking work progress.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Blocker title |
| description | JSONB | TipTap rich text content |
| status | String | open, in_progress, resolved, wont_fix |
| priority | String | low, medium, high, urgent |
| blocker_type | String | general, external_dependency, resource, etc. |
| impact_level | String | low, medium, high, critical |
| resolution_type | String | resolved, wont_fix, deferred, duplicate |
| project_id | UUID | Parent project |
| assignee_id | UUID | Assigned resolver |
| due_date | Date | Resolution deadline |
| resolved_at | DateTime | Resolution timestamp |

**BlockerLink**: Links blockers to tasks or projects they block.

### Document
Collaborative document with versioning.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Document title |
| content | JSONB | TipTap JSON content |
| content_text | Text | Plain text for search |
| document_type | String | general, protocol, report, manuscript, notes |
| status | String | draft, in_review, approved, published |
| version | Integer | Current version number |
| project_id | UUID | Parent project |
| template_id | UUID | Source template |
| word_count | Integer | Word count |
| allow_comments | Boolean | Comments enabled |
| allow_suggestions | Boolean | Suggestions enabled |

### Review
Document review workflow.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Review title |
| document_id | UUID | Document being reviewed |
| project_id | UUID | Project context |
| task_id | UUID | Optional linked task |
| review_type | String | feedback, approval, peer_review, editorial |
| status | String | pending, in_progress, changes_requested, approved, etc. |
| priority | String | low, normal, high, urgent |
| document_version | Integer | Snapshot version |
| due_date | DateTime | Review deadline |
| decision | String | approved, rejected, needs_revision |
| auto_transition_task | Boolean | Auto-update task on completion |

**ReviewAssignment**: Assigns reviewers with roles (reviewer, primary_reviewer, approver).

## AI Models

### AIConversation
Chat conversation with AI assistant.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Conversation owner |
| organization_id | UUID | Organization context |
| title | String | Conversation title |
| context_type | String | Context type (project, document, etc.) |
| context_id | UUID | Context entity ID |

### AIPendingAction
Pending AI-proposed actions awaiting approval.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| conversation_id | UUID | Source conversation |
| tool_name | String | Tool that proposed action |
| tool_input | JSONB | Tool input parameters |
| entity_type | String | Target entity type |
| entity_id | UUID | Target entity ID |
| old_state | JSONB | State before action |
| new_state | JSONB | Proposed new state |
| status | String | pending, approved, rejected, expired |
| expires_at | DateTime | Expiration time (1 hour) |

## Access Control Models

### OrganizationMember
User membership in organization.

| Field | Type | Description |
|-------|------|-------------|
| organization_id | UUID | Organization |
| user_id | UUID | User |
| role | String | admin, member |

### TeamMember
User membership in team.

| Field | Type | Description |
|-------|------|-------------|
| team_id | UUID | Team |
| user_id | UUID | User |
| role | String | owner, lead, member |

### ProjectMember
Explicit project membership (overrides team-based access).

| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project |
| user_id | UUID | User |
| role | String | owner, admin, editor, member, viewer |

### ProjectTeam
Links projects to multiple teams for access.

| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project |
| team_id | UUID | Team |
| role | String | Default role for team members |

### ProjectExclusion
Blocklist for team-based access.

| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project |
| user_id | UUID | Excluded user |
| reason | Text | Exclusion reason |

## Collaboration Models

### InviteCode
Shareable invite codes for joining teams/orgs.

| Field | Type | Description |
|-------|------|-------------|
| code | String | Short shareable code (e.g., "TM-X8B2P4") |
| organization_id | UUID | Target org (mutually exclusive with team_id) |
| team_id | UUID | Target team (mutually exclusive with org_id) |
| role | String | Role assigned on join |
| expires_at | DateTime | Expiration time |
| max_uses | Integer | Maximum uses (null = unlimited) |
| use_count | Integer | Current use count |
| is_active | Boolean | Active status |

### TaskAssignment
Multi-assignee task assignments.

| Field | Type | Description |
|-------|------|-------------|
| task_id | UUID | Task |
| user_id | UUID | Assigned user |
| role | String | assignee, lead, reviewer, observer |
| status | String | assigned, accepted, in_progress, completed |
| due_date | Date | Individual deadline override |

## Recurring Tasks

### RecurringTaskRule
Rule for automatically creating recurring tasks.

| Field | Type | Description |
|-------|------|-------------|
| title | String | Template task title |
| description | Text | Template description |
| project_id | UUID | Target project |
| recurrence_type | String | daily, weekly, biweekly, monthly, etc. |
| recurrence_config | JSONB | Pattern configuration |
| start_date | Date | Rule start |
| end_date | Date | Rule end (optional) |
| due_date_offset_days | Integer | Days after creation for due date |
| next_occurrence | Date | Next scheduled creation |
| is_active | Boolean | Rule active status |

## Custom Fields

### ProjectCustomField
User-defined custom fields for a project.

| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project |
| name | String | Field identifier |
| display_name | String | Display label |
| field_type | String | text, number, date, select, multi_select, user, checkbox, url |
| field_config | JSONB | Options, validation rules, etc. |
| applies_to | String | task, document, all |
| is_required | Boolean | Required field |

### TaskCustomFieldValue
Custom field values for tasks.

| Field | Type | Description |
|-------|------|-------------|
| task_id | UUID | Task |
| field_id | UUID | Custom field definition |
| value | JSONB | Field value |

## Base Model

All models inherit from `BaseModel`:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Auto-generated primary key |
| created_at | DateTime | Creation timestamp (UTC) |
| updated_at | DateTime | Last update timestamp (UTC) |
