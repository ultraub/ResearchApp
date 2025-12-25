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
│       │   │   ├── CommentReaction (emoji reactions)
│       │   │   └── CommentMention (@mentions)
│       │   ├── TaskDocument (linked docs)
│       │   ├── TaskCustomFieldValue
│       │   └── IdeaVote (for idea tasks)
│       ├── Blocker (blocking issues)
│       │   └── BlockerLink (what it blocks)
│       ├── Document (content)
│       │   ├── DocumentVersion (history)
│       │   └── DocumentComment (feedback)
│       │       └── DocumentCommentMention (@mentions)
│       ├── ProjectCustomField (custom attributes)
│       └── RecurringTaskRule (automation)
├── InviteCode (shareable join codes)
├── Invitation (pending invites)
├── Paper (research papers)
│   ├── PaperHighlight (annotations)
│   └── PaperLink (links to projects/tasks)
├── Collection (paper collections)
│   └── CollectionPaper (paper memberships)
├── JournalEntry (lab notebooks)
│   └── JournalEntryLink (links to entities)
└── User (authenticated person)
    ├── UserPreferences (settings)
    ├── OrganizationMember
    ├── TeamMember
    ├── Idea (quick captures)
    ├── Notification
    ├── NotificationPreference
    └── personal_team (auto-created)

Collaboration & Sharing:
├── ProjectShare (project access grants)
├── DocumentShare (document access grants)
├── ShareLink (public/semi-public links)
├── Comment (generic comments)
├── Reaction (emoji reactions)
└── CommentRead (read tracking)

AI Features:
├── AIConversation (chat sessions)
│   ├── AIConversationMessage (messages)
│   └── AIPendingAction (proposed actions)
├── AIPromptTemplate (custom prompts)
├── AIUsageLog (usage tracking)
└── AIOrganizationSettings (org settings)

Reviews:
├── Review (document reviews)
│   ├── ReviewAssignment (reviewers)
│   └── ReviewComment (review feedback)
├── AutoReviewConfig (AI review settings)
└── AutoReviewLog (AI review history)

Templates:
├── ProjectTemplate (project templates)
└── DocumentTemplate (document templates)

Activity:
└── Activity (audit trail)
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
| research_interests | String[] | Research interest tags |
| azure_oid | String | Azure AD ID (legacy) |
| azure_tenant_id | String | Azure tenant (legacy) |
| is_active | Boolean | Account active status |
| is_guest | Boolean | Guest user flag |
| onboarding_completed | Boolean | Onboarding finished |
| onboarding_step | Integer | Current onboarding step |
| last_login_at | DateTime | Last login timestamp |
| personal_team_id | UUID | Auto-created personal team |

### UserPreferences
User customization settings.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Owner user |
| theme | String | light, dark, system |
| theme_customization | JSONB | Custom theme settings |
| notification_email | Boolean | Email notifications enabled |
| notification_email_digest | String | immediate, daily, weekly |
| notification_in_app | Boolean | In-app notifications enabled |
| default_project_view | String | list, grid, grouped |
| editor_font_size | Integer | Editor font size |
| editor_line_height | Float | Editor line height |
| ai_suggestions_enabled | Boolean | AI suggestions enabled |
| additional_settings | JSONB | Extensible settings (e.g., hidden_demo_project) |

### Organization
Top-level container for teams and users.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Organization name |
| slug | String | URL-safe unique identifier |
| logo_url | String | Logo image URL |
| settings | JSONB | Organization settings |

### Department
Optional organizational grouping.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Department name |
| description | Text | Department description |
| organization_id | UUID | Parent organization |

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
| actual_end_date | Date | Actual completion |
| tags | String[] | Project tags |
| color | String | Hex color code |
| emoji | String | Icon emoji |
| is_demo | Boolean | Demo project flag |
| is_archived | Boolean | Archive flag |
| settings | JSONB | Project settings |
| extra_data | JSONB | Additional metadata |

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
| created_by_id | UUID | Creator user |
| assignee_id | UUID | Primary assignee (legacy) |
| due_date | Date | Due date |
| completed_at | DateTime | Completion timestamp |
| position | Integer | Ordering within status |
| estimated_hours | Float | Time estimate |
| actual_hours | Float | Time spent |
| parent_task_id | UUID | Parent task (for subtasks) |
| recurring_rule_id | UUID | Source recurring rule |
| source_idea_id | UUID | Source personal idea |
| tags | String[] | Task tags |
| extra_data | JSONB | Type-specific metadata |

