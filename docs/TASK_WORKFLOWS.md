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

When work is blocked:

1. Create blocker linked to task
2. Describe the issue and impact
3. Assign someone to resolve
4. Track resolution progress
5. Link blocker to affected tasks

See [Blockers](#blockers) section for details.

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

Projects can define custom fields for tasks:

**Field Types**:
- Text: Free-form text
- Number: Numeric value
- Date: Date picker
- Select: Single choice from options
- Multi-select: Multiple choices
- User: Team member picker
- Checkbox: Yes/no
- URL: Web link

**Example**: Clinical study project might add:
- Patient ID (text)
- Visit Number (number)
- IRB Approval Status (select)

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
