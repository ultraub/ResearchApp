# Feature Specifications

## Ideas Inbox

Quick capture system for thoughts and ideas.

### Purpose
- Capture ideas anywhere, anytime
- Low friction entry point
- Process ideas into actionable work later

### Idea Properties

| Property | Description |
|----------|-------------|
| **content** | Main idea text (required) |
| **title** | Optional short title |
| **tags** | Categorization labels |
| **source** | Where captured (web, mobile, voice) |
| **is_pinned** | Quick access flag |

### Idea Statuses

| Status | Meaning |
|--------|---------|
| **captured** | Initial capture, unprocessed |
| **reviewed** | Looked at, still in inbox |
| **converted** | Turned into task or project |
| **archived** | No longer relevant |

### AI Features
- `ai_summary`: AI-generated summary
- `ai_suggested_tags`: Suggested categorization
- `ai_suggested_project_id`: Suggested project fit

### Conversion Workflow

1. Capture idea quickly
2. Review and refine later
3. Convert to:
   - **Task**: Actionable work item
   - **Project**: Larger initiative
4. Original idea archived with link

---

## Journal

Personal and project-level logging system.

### Journal Scopes

| Scope | Purpose | Ownership |
|-------|---------|-----------|
| **personal** | Private reflection, notes | User-owned |
| **project** | Shared lab notebook | Project-owned |

### Entry Properties

| Property | Description |
|----------|-------------|
| **title** | Optional entry title |
| **content** | TipTap rich text |
| **entry_date** | Date of observation (not created_at) |
| **entry_type** | Categorization |
| **mood** | Optional mood indicator |
| **tags** | Searchable labels |
| **word_count** | Auto-tracked |

### Entry Types

| Type | Use Case |
|------|----------|
| **observation** | General notes, observations |
| **experiment** | Experimental procedures, results |
| **meeting** | Meeting notes, action items |
| **idea** | Brainstorming, concepts |
| **reflection** | Personal reflection |
| **protocol** | Documented procedures |

### Entry Links
Connect journal entries to:
- Projects
- Tasks
- Documents
- Papers

Link types: reference, result, follow_up, related

### Search
Full-text search via PostgreSQL tsvector.

---

## Blockers

Track and resolve blocking issues.

### Purpose
- Identify what's blocking work
- Assign resolution responsibility
- Track resolution progress
- Link to affected work items

### Blocker Properties

| Property | Description |
|----------|-------------|
| **title** | Short description |
| **description** | TipTap rich text details |
| **status** | Current state |
| **priority** | Urgency level |
| **blocker_type** | Category |
| **impact_level** | Severity of impact |
| **assignee** | Person resolving |
| **due_date** | Target resolution date |

### Blocker Statuses

| Status | Meaning |
|--------|---------|
| **open** | Active, unresolved |
| **in_progress** | Being worked on |
| **resolved** | Successfully resolved |
| **wont_fix** | Won't be addressed |

### Blocker Types

| Type | Description |
|------|-------------|
| **general** | Default, unspecified |
| **external_dependency** | Waiting on external party |
| **resource** | Missing resources (people, equipment) |
| **technical** | Technical challenge |
| **approval** | Waiting for approval |

### Impact Levels

| Level | Description |
|-------|-------------|
| **low** | Minor inconvenience |
| **medium** | Moderate delay |
| **high** | Significant impact |
| **critical** | Blocking all progress |

### Resolution Types
When resolved: resolved, wont_fix, deferred, duplicate

### Blocker Links
Link blockers to what they block:
- Tasks
- Projects

Allows tracking "what is this blocking?"

---

## Knowledge Base

Research paper management system.

### Papers

| Property | Description |
|----------|-------------|
| **doi, pmid, arxiv_id** | External identifiers |
| **title** | Paper title |
| **authors** | Author list |
| **journal** | Publication venue |
| **publication_date** | When published |
| **abstract** | Paper abstract |
| **keywords** | Subject keywords |
| **pdf_url** | Link to PDF |

### AI Features
- `ai_summary`: AI-generated summary
- `ai_key_findings`: Extracted key findings
- `ai_methodology`: Methodology summary
- Automatic processing on import