### TaskComment
Comment on a task.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| task_id | UUID | Parent task |
| user_id | UUID | Comment author |
| content | Text | Comment content |
| parent_comment_id | UUID | Parent for threading |
| edited_at | DateTime | Edit timestamp |

### CommentReaction
Emoji reaction on a task comment.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| comment_id | UUID | Target comment |
| user_id | UUID | Reactor |
| emoji | String | Emoji character |

### CommentMention
@mention of a user in a task comment.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| comment_id | UUID | Parent comment |
| user_id | UUID | Mentioned user |

### TaskDocument
Links tasks to related documents.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| task_id | UUID | Parent task |
| document_id | UUID | Linked document |
| link_type | String | reference, attachment, deliverable, input, output |
| is_primary | Boolean | Primary document flag |
| requires_review | Boolean | Review required for completion |
| position | Integer | Display order |
| notes | Text | Link notes |
| created_by_id | UUID | Link creator |

### IdeaVote
Vote/endorsement on an idea task.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| task_id | UUID | Target task (must be idea status) |
| user_id | UUID | Voter |
| vote_type | String | upvote (expandable) |

### Blocker
Issues blocking work progress.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Blocker title |
| description | JSONB | TipTap rich text content |
| status | String | open, in_progress, resolved, wont_fix |
| priority | String | low, medium, high, urgent |
| blocker_type | String | general, external_dependency, resource, technical, approval |
| impact_level | String | low, medium, high, critical |
| resolution_type | String | resolved, wont_fix, deferred, duplicate |
| project_id | UUID | Parent project |
| created_by_id | UUID | Creator |
| assignee_id | UUID | Assigned resolver |
| due_date | Date | Resolution deadline |
| resolved_at | DateTime | Resolution timestamp |
| tags | String[] | Blocker tags |
| extra_data | JSONB | Additional metadata |

### BlockerLink
Links blockers to tasks or projects they block.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| blocker_id | UUID | Parent blocker |
| blocked_entity_type | String | task or project |
| blocked_entity_id | UUID | Blocked entity |
| notes | Text | Relationship notes |
| created_by_id | UUID | Link creator |

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
| created_by_id | UUID | Creator |
| last_edited_by_id | UUID | Last editor |
| template_id | UUID | Source template |
| word_count | Integer | Word count |
| allow_comments | Boolean | Comments enabled |
| allow_suggestions | Boolean | Suggestions enabled |
| tags | String[] | Document tags |
| settings | JSONB | Document settings |
| extra_data | JSONB | Additional metadata |
| is_archived | Boolean | Archive flag |
| is_system | Boolean | System doc (hidden from users, AI-accessible) |

### DocumentVersion
Immutable snapshot of document at a point in time.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| document_id | UUID | Parent document |
| version | Integer | Version number |
| content | JSONB | Content snapshot |
| content_text | Text | Plain text snapshot |
| change_summary | String | Change description |
| created_by_id | UUID | Version creator |
| word_count | Integer | Word count at version |

### DocumentComment
Comment on a document (inline or general).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| document_id | UUID | Parent document |
| created_by_id | UUID | Comment author |
| content | Text | Comment content |
| selection_start | Integer | Inline position start |
| selection_end | Integer | Inline position end |
| selected_text | Text | Selected text |
| is_resolved | Boolean | Resolution status |
| resolved_by_id | UUID | Resolver |
| resolved_at | DateTime | Resolution timestamp |
| parent_id | UUID | Parent for threading |

### DocumentCommentMention
@mention of a user in a document comment.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| comment_id | UUID | Parent comment |
| user_id | UUID | Mentioned user |

