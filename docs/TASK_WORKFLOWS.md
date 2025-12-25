# Task Management Workflows

## Task Lifecycle

```
idea → todo → in_progress → in_review → done
```

### Status Descriptions

| Status | Meaning | Typical Actions |
|--------|---------|-----------------|
| **idea** | Proposed work, not yet committed | Discuss, vote, refine scope |
| **todo** | Committed but not started | Assign, set due date, prioritize |
| **in_progress** | Active work happening | Update progress, log blockers |
| **in_review** | Work complete, needs review | Review work, provide feedback |
| **done** | Fully complete | Archive, celebrate |

## Task Properties

### Required
- **Title**: Brief description of the work
- **Project**: Container for the task

### Optional
- **Description**: Rich text details (TipTap format)
- **Assignee**: Primary person responsible
- **Due Date**: Target completion date
- **Priority**: low, medium, high, urgent
- **Tags**: Categorization labels
- **Task Type**: general, paper_review, data_analysis, writing, meeting

## Priority Levels

| Priority | Use When | Expected Response Time |
|----------|----------|----------------------|
| **Low** | Nice to have, no deadline | When convenient |
| **Medium** | Standard work | Within normal workflow |
| **High** | Important with deadline | Prioritize over medium |
| **Urgent** | Critical, blocking others | Immediate attention |

## Task Types

Task types help organize work and suggest relevant workflows:

| Type | Use Case | Common Actions |
|------|----------|----------------|
| **general** | Default, flexible | Standard task flow |
| **paper_review** | Reviewing papers | Link papers, add notes |
| **data_analysis** | Data processing | Attach datasets, results |
| **writing** | Document creation | Link to document |
| **meeting** | Meeting preparation | Add agenda, notes |

## Common Workflows

### Standard Task Flow

1. **Create Task**
   - Set title and description
   - Assign to team member
   - Set priority and due date

2. **Work on Task**
   - Assignee moves to in_progress
   - Updates description with progress
   - Logs any blockers

3. **Complete Task**
   - Move to done when finished
   - Or move to in_review if review needed

### Task with Review

1. Create task and link to document
2. Work on document content
3. Move task to in_review
4. Create review request for document
5. Reviewers provide feedback
6. Address feedback
7. Review approved → task done

### Subtask Pattern

For complex tasks, break into subtasks:

```
Main Task: Prepare manuscript
├── Subtask: Write introduction
├── Subtask: Create figures
├── Subtask: Write methods
└── Subtask: Compile references
```

Parent task automatically tracks subtask progress.

### Recurring Tasks

For regular work (weekly reports, monthly reviews):

1. Create recurring task rule
2. Configure frequency: daily, weekly, biweekly, monthly, etc.
3. Set due date offset (e.g., 7 days after creation)
4. Tasks auto-created on schedule
5. Assign default assignees

**Recurrence Types**:
- Daily
- Weekly (specific days)
- Biweekly
- Monthly (specific day of month)
- Quarterly
- Yearly
- Custom pattern

## Assignments

### Single vs Multiple Assignees

**Single Assignee** (primary):
- One person responsible
- Clear accountability
- Simple status tracking

**Multiple Assignees** (TaskAssignment):
- Several people contribute
- Each has individual status
- Roles: assignee, lead, reviewer, observer

### Assignment Roles

| Role | Responsibility |
|------|---------------|
| **Assignee** | Do the work |
| **Lead** | Coordinate and ensure completion |
| **Reviewer** | Review and approve work |
| **Observer** | Monitor progress, no action required |

### Delegation

1. Task owner assigns to team member
2. Assignee can delegate portions via subtasks
3. Original assignee remains accountable

## Comments & Discussion

### Comment Types
- General discussion
- Questions for clarification
- Status updates
- Decision records

### Best Practices
- Use @mentions to notify specific people
- Keep comments focused on the task
- Document decisions, not just discussions
- Use reactions for quick acknowledgments

## Blockers

Blockers represent issues that prevent progress on tasks or projects. They're first-class entities with their own lifecycle, not just task properties.

### Blocker Structure

| Field | Type | Description |
|-------|------|-------------|
| title | string | Brief description of the blocking issue |
| description | TipTap JSON | Detailed explanation (rich text) |
| status | string | open, in_progress, resolved, wont_fix |
| priority | string | low, medium, high, urgent |
| blocker_type | string | Type of blocker (see below) |
| impact_level | string | low, medium, high, critical |
| assignee_id | UUID | Person responsible for resolving |
| resolution_type | string | How it was resolved (when done) |
| resolution_notes | text | Explanation of resolution |

### Blocker Types

| Type | Use When |
|------|----------|
| **general** | Default, unspecified blocker |
| **external_dependency** | Waiting on external party/vendor |
| **resource** | Lack of people, equipment, or budget |
| **technical** | Technical issue or limitation |
| **approval** | Waiting for sign-off or decision |

### Blocker Lifecycle

```
open → in_progress → resolved
                   → wont_fix
```

### Resolution Types

| Resolution | Meaning |
|------------|---------|
| **resolved** | Issue fixed, work can proceed |
| **wont_fix** | Accepted as-is, workaround in place |
| **deferred** | Postponed to later phase |
| **duplicate** | Same as another blocker |

### BlockerLink (Linking to Tasks/Projects)

One blocker can block multiple tasks or projects via `BlockerLink`:

| Field | Description |
|-------|-------------|
| blocker_id | The blocking issue |
| blocked_entity_type | "task" or "project" |
| blocked_entity_id | ID of blocked entity |
| notes | Why this entity is blocked |

