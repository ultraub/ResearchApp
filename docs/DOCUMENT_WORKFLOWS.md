# Document Workflows

## Document Lifecycle

```
draft → in_review → approved → published
          ↓
    changes_requested
```

### Status Descriptions

| Status | Meaning | Typical Actions |
|--------|---------|-----------------|
| **draft** | Work in progress | Edit, collaborate, save versions |
| **in_review** | Submitted for review | Reviewers add feedback |
| **approved** | Passed review | Ready for publishing |
| **published** | Final, accessible | Read-only, archived |

## Document Types

| Type | Use Case | Common Features |
|------|----------|-----------------|
| **general** | Default, flexible | Basic editing |
| **protocol** | Research procedures | Step-by-step structure |
| **report** | Analysis results | Data tables, figures |
| **manuscript** | Academic papers | Citations, formatting |
| **notes** | Quick capture | Minimal structure |

## Creating Documents

### From Project

1. Navigate to project detail page
2. Click "New Document"
3. Choose document type (optional)
4. Select template (optional)
5. Enter title and begin writing

### From Template

1. Templates provide pre-structured content
2. Org templates: Shared across organization
3. System templates: Built-in defaults
4. Fill in placeholders and customize

## Document Properties

### Basic Info
- **Title**: Document name
- **Type**: Document category
- **Tags**: Searchable labels
- **Word Count**: Auto-tracked progress

### Collaboration Settings
- **Allow Comments**: Enable/disable inline comments
- **Allow Suggestions**: Enable/disable tracked changes

### Ownership
- **Created By**: Original author
- **Last Edited By**: Most recent editor
- **Project**: Parent project container

## Rich Text Editing

The editor uses TipTap with these capabilities:

### Formatting
- Headings (H1-H6)
- Bold, italic, strikethrough
- Lists (bullet, numbered, task)
- Block quotes
- Code blocks

### Advanced
- Tables
- Images
- Links
- Highlights
- Task checkboxes

### Content Storage
Content is stored as structured JSON, enabling:
- Version comparison
- Search indexing
- Export to multiple formats

## Version History

### Auto-Versioning
- Versions created on significant saves
- Each version captures:
  - Full content snapshot
  - Timestamp
  - Who saved it
  - Change summary (optional)

### Version Operations
- **View**: See content at any version
- **Compare**: Diff between versions
- **Restore**: Revert to previous version

## Document Comments

### Comment Types

| Type | Purpose | Display |
|------|---------|---------|
| **General** | Document-wide feedback | Side panel |
| **Inline** | Specific text feedback | Anchored to selection |
| **Threaded** | Discussion chains | Reply hierarchy |

### Comment Workflow

1. **Create**: Select text or use general comment
2. **Discuss**: Reply to start thread
3. **Resolve**: Mark when addressed
4. **@Mention**: Notify specific users

### Inline Comments
When creating an inline comment:
- Selected text is captured
- Position is anchored
- Comment appears alongside content
- Updates if text moves

## Document Sharing

### Within Project
Team members with project access can:
- View documents (viewer role+)
- Edit documents (editor role+)
- Manage settings (admin role+)

### Direct Sharing (DocumentShare)
Share documents outside project context:

| Role | Permissions |
|------|-------------|
| **viewer** | Read only |
| **commenter** | Read + comment |
| **editor** | Full editing |

- Set expiration dates
- Track access counts
- Revoke anytime

### Share Links (ShareLink)
Public or semi-public access:
- Generate unique token URL
- Optional password protection
- Restrict to specific email domains
- Set max uses and expiration
- Requires auth (optional)

## Document Templates

### Template Types
- **System**: Built-in, available to all
- **Organization**: Custom for org

### Using Templates
1. Create new document
2. Select "From Template"
3. Template content pre-fills editor
4. Customize as needed

### Creating Templates
1. Create document with desired structure
2. Convert to template (admin)
3. Set template type and description
4. Make available to team

---

# Review Workflows

## Review Process Overview

```
1. Author creates/edits document
2. Author requests review (creates Review)
3. Reviewers assigned
4. Reviewers provide feedback (ReviewComments)
5. Author addresses feedback
6. Review completed with decision
7. Document status updated
```

## Review Types

| Type | Purpose | Decision Output |
|------|---------|-----------------|
| **feedback** | Get input, no formal decision | Comments only |
| **approval** | Requires explicit approval | Approved/Rejected |
| **peer_review** | Academic peer review | Reviewer recommendations |
| **editorial** | Editorial/style review | Suggestions for improvement |

## Creating a Review

### Manual Creation

1. Open document
2. Click "Request Review"
3. Set review title and description
4. Choose review type
5. Set priority and due date
6. Assign reviewers
7. Submit request

### Task Integration

Reviews can be linked to tasks:
- Set `task_id` when creating review
- `auto_transition_task`: When enabled, review completion updates task status
- Task status → in_review triggers auto-review (if configured)

## Review Statuses