### DocumentTemplate
Reusable document templates.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Template name |
| description | Text | Template description |
| template_type | String | Template category |
| content | JSONB | TipTap template content |
| organization_id | UUID | Owner org (null = system) |
| created_by_id | UUID | Creator |
| is_system | Boolean | System template flag |
| is_active | Boolean | Active status |
| usage_count | Integer | Usage tracking |

### ProjectTemplate
Reusable project templates.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Template name |
| description | Text | Template description |
| template_type | String | clinical_study, data_analysis, etc. |
| structure | JSONB | Default tasks, documents, settings |
| default_settings | JSONB | Default project settings |
| organization_id | UUID | Owner org (null = system) |
| created_by_id | UUID | Creator |
| is_system | Boolean | System template flag |
| is_active | Boolean | Active status |
| usage_count | Integer | Usage tracking |

## Review Models

### Review
Document review workflow.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Review title |
| description | Text | Review description |
| document_id | UUID | Document being reviewed |
| project_id | UUID | Project context |
| task_id | UUID | Optional linked task |
| review_type | String | feedback, approval, peer_review, editorial |
| status | String | pending, in_progress, changes_requested, approved, completed, cancelled |
| priority | String | low, normal, high, urgent |
| document_version | Integer | Snapshot version |
| requested_by_id | UUID | Review requester |
| due_date | DateTime | Review deadline |
| completed_at | DateTime | Completion timestamp |
| completed_by_id | UUID | Completer |
| decision | String | approved, rejected, needs_revision |
| decision_notes | Text | Decision explanation |
| auto_transition_task | Boolean | Auto-update task on completion |
| tags | String[] | Review tags |
| settings | JSONB | Review settings |

### ReviewAssignment
Assigns reviewers with roles.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| review_id | UUID | Parent review |
| reviewer_id | UUID | Assigned reviewer |
| assigned_by_id | UUID | Assigner |
| status | String | pending, accepted, declined, in_progress, completed |
| role | String | reviewer, primary_reviewer, approver |
| responded_at | DateTime | Response timestamp |
| completed_at | DateTime | Completion timestamp |
| recommendation | String | approve, reject, revise, abstain |
| notes | Text | Reviewer notes |
| due_date | DateTime | Individual deadline |

### ReviewComment
Comment on a review (can be anchored to document text).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| review_id | UUID | Parent review |
| user_id | UUID | Comment author |
| content | Text | Comment content |
| comment_type | String | general, inline, suggestion, question, issue, gap_identified, clarity_needed, methodology_concern, consistency_issue |
| selected_text | Text | Anchored text |
| anchor_data | JSONB | Position data |
| source | String | human, ai_suggestion, ai_accepted, ai_dismissed |
| ai_confidence | Float | AI confidence score |
| question_for_author | Text | AI-generated question |
| why_this_matters | Text | AI explanation |
| severity | String | critical, major, minor, suggestion |
| is_resolved | Boolean | Resolution status |
| resolved_by_id | UUID | Resolver |
| resolved_at | DateTime | Resolution timestamp |
| resolution_notes | Text | Resolution notes |
| parent_comment_id | UUID | Parent for threading |
| edited_at | DateTime | Edit timestamp |

### AutoReviewConfig
Per-organization configuration for AI auto-reviews.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | Owner organization (unique) |
| on_document_create | Boolean | Trigger on document creation |
| on_document_update | Boolean | Trigger on document update |
| on_task_submit_review | Boolean | Trigger on task review submission |
| default_focus_areas | String[] | e.g., methodology, clarity, completeness |
| min_document_length | Integer | Min chars to trigger |
| review_cooldown_hours | Integer | Cooldown between reviews |
| max_suggestions_per_review | Integer | Max AI suggestions |
| auto_create_review | Boolean | Auto-create review flag |
| updated_by_id | UUID | Last updater |

### AutoReviewLog
Log of auto-reviews performed.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| task_id | UUID | Reviewed task |
| document_id | UUID | Reviewed document |
| content_hash | String | Content dedup hash |
| review_id | UUID | Created review |
| suggestions_count | Integer | Number of suggestions |
| trigger_source | String | document_create, document_update, task_submit_review, manual |
| status | String | pending, processing, completed, failed |
| error_message | Text | Error details |
| started_at | DateTime | Processing start |
| completed_at | DateTime | Processing end |