### Blocker Workflow

1. **Identify Block**
   - Create blocker with title, description
   - Set type, priority, and impact level
   - Assign owner to resolve

2. **Link to Affected Work**
   - Connect blocker to blocked tasks/projects
   - Tasks appear as "blocked" in views
   - Blocked count shows on project dashboard

3. **Work on Resolution**
   - Move to in_progress when actively working
   - Update description with progress notes
   - Escalate if impact level increases

4. **Resolve**
   - Set resolution_type
   - Add resolution_notes explaining fix
   - Move to resolved
   - Linked tasks auto-unblock

### Impact on Task Views

- Blocked tasks show blocker indicator
- Dashboard shows "Open Blockers" count
- Filter tasks by "has active blocker"
- Blocker list shows all affected entities

## Document Links

Tasks can link to documents:

| Link Type | Use Case |
|-----------|----------|
| **Reference** | Background material |
| **Attachment** | Supporting files |
| **Deliverable** | Output of the task |
| **Input** | Required for task |
| **Output** | Produced by task |

Mark documents as "requires review" for review workflow integration.

## Custom Fields

Projects can define custom fields to capture domain-specific data on tasks.

### ProjectCustomField Model

| Field | Type | Description |
|-------|------|-------------|
| project_id | UUID | Project owning this field |
| name | string | Internal field name (unique per project) |
| display_name | string | User-visible label |
| description | text | Help text for users |
| field_type | string | Type of field (see below) |
| field_config | JSONB | Type-specific configuration |
| applies_to | string[] | Entity types: ["task"] (extensible) |
| is_required | boolean | Whether field is mandatory |
| sort_order | int | Display order in forms |
| is_active | boolean | Whether field is enabled |

### Field Types

| Type | field_config Options | Example |
|------|---------------------|---------|
| **text** | `max_length`, `placeholder` | Patient ID |
| **number** | `min`, `max`, `precision` | Visit Number |
| **date** | `min_date`, `max_date` | Study Start Date |
| **select** | `options: [{value, label}]` | IRB Status |
| **multi_select** | `options: [{value, label}]` | Lab Tests Ordered |
| **user** | `allow_multiple` | Lab Technician |
| **checkbox** | (none) | Consent Obtained |
| **url** | `placeholder` | Protocol Link |

### field_config Examples

**Select Field**:
```json
{
  "options": [
    {"value": "pending", "label": "Pending Review"},
    {"value": "approved", "label": "Approved"},
    {"value": "rejected", "label": "Rejected"}
  ]
}
```

**Number Field**:
```json
{
  "min": 0,
  "max": 100,
  "precision": 2
}
```

### TaskCustomFieldValue Model

Stores the actual values for tasks:

| Field | Type | Description |
|-------|------|-------------|
| task_id | UUID | Task with this value |
| field_id | UUID | Custom field definition |
| value | JSONB | Field value (type varies) |

### Value Storage Format

Values stored as JSONB to support all types:

| Field Type | Value Format |
|------------|--------------|
| text | `{"v": "string value"}` |
| number | `{"v": 42.5}` |
| date | `{"v": "2024-01-15"}` |
| select | `{"v": "option_value"}` |
| multi_select | `{"v": ["opt1", "opt2"]}` |
| user | `{"v": "user-uuid"}` |
| checkbox | `{"v": true}` |
| url | `{"v": "https://..."}` |

### Custom Field Workflow

1. **Define Fields** (Project Admin)
   - Go to Project Settings → Custom Fields
   - Add field with name, type, options
   - Set whether required
   - Arrange display order

2. **Use Fields** (Team Members)
   - Custom fields appear on task create/edit forms
   - Fill in values as needed
   - Values saved automatically

3. **Filter & Search**
   - Filter tasks by custom field values
   - Group by select field values
   - Sort by number/date fields

### Use Case Examples

**Clinical Study Project**:
- Patient ID (text, required)
- Visit Number (number)
- Consent Status (select: pending, obtained, declined)
- Lab Tests (multi_select: CBC, CMP, UA)
- Principal Investigator (user)

**Software Project**:
- Sprint Number (number)
- Component (select: frontend, backend, api, infra)
- Story Points (number, precision: 0)
- Reviewed By (user)

## Ideas to Tasks

Convert personal ideas to project tasks:

1. Capture idea in Ideas Inbox
2. Refine idea with notes
3. Click "Convert to Task"
4. Select target project
5. Set task properties
6. Original idea archived

## Task Views

### List View
- All tasks in table format
- Sort by any column
- Filter by status, assignee, priority

### Board View (Kanban)
- Tasks organized by status columns
- Drag and drop to change status
- Visual work-in-progress limits

### Calendar View
- Tasks plotted by due date
- See upcoming deadlines
- Visual timeline

## Filters

Common task filters:

| Filter | Options |
|--------|---------|
| Status | idea, todo, in_progress, in_review, done |
| Priority | low, medium, high, urgent |
| Assignee | Any team member, Unassigned |
| Due Date | Overdue, Today, This Week, This Month |
| Project | Any accessible project |
| Tags | Any defined tag |

## Notifications

Users receive notifications for:

- Task assigned to them
- Mentioned in comment
- Task they created is updated
- Due date approaching
- Task completed

Configure notification preferences in settings.

## Bulk Actions

On task list views:
- Select multiple tasks
- Change status for all
- Assign to same person
- Set same priority
- Add same tags
- Move to project
- Delete all