| Status | Meaning | Actions |
|--------|---------|---------|
| **pending** | Review created, awaiting start | Assign reviewers |
| **in_progress** | Reviewers actively reviewing | Add comments, feedback |
| **changes_requested** | Revisions needed | Author addresses feedback |
| **approved** | All requirements met | Document can proceed |
| **completed** | Review finished | Archive/close |
| **cancelled** | Review terminated | No action needed |

## Review Assignments

### Reviewer Roles

| Role | Responsibility |
|------|----------------|
| **reviewer** | Standard reviewer |
| **primary_reviewer** | Lead reviewer, coordinates |
| **approver** | Has final approval authority |

### Assignment Statuses

| Status | Meaning |
|--------|---------|
| **pending** | Awaiting reviewer response |
| **accepted** | Reviewer has accepted |
| **declined** | Reviewer declined |
| **in_progress** | Actively reviewing |
| **completed** | Review finished |

### Reviewer Recommendations

| Recommendation | Meaning |
|----------------|---------|
| **approve** | Ready as-is |
| **reject** | Major issues, not ready |
| **revise** | Needs changes before approval |
| **abstain** | No recommendation |

## Review Comments

### Comment Types

| Type | Use Case |
|------|----------|
| **general** | Overall feedback |
| **inline** | Anchored to document text |
| **suggestion** | Proposed change |
| **question** | Clarification needed |
| **issue** | Problem identified |
| **gap_identified** | Missing content (AI) |
| **clarity_needed** | Unclear writing (AI) |
| **methodology_concern** | Research method issue (AI) |
| **consistency_issue** | Internal inconsistency (AI) |

### Comment Severity

| Severity | Priority | Response Required |
|----------|----------|-------------------|
| **critical** | Highest | Must address |
| **major** | High | Should address |
| **minor** | Medium | Consider addressing |
| **suggestion** | Low | Optional |

### Resolution Workflow

1. Reviewer creates comment
2. Author addresses issue
3. Author marks as resolved (or reviewer)
4. Resolution notes added (optional)
5. Comment shows resolution status

## AI-Assisted Reviews

### AI Comment Sources

| Source | Meaning |
|--------|---------|
| **human** | Created by person |
| **ai_suggestion** | AI-generated, pending action |
| **ai_accepted** | AI suggestion accepted |
| **ai_dismissed** | AI suggestion dismissed |

### AI Comment Features
- `ai_confidence`: Confidence score (0.0-1.0)
- `question_for_author`: AI's question prompting thought
- `why_this_matters`: AI's explanation of importance

### Auto-Review Configuration (Per Org)

| Setting | Description |
|---------|-------------|
| `on_document_create` | Trigger on new documents |
| `on_document_update` | Trigger on document edits |
| `on_task_submit_review` | Trigger when task → in_review |
| `default_focus_areas` | What AI focuses on |
| `min_document_length` | Minimum chars to trigger |
| `review_cooldown_hours` | Prevent repeated reviews |
| `max_suggestions_per_review` | Limit AI suggestions |

### AI Review Triggers
1. Document created (if `on_document_create`)
2. Document updated (if `on_document_update`)
3. Task status → in_review (if `on_task_submit_review`)

### Handling AI Suggestions

1. Review AI suggestions in comment panel
2. For each suggestion:
   - **Accept**: Mark as valid, address in document
   - **Dismiss**: Mark as not applicable
3. Add resolution notes if needed
4. Bulk actions available for efficiency

## Review Statistics

The system tracks:
- Total comments vs resolved
- Total reviewers vs completed
- Completion percentage
- Time to completion

## Common Workflows

### Quick Feedback Request

1. Author: Create review with type "feedback"
2. Author: Add 1-2 reviewers
3. Reviewers: Add comments inline
4. Author: Address or acknowledge
5. Author: Mark review complete

### Formal Approval Process

1. Author: Create review with type "approval"
2. Author: Set due date
3. Author: Assign approver(s)
4. Reviewers: Complete thorough review
5. Each reviewer: Submit recommendation
6. Final decision: Approved/Rejected
7. Document: Status updated based on decision

### Task-Linked Review

1. Task assignee: Complete task work
2. Assignee: Move task to "in_review"
3. System: Auto-creates review (if configured)
4. AI: Generates initial suggestions (if configured)
5. Reviewers: Add human feedback
6. Author: Address all comments
7. Review approved → Task can complete

### Revision Cycle

1. Initial review submitted
2. Reviewers request changes
3. Review status: changes_requested
4. Author addresses feedback
5. Author re-requests review
6. New review round begins
7. Cycle until approved

## Review Best Practices

### For Authors
- Write clear review requests
- Set realistic due dates
- Choose appropriate reviewers
- Respond to comments promptly
- Explain how feedback was addressed

### For Reviewers
- Accept/decline promptly
- Provide constructive feedback
- Use severity levels appropriately
- Ask clarifying questions
- Submit recommendation on time

### For Teams
- Establish review turnaround norms
- Use templates for common review types
- Configure AI assistance thoughtfully
- Track review metrics for improvement