## AI Models

### AIConversation
Chat conversation with AI assistant.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Conversation owner |
| organization_id | UUID | Organization context |
| feature_name | String | document_assistant, knowledge_assistant, etc. |
| context_type | String | document, paper, project, etc. |
| context_id | UUID | Context entity ID |
| title | String | Conversation title |
| summary | Text | Conversation summary |
| is_active | Boolean | Active status |
| total_input_tokens | Integer | Total input tokens |
| total_output_tokens | Integer | Total output tokens |
| primary_model | String | Primary model used |
| extra_data | JSONB | Additional data |

### AIConversationMessage
Individual message in an AI conversation.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| conversation_id | UUID | Parent conversation |
| role | String | user, assistant, system |
| content | Text | Message content |
| input_tokens | Integer | Input tokens for this message |
| output_tokens | Integer | Output tokens for this message |
| model | String | Model used |
| latency_ms | Integer | Response latency |
| phi_detected | Boolean | PHI detected flag |
| phi_types | JSONB | Detected PHI types |
| extra_data | JSONB | Additional data |

### AIPendingAction
Pending AI-proposed actions awaiting approval.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | Organization context |
| user_id | UUID | Owner user |
| conversation_id | UUID | Source conversation |
| message_id | UUID | Source message |
| tool_name | String | Tool that proposed action |
| tool_input | JSONB | Tool input parameters |
| entity_type | String | task, blocker, document, comment, project |
| entity_id | UUID | Target entity ID (null for creates) |
| old_state | JSONB | State before action |
| new_state | JSONB | Proposed new state |
| description | Text | Human-readable description |
| status | String | pending, approved, rejected, executed, expired |
| approved_at | DateTime | Approval timestamp |
| rejected_at | DateTime | Rejection timestamp |
| executed_at | DateTime | Execution timestamp |
| result | JSONB | Execution result |
| error | Text | Error message |
| expires_at | DateTime | Expiration time (1 hour) |

### AIPromptTemplate
Custom prompt templates for organizations.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | Owner org (null = system) |
| template_key | String | Template identifier |
| display_name | String | Display name |
| category | String | writing, analysis, review, search, task |
| description | Text | Template description |
| system_prompt | Text | System prompt |
| user_prompt_template | Text | User prompt template |
| temperature | Float | Model temperature |
| max_tokens | Integer | Max output tokens |
| required_variables | JSONB | Required variables list |
| optional_variables | JSONB | Optional variables list |
| is_system | Boolean | System template flag |
| is_active | Boolean | Active status |
| version | Integer | Version number |
| created_by_id | UUID | Creator |
| usage_count | Integer | Usage tracking |

### AIUsageLog
Detailed log of AI usage for analytics and billing.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | Organization context |
| user_id | UUID | User who made request |
| feature_name | String | Feature used |
| template_key | String | Template used |
| conversation_id | UUID | Related conversation |
| provider | String | anthropic, azure_openai |
| model | String | Model used |
| input_tokens | Integer | Input tokens |
| output_tokens | Integer | Output tokens |
| total_tokens | Integer | Total tokens |
| estimated_cost_cents | Integer | Estimated cost |
| latency_ms | Integer | Request latency |
| request_type | String | completion, stream |
| was_cached | Boolean | Cache hit flag |
| phi_detected | Boolean | PHI detected |
| phi_policy_applied | String | block, warn, redact |
| was_successful | Boolean | Success flag |
| error_code | String | Error code |
| error_message | Text | Error details |
| context_type | String | Context entity type |
| context_id | UUID | Context entity ID |
| extra_data | JSONB | Additional data |