### Reading Tracking

| Status | Meaning |
|--------|---------|
| **unread** | Not yet read |
| **reading** | Currently reading |
| **read** | Finished reading |

Additional: rating (1-5 stars), notes, read_at timestamp

### Collections

Organize papers into collections:
- **Standard Collections**: Manual curation
- **Smart Collections**: Filter-based, auto-updating

Collection properties:
- Name, description
- Color, icon for visual distinction
- Visibility: private, team, organization
- Position ordering

### Paper Highlights

Annotate papers with highlights:
- Selected text
- Notes
- Position in PDF (page, coordinates)
- Color coding
- Tags

### Paper Links
Connect papers to work:
- Link to projects, tasks, documents
- Link types: reference, citation, related
- Notes on relevance

---

## Dashboard

Central hub for attention management.

### Attention Summary

Items needing attention:
- **Overdue Tasks**: Past due date
- **Upcoming Deadlines**: Due within 7 days
- **Open Blockers**: Unresolved blocking issues
- **Pending Reviews**: Reviews awaiting action
- **Unread Comments**: New discussion activity

### My Tasks View
- All tasks assigned to you
- Filter by project, status, priority
- Sort by due date, updated
- Quick status updates

### Recent Activity
Feed of team activity:
- Task completions
- Document updates
- New comments
- Team changes

---

## Gantt Chart / Timeline View

Visual timeline for task planning and tracking.

### Weekly Timeline View

Dashboard component showing a 7-day Gantt-style timeline:

**Library**: wx-react-gantt (SVAR React Gantt)

**Features**:
- 7-day rolling view from current date
- Tasks plotted by due date
- Color-coded by priority:
  - Urgent: Red
  - High: Orange
  - Medium: Blue
  - Low: Gray
- Click task bar to navigate to task detail
- Progress bars for completed tasks
- Blocked tasks visually indicated

### Task Visualization

| Property | Display |
|----------|---------|
| Due Date | Bar position on timeline |
| Priority | Bar color |
| Status | Progress fill (0% or 100%) |
| Blocked | Visual indicator |

### Timeline Scales

- Day view (default): Shows individual days
- Each bar spans 1 day width

### Navigation

- Click any task bar to open task detail
- Hover for task info tooltip
- Scrollable for tasks outside visible range

### Data Requirements

Tasks must have `due_date` to appear on timeline. Tasks without due dates are filtered out.

---

## Sharing System

Granular access control beyond team membership.

### Sharing Models

| Model | Purpose |
|-------|---------|
| **ProjectShare** | Share project with specific user |
| **DocumentShare** | Share document outside project context |
| **ShareLink** | Public/semi-public link access |

### Share Link Features

- Unique 64-character token
- Access levels: view, comment, edit
- Security options:
  - Public access
  - Require authentication
  - Password protection
  - Domain restriction (email domains)
- Usage controls:
  - Expiration date
  - Maximum use count
  - Active/inactive toggle

### Sharing Workflow

**Direct User Share**:
1. Select resource (project/document)
2. Enter user email
3. Set permission level
4. Optional: Add message, set expiration
5. User notified

**Link Sharing**:
1. Create share link for resource
2. Configure security options
3. Copy link
4. Share externally
5. Monitor usage

