# Project Overview & Workflows

## What is Pasteur?

Pasteur is a research project management system designed for academic and clinical research teams. It helps teams organize work, collaborate on documents, track progress, and get AI-powered assistance.

## Core Concepts

### Organizational Hierarchy

```
Organization
├── Teams (work groups)
│   ├── Projects (work containers)
│   │   ├── Tasks (work items)
│   │   ├── Documents (written content)
│   │   └── Blockers (issues)
```

### User Roles

**Organization Level**:
- **Admin**: Manage org settings, create teams, manage all members
- **Member**: Access org resources, view directory, join teams

**Team Level**:
- **Owner**: Full team control, can delete team
- **Lead**: Manage team members, create projects
- **Member**: Access team projects, participate in work

**Project Level**:
- **Owner**: Full project control, manage access
- **Admin**: Manage members and settings
- **Editor**: Create/edit content
- **Member**: Participate, comment, view
- **Viewer**: Read-only access

## Project Scopes

Projects have three visibility scopes:

### Personal
- Only the owner can access
- For private work and drafts
- Hidden from team views

### Team
- All team members can access by default
- Specific users can be excluded (blocklist)
- Multiple teams can be granted access

### Organization
- Team members always have access
- Optionally visible to all org members
- Org members get viewer or member role

## Project Lifecycle

```
1. CREATE     → Active status
2. WORK       → Tasks, documents, collaboration
3. COMPLETE   → Completed status (tasks done)
4. ARCHIVE    → Archived status (hidden from active views)
```

### Project Statuses
- **Active**: Ongoing work
- **On Hold**: Paused temporarily
- **Completed**: Work finished
- **Archived**: No longer active, preserved for reference

## Project Types

Projects can be categorized for workflow suggestions:

| Type | Use Case |
|------|----------|
| General | Default, flexible projects |
| Clinical Study | Clinical research with specific phases |
| Data Analysis | Data processing and analysis work |
| Literature Review | Paper reviews and synthesis |
| Lab Operations | Laboratory procedures and protocols |

## Subprojects

Projects can have subprojects (maximum depth of 2):

```
Main Project
├── Subproject A
└── Subproject B
```

Use cases:
- Breaking large projects into phases
- Organizing related work streams
- Delegating portions of work to sub-teams

## Key Workflows

### Starting a New Project

1. Navigate to Projects page
2. Click "New Project"
3. Select team and scope
4. Choose project type (optional)
5. Add initial tasks or use template
6. Invite team members if needed

### Daily Work Pattern

1. Check dashboard for items needing attention
2. View assigned tasks across projects
3. Update task status as work progresses
4. Log blockers when issues arise
5. Collaborate on documents

### Onboarding New Team Member

1. Admin creates invite link or code
2. New user clicks link and authenticates
3. User completes onboarding profile
4. User is added to team with member role
5. User can now access team projects

### Project Handoff

1. Document current status in project description
2. Assign remaining tasks to new owner
3. Update project members as needed
4. Transfer project admin role if applicable
5. Archive completed portions

## Dashboard Views

### Attention Summary

The dashboard highlights items needing attention:

- **Overdue Tasks**: Past due date
- **Upcoming Deadlines**: Due within 7 days
- **Open Blockers**: Unresolved blocking issues
- **Pending Reviews**: Reviews awaiting action
- **Unread Comments**: New discussion activity

### My Tasks

View all tasks assigned to you:
- Filter by project, status, priority
- Sort by due date, updated date
- Quick status updates
- Jump to task details

### Recent Activity

Feed of recent changes:
- Task completions
- Document updates
- New comments
- Team changes

## Search

Global search finds content across:
- Projects (name, description)
- Tasks (title, description)
- Documents (title, content)
- Blockers (title, description)

Results are filtered by your access permissions.

## Ideas Inbox

Personal idea capture system:

1. Quickly capture thoughts and ideas
2. Ideas are private by default
3. Convert ideas to tasks when ready
4. Assign to projects as appropriate
5. Delete or archive when done

## Journal

Personal daily logging:

- Daily entries with rich text
- Link entries to projects/tasks
- Private by default
- Useful for:
  - Research notes
  - Meeting summaries
  - Daily reflections
  - Progress tracking

## Integrations

### AI Assistant

- Context-aware chat interface
- Query projects, tasks, documents
- Get suggestions and summaries
- Propose actions (create tasks, etc.)
- Actions require approval before execution

### Knowledge Base

- Store and organize research papers
- Create collections
- Highlight and annotate
- Link papers to projects

### Export Options

- Export project data as PDF/CSV
- Document export with formatting
- Report generation