### AIOrganizationSettings
AI-specific settings for an organization.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | Owner org (unique) |
| features_enabled | JSONB | Feature flags (document_assistant, knowledge_summarization, etc.) |
| phi_policy | String | block, warn, redact |
| preferred_provider | String | anthropic, azure_openai |
| monthly_token_limit | Integer | Token limit (null = unlimited) |
| current_month_usage | Integer | Current usage |
| usage_reset_date | DateTime | Usage reset date |
| requests_per_minute_limit | Integer | Rate limit per minute |
| requests_per_day_limit | Integer | Rate limit per day |
| custom_settings | JSONB | Custom settings |

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
| notify_on_task_assigned | Boolean | Task assignment notifications |
| notify_on_document_update | Boolean | Document update notifications |
| notify_on_comment | Boolean | Comment notifications |

### ProjectTeam
Links projects to multiple teams for access.

| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project |
| team_id | UUID | Team |
| role | String | Default role for team members |
| added_by_id | UUID | Who added the link |

### ProjectExclusion
Blocklist for team-based access.

| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project |
| user_id | UUID | Excluded user |
| excluded_by_id | UUID | Who excluded |
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

### Invitation
Invitations to join organizations or projects.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| invitation_type | String | organization, project |
| organization_id | UUID | Target organization |
| project_id | UUID | Target project (optional) |
| email | String | Invitee email |
| invited_user_id | UUID | Existing user (if any) |
| role | String | Offered role |
| token | String | Invitation token |
| status | String | pending, accepted, declined, expired, revoked |
| personal_message | Text | Custom message |
| invited_by_id | UUID | Inviter |
| expires_at | DateTime | Expiration |
| responded_at | DateTime | Response timestamp |
| email_sent_at | DateTime | Email sent timestamp |
| email_opened_at | DateTime | Email opened timestamp |
| reminder_sent_at | DateTime | Reminder sent timestamp |

### ProjectShare
Sharing configuration for projects.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Shared project |
| user_id | UUID | User receiving access |
| role | String | viewer, editor, admin |
| granted_by_id | UUID | Granter |
| last_accessed_at | DateTime | Last access timestamp |
| access_count | Integer | Access count |
| notify_on_updates | Boolean | Update notifications |

### DocumentShare
Individual document sharing.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| document_id | UUID | Shared document |
| user_id | UUID | User receiving access |
| role | String | viewer, commenter, editor |
| granted_by_id | UUID | Granter |
| expires_at | DateTime | Optional expiration |

### ShareLink
Public or semi-public share links.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| token | String | Link token |
| resource_type | String | project, document, collection |
| resource_id | UUID | Target resource |
| access_level | String | view, comment, edit |
| requires_auth | Boolean | Authentication required |
| password_hash | String | Optional password |
| allowed_domains | String[] | Domain restrictions |
| expires_at | DateTime | Expiration |
| max_uses | Integer | Max uses |
| use_count | Integer | Current uses |
| is_active | Boolean | Active status |
| created_by_id | UUID | Creator |
| organization_id | UUID | Organization context |

### Comment
Generic comment model for discussions on any resource.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| content | Text | Comment content |
| content_html | Text | Rendered HTML |
| resource_type | String | project, task, document, idea, paper |
| resource_id | UUID | Target resource |
| parent_id | UUID | Parent for threading |
| thread_id | UUID | Root comment ID |
| author_id | UUID | Author |
| organization_id | UUID | Organization context |
| mentioned_user_ids | String[] | Mentioned users |
| is_edited | Boolean | Edit flag |
| edited_at | DateTime | Edit timestamp |
| is_deleted | Boolean | Soft delete flag |
| deleted_at | DateTime | Delete timestamp |
| is_resolved | Boolean | Resolution status |
| resolved_by_id | UUID | Resolver |
| resolved_at | DateTime | Resolution timestamp |

### Reaction
Reactions/emoji responses to comments and resources.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| resource_type | String | Target type |
| resource_id | UUID | Target ID |
| emoji | String | Emoji character |
| user_id | UUID | Reactor |

### CommentRead
Tracks which comments a user has read.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| comment_type | String | task, document, review, generic |
| comment_id | UUID | Comment ID |
| user_id | UUID | Reader |
| read_at | DateTime | Read timestamp |

### TaskAssignment
Multi-assignee task assignments.