See [Team Collaboration Guide](./TEAM_COLLABORATION.md#sharing-system) for complete details.

---

## Search

Global search across all content with intelligent hybrid ranking.

### Search Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **hybrid** (default) | Combines keyword + semantic search | Best overall results |
| **keyword** | Traditional text matching | Exact phrase searches |
| **semantic** | Vector similarity search | Conceptual/meaning-based searches |

### Searchable Entities
- Projects (name, description)
- Tasks (title, description) - *supports semantic search*
- Documents (title, content) - *supports semantic search*
- Blockers (title, description)
- Papers (title, abstract, keywords) - *supports semantic search*
- Journal entries (title, content) - *supports semantic search*

### Hybrid Search Scoring

Results are ranked using a weighted scoring system:

| Match Type | Points |
|------------|--------|
| Exact title match | 100 |
| Partial title match | 50 |
| Content match | 20 |
| Semantic similarity | 0-40 (based on cosine similarity) |

### Search Features
- **Hybrid ranking**: Combines keyword matches with semantic understanding
- **Semantic embeddings**: Uses OpenAI text-embedding-3-small for meaning-based search
- **Full-text search**: PostgreSQL tsvector for fast keyword matching
- **Access filtering**: Results filtered by user permissions
- **Type filtering**: Search specific entity types
- **Deduplication**: Smart merging of keyword and semantic results

---

## Notifications

Keep users informed of relevant activity.

### Notification Triggers
- Task assigned to you
- Mentioned in comment
- Resource you created was updated
- Due date approaching
- Task completed
- Review requested
- Document updated

### Delivery Channels
- In-app notifications
- Email notifications (configurable)

### Preferences
Per-user configuration:
- Enable/disable by type
- Email frequency
- Do not disturb settings

---

## Templates

Reusable document structures.

### Template Types
- **System Templates**: Built-in, available to all
- **Organization Templates**: Custom for org

### Template Properties
- Name and description
- Template type (e.g., protocol, report)
- Content (TipTap JSON)
- Usage count tracking
- Active/inactive status

### Usage Flow
1. Create new document
2. Select "From Template"
3. Template content pre-fills
4. Customize as needed

---

## AI Assistant

Conversational interface for system interaction.

### Capabilities

**Query Tools** (immediate execution):
- Get projects, tasks, documents
- Search content
- Get attention summary
- Get team members

**Action Tools** (require approval):
- Create/update tasks
- Complete tasks
- Create/resolve blockers
- Add comments

### Context Awareness
- Receives page context
- Provides relevant suggestions
- Defaults actions to current context

### Approval Flow
1. User makes request
2. AI proposes action
3. Preview shown to user
4. User approves or rejects
5. If approved, action executes

### AI Review Integration
- Auto-review documents
- Generate suggestions
- AI comments distinguish from human
- Accept/dismiss workflow

---

## Recurring Tasks

Automate repeated work.

### Recurrence Patterns
- Daily
- Weekly (specific days)
- Biweekly
- Monthly (specific day)
- Quarterly
- Yearly
- Custom patterns

### Recurring Task Properties
- Base task template
- Recurrence rule
- Due date offset (days after creation)
- Default assignees
- Auto-creation schedule

### Behavior
1. Rule configured on task
2. System checks for due creations
3. New task instance created
4. Inherits template properties
5. Due date calculated from offset

---

## Subprojects

Hierarchical project organization.

### Structure
```
Parent Project
├── Subproject A
└── Subproject B
```

Maximum depth: 2 levels (parent + children)

### Use Cases
- Break large projects into phases
- Organize related work streams
- Delegate portions to sub-teams

### Behavior
- Subprojects inherit parent team
- Tasks belong to specific (sub)project
- Navigation shows hierarchy
- Permissions cascade from parent

---

## Custom Fields

Extend task properties per project.

### Field Types
- **Text**: Free-form text
- **Number**: Numeric value
- **Date**: Date picker
- **Select**: Single choice from options
- **Multi-select**: Multiple choices
- **User**: Team member picker
- **Checkbox**: Yes/no
- **URL**: Web link

### Configuration
- Defined at project level
- Field name and type
- Options (for select types)
- Required or optional
- Display order

### Usage
- Appear on task forms
- Filterable in task views
- Searchable where applicable
- Stored as task metadata

---

## Comments System

Discussion across all entities.

### Comment Locations
- Tasks (TaskComment)
- Documents (DocumentComment)
- Reviews (ReviewComment)
- Generic (Comment model)

### Features

| Feature | Description |
|---------|-------------|
| **Threading** | Reply to create conversations |
| **@Mentions** | Notify specific users |
| **Reactions** | Emoji responses |
| **Resolution** | Mark as resolved |
| **Edit Tracking** | Show when edited |

### Comment Read Tracking
- Track which comments user has read
- Count unread per resource
- Filter to unread only

### Inline Comments (Documents)
- Anchor to text selection
- Position data stored
- Updates if text moves
- Thread replies supported