| Field | Type | Description |
|-------|------|-------------|
| task_id | UUID | Task |
| user_id | UUID | Assigned user |
| assigned_by_id | UUID | Assigner |
| role | String | assignee, lead, reviewer, observer |
| status | String | assigned, accepted, in_progress, completed |
| due_date | Date | Individual deadline override |
| notes | Text | Assignment notes |
| completed_at | DateTime | Completion timestamp |

## Knowledge Management Models

### Paper
Research paper in the knowledge library.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| doi | String | DOI identifier |
| pmid | String | PubMed ID |
| arxiv_id | String | arXiv ID |
| title | String | Paper title |
| authors | String[] | Author list |
| journal | String | Journal name |
| publication_date | Date | Publication date |
| publication_year | Integer | Publication year |
| abstract | Text | Paper abstract |
| keywords | String[] | Keywords |
| pdf_url | String | PDF URL |
| pdf_file_id | UUID | Uploaded PDF reference |
| ai_summary | Text | AI-generated summary |
| ai_key_findings | String[] | AI key findings |
| ai_methodology | Text | AI methodology summary |
| ai_processed_at | DateTime | AI processing timestamp |
| notes | Text | User notes |
| organization_id | UUID | Owner organization |
| added_by_id | UUID | Who added |
| read_status | String | unread, reading, read |
| read_at | DateTime | Read timestamp |
| rating | Integer | User rating (1-5) |
| tags | String[] | Organization tags |
| citation_count | Integer | Citation count |
| bibtex | Text | BibTeX citation |
| search_vector | TSVECTOR | Full-text search |
| external_metadata | JSONB | External source metadata |

### Collection
Collection of papers for organization.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Collection name |
| description | Text | Collection description |
| is_smart | Boolean | Smart collection flag |
| filter_criteria | JSONB | Smart filter criteria |
| color | String | Hex color |
| icon | String | Icon name |
| organization_id | UUID | Owner organization |
| created_by_id | UUID | Creator |
| visibility | String | private, team, organization |

### CollectionPaper
Many-to-many between collections and papers.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| collection_id | UUID | Collection |
| paper_id | UUID | Paper |
| position | Integer | Order in collection |
| added_by_id | UUID | Who added |

### PaperHighlight
Highlight or annotation on a paper.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| paper_id | UUID | Parent paper |
| user_id | UUID | Highlighter |
| highlighted_text | Text | Highlighted text |
| note | Text | Annotation note |
| position_data | JSONB | PDF position (page, coords) |
| color | String | Highlight color |
| tags | String[] | Highlight tags |

### PaperLink
Links between papers and other entities.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| paper_id | UUID | Paper |
| linked_entity_type | String | project, task, document |
| linked_entity_id | UUID | Linked entity |
| link_type | String | reference, citation, related |
| notes | Text | Link notes |
| created_by_id | UUID | Link creator |

## Journal Models

### JournalEntry
Journal entry for personal journals and project lab notebooks.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Entry title |
| content | JSONB | TipTap JSON content |
| content_text | Text | Plain text for search |
| entry_date | Date | Date of observation/event |
| scope | String | personal, project |
| user_id | UUID | Owner (for personal) |
| project_id | UUID | Parent project (for project scope) |
| organization_id | UUID | Organization context |
| created_by_id | UUID | Creator |
| last_edited_by_id | UUID | Last editor |
| tags | String[] | Tags |
| entry_type | String | observation, experiment, meeting, idea, reflection, protocol |
| word_count | Integer | Word count |
| is_archived | Boolean | Archive flag |
| is_pinned | Boolean | Pin flag |
| mood | String | Mood indicator |
| extra_data | JSONB | Additional metadata |
| search_vector | TSVECTOR | Full-text search |

### JournalEntryLink
Links between journal entries and other entities.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| journal_entry_id | UUID | Parent entry |
| linked_entity_type | String | project, task, document, paper |
| linked_entity_id | UUID | Linked entity |
| link_type | String | reference, result, follow_up, related |
| notes | Text | Link notes |
| position | Integer | Order |
| created_by_id | UUID | Link creator |

## Idea Capture Models

### Idea
Quick idea capture - the fastest path to value.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| content | Text | Idea content |
| title | String | Optional title |
| tags | String[] | Organization tags |
| status | String | captured, reviewed, converted, archived |
| converted_to_project_id | UUID | Converted project |
| converted_to_task_id | UUID | Converted task |
| converted_at | DateTime | Conversion timestamp |
| source | String | web, mobile, voice, etc. |
| ai_summary | Text | AI-generated summary |
| ai_suggested_tags | String[] | AI suggested tags |
| ai_suggested_project_id | UUID | AI suggested project |
| user_id | UUID | Owner |
| organization_id | UUID | Organization context |
| is_pinned | Boolean | Pin flag |

## Activity & Notification Models

### Activity
Activity log for tracking all user actions.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| activity_type | String | e.g., project.created, document.updated |
| action | String | created, updated, deleted, commented, etc. |
| description | Text | Human-readable description |
| target_type | String | project, document, task, paper, etc. |
| target_id | UUID | Affected entity ID |
| target_title | String | Cached title for display |
| parent_type | String | Parent entity type (if nested) |
| parent_id | UUID | Parent entity ID |
| project_id | UUID | Project context |
| organization_id | UUID | Organization context |
| actor_id | UUID | User who performed action |
| extra_data | JSONB | Additional context (old values, changes) |
| is_public | Boolean | Visible to all org members |

### Notification
User notifications for important events.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| notification_type | String | mention, assignment, comment, etc. |
| title | String | Notification title |
| message | Text | Notification body |
| activity_id | UUID | Related activity |
| target_type | String | Navigation target type |
| target_id | UUID | Navigation target ID |
| target_url | String | Direct URL |
| user_id | UUID | Recipient |
| sender_id | UUID | Sender (if applicable) |
| organization_id | UUID | Organization context |
| is_read | Boolean | Read status |
| read_at | DateTime | Read timestamp |
| is_archived | Boolean | Archive status |
| extra_data | JSONB | Additional data |

### NotificationPreference
User preferences for notification delivery.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Owner (unique) |
| email_enabled | Boolean | Email notifications enabled |
| email_frequency | String | instant, daily, weekly, never |
| in_app_enabled | Boolean | In-app notifications enabled |
| notify_mentions | Boolean | Mention notifications |
| notify_assignments | Boolean | Assignment notifications |
| notify_comments | Boolean | Comment notifications |
| notify_task_updates | Boolean | Task update notifications |
| notify_document_updates | Boolean | Document update notifications |
| notify_project_updates | Boolean | Project update notifications |
| notify_team_changes | Boolean | Team change notifications |
| quiet_hours_enabled | Boolean | Quiet hours enabled |
| quiet_hours_start | String | Start time (HH:MM) |
| quiet_hours_end | String | End time (HH:MM) |
| quiet_hours_timezone | String | Timezone |

## Recurring Tasks

### RecurringTaskRule
Rule for automatically creating recurring tasks.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String | Template task title |
| description | Text | Template description |
| task_type | String | Task type |
| priority | String | Priority |
| tags | String[] | Template tags |
| estimated_hours | Float | Time estimate |
| project_id | UUID | Target project |
| created_by_id | UUID | Creator |
| default_assignee_ids | JSONB | Default assignees |
| recurrence_type | String | daily, weekly, biweekly, monthly, quarterly, yearly, custom |
| recurrence_config | JSONB | Pattern configuration (days_of_week, day_of_month, etc.) |
| start_date | Date | Rule start |
| end_date | Date | Rule end (optional) |
| due_date_offset_days | Integer | Days after creation for due date |
| next_occurrence | Date | Next scheduled creation |
| last_created_at | DateTime | Last task creation |
| is_active | Boolean | Rule active status |
| extra_data | JSONB | Additional configuration |

## Custom Fields

### ProjectCustomField
User-defined custom fields for a project.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Project |
| name | String | Field identifier |
| display_name | String | Display label |
| description | Text | Field description |
| field_type | String | text, number, date, select, multi_select, user, checkbox, url |
| field_config | JSONB | Options, validation rules, etc. |
| applies_to | String | task, document, all |
| position | Integer | Display order |
| is_active | Boolean | Active status |
| is_required | Boolean | Required field |
| created_by_id | UUID | Creator |

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
