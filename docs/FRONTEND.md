# Frontend Architecture

## Tech Stack

| Library | Purpose | Version |
|---------|---------|---------|
| React | UI Framework | 18.x |
| TypeScript | Type Safety | 5.x |
| Vite | Build Tool | 5.x |
| TanStack Query | Server State | 5.x |
| Zustand | Client State | 4.x |
| React Router | Routing | 6.x |
| TailwindCSS | Styling | 3.x |
| TipTap | Rich Text Editor | 2.x |
| HeadlessUI | Accessible Components | 2.x |

## Project Structure

```
frontend/src/
├── components/           # React components
│   ├── ui/              # Base UI primitives
│   ├── layout/          # App layout components
│   ├── projects/        # Project-related components
│   ├── tasks/           # Task components
│   ├── documents/       # Document components
│   ├── ai/              # AI assistant components
│   ├── blockers/        # Blocker components
│   ├── reviews/         # Review workflow components
│   ├── teams/           # Team management
│   ├── calendar/        # Calendar views
│   ├── search/          # Search components
│   ├── dashboard/       # Dashboard widgets
│   ├── sharing/         # Sharing UI components
│   ├── activity/        # Activity feed components
│   ├── journals/        # Journal entry components
│   ├── knowledge/       # Knowledge base (papers)
│   ├── ideas/           # Ideas inbox components
│   ├── export/          # Export functionality
│   ├── invitations/     # Team invitations
│   ├── onboarding/      # User onboarding flow
│   ├── editor/          # TipTap rich text editor
│   └── common/          # Shared utilities
├── pages/               # Route page components
│   ├── auth/            # Login, callback
│   ├── onboarding/      # Onboarding flow
│   ├── dashboard/       # Main dashboard
│   ├── projects/        # Project list/detail
│   ├── documents/       # Document editor
│   ├── reviews/         # Review workflows
│   ├── teams/           # Team management pages
│   ├── settings/        # User/org settings
│   ├── journals/        # Journal entries
│   ├── knowledge/       # Knowledge base pages
│   ├── ideas/           # Ideas inbox
│   ├── organizations/   # Org management
│   └── join/            # Team join flow
├── stores/              # Zustand stores
│   ├── auth.ts          # Authentication state
│   ├── organization.ts  # Org/team context
│   └── theme.ts         # Theme preferences
├── hooks/               # Custom hooks
├── lib/                 # Utility libraries
│   └── api-client.ts    # Axios instance
├── types/               # TypeScript types
│   └── api.ts           # API response types
├── services/            # API service functions
└── utils/               # Helper utilities
```

## Routing

### Route Structure

```tsx
// App.tsx
<Routes>
  {/* Public routes */}
  <Route element={<AuthLayout />}>
    <Route path="/login" element={<LoginPage />} />
  </Route>

  {/* Onboarding */}
  <Route path="/onboarding" element={
    <ProtectedRoute>
      <OnboardingPage />
    </ProtectedRoute>
  } />

  {/* Protected app routes */}
  <Route element={
    <ProtectedRoute>
      <OnboardingCheck>
        <AppLayout />
      </OnboardingCheck>
    </ProtectedRoute>
  }>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/projects" element={<ProjectsPage />} />
    <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
    <Route path="/documents/:documentId" element={<DocumentEditorPage />} />
    <Route path="/reviews/:reviewId" element={<ReviewDetailPage />} />
    <Route path="/teams/:teamId" element={<TeamDetailPage />} />
    {/* ... */}
  </Route>

  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

### Route Guards

**ProtectedRoute**: Requires authentication, redirects to `/login` if not authenticated.

**OnboardingCheck**: Redirects to `/onboarding` if user hasn't completed onboarding.

## State Management

### Auth Store (Zustand)

**Location**: `src/stores/auth.ts`

**State**:
```typescript
interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
```

**Actions**:
- `login(code, redirectUri)` - Google OAuth login
- `devLogin()` - Development token login
- `logout()` - Clear auth state
- `refreshAccessToken()` - Refresh JWT
- `fetchUser()` - Load user profile

**Persistence**: Tokens stored in localStorage via Zustand persist middleware.

### Organization Store (Zustand)

**Location**: `src/stores/organization.ts`

**State**:
```typescript
interface OrganizationState {
  currentOrg: Organization | null;
  currentTeam: Team | null;
  teams: Team[];
}
```

### Server State (TanStack Query)

API data is managed via TanStack Query with hooks like:

```typescript
// Fetch projects
const { data, isLoading } = useQuery({
  queryKey: ['projects', teamId],
  queryFn: () => getProjects({ teamId }),
});

// Create task mutation
const mutation = useMutation({
  mutationFn: createTask,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  },
});
```

## API Client

**Location**: `src/lib/api-client.ts`

```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Request interceptor adds auth header
apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor handles token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await useAuthStore.getState().refreshAccessToken();
      return apiClient.request(error.config);
    }
    throw error;
  }
);
```

## Component Patterns

### UI Components

Base UI primitives in `components/ui/`:

- Button
- Input
- Select
- Modal
- Dropdown
- Toast
- Badge
- Card
- etc.

Built with HeadlessUI for accessibility and styled with TailwindCSS.

### Feature Components

Domain-specific components organized by feature:

```
components/tasks/
├── TaskCard.tsx       # Task display card
├── TaskForm.tsx       # Create/edit form
├── TaskList.tsx       # List with filters
├── TaskDetail.tsx     # Full task view
└── TaskComments.tsx   # Comments section
```

### Layout Components

**Location**: `components/layout/`

- `AppLayout.tsx` - Main app shell with sidebar
- `AuthLayout.tsx` - Auth pages layout
- `Sidebar.tsx` - Navigation sidebar
- `Header.tsx` - Top header bar

### Dashboard Components

**Location**: `components/dashboard/`

| Component | Description |
|-----------|-------------|
| `CommandCenterDashboard.tsx` | Main dashboard orchestrator |
| `WeeklyTimelineView.tsx` | 7-day Gantt timeline (wx-react-gantt) |
| `UpcomingTasksSection.tsx` | Tasks due soon list |
| `UnscheduledTasksSection.tsx` | Tasks without due dates |
| `BlockersSection.tsx` | Open blockers summary |
| `ReviewDashboardWidget.tsx` | Pending reviews widget |
| `ProjectProgressItem.tsx` | Project progress indicator |
| `TaskRowItem.tsx` | Compact task row display |
| `ScopeToggle.tsx` | Team/personal scope switcher |
| `QuickActionsDropdown.tsx` | Quick action menu |

### Knowledge Base Components

**Location**: `components/knowledge/`

- `LinkPaperToProjectModal.tsx` - Link papers to projects
- `ProjectPapersSection.tsx` - Papers linked to project

## Rich Text Editor

TipTap-based editor for documents and task descriptions.

**Location**: `components/editor/`

**Extensions**:
- StarterKit (basic formatting)
- Placeholder
- TaskList/TaskItem
- Highlight
- Collaboration (future)
- CollaborationCursor (future)

**Content Format**: TipTap JSON stored in JSONB columns.

## Document Editor

**Location**: `pages/documents/DocumentEditorPage.tsx`

**Features**:
- Real-time saving (debounced)
- Version history
- Word count tracking
- Status management
- Comment threads
- Export options

## AI Chat Interface

**Location**: `components/ai/chat-bubble/`

**Components**:
- `ChatBubble.tsx` - Floating chat button
- `ChatWindow.tsx` - Chat interface
- `Message.tsx` - Message display
- `ActionPreview.tsx` - Pending action card

**Hooks**:
- `useChatBubble.ts` - Chat state management
- `usePageContext.ts` - Current page context

## Custom Hooks

**Location**: `src/hooks/`

| Hook | Purpose |
|------|---------|
| `useChatBubble` | AI chat state and SSE handling |
| `usePageContext` | Current page context for AI |
| `useDocumentComments` | Document comment operations |
| `useCommentReads` | Track read/unread comments |
| `useEditorPreferences` | Editor settings |
| `useAutoReview` | AI auto-review functionality |
| `useAIEnabled` | Check if AI features enabled |
| `useWebSocket` | WebSocket connection management |
| `useTeams` | Team data and operations |
| `useDemoProject` | Demo project for onboarding |

### SSE Handling (AI Chat)

```typescript
const eventSource = new EventSource('/api/v1/assistant/chat');

eventSource.addEventListener('text', (e) => {
  appendMessage(JSON.parse(e.data).content);
});

eventSource.addEventListener('action_preview', (e) => {
  addPendingAction(JSON.parse(e.data));
});

eventSource.addEventListener('done', () => {
  eventSource.close();
});
```

## Forms

Forms use React Hook Form with Zod validation:

```typescript
const schema = z.object({
  title: z.string().min(1, 'Required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
});

const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { priority: 'medium' },
});
```

## Styling

### TailwindCSS

Utility-first styling with custom theme:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { ... },
        secondary: { ... },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
```

### CSS Utilities

**Location**: `src/utils/` or `src/lib/`

```typescript
// clsx + tailwind-merge for conditional classes
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Error Handling

### API Errors

```typescript
try {
  await createTask(data);
  toast.success('Task created');
} catch (error) {
  if (axios.isAxiosError(error)) {
    toast.error(error.response?.data?.detail || 'Failed to create task');
  }
}
```

### Error Boundaries

React error boundaries for catching render errors.

## Testing

### Test Setup

- Vitest for test runner
- Testing Library for component tests
- MSW for API mocking

### Test Commands

```bash
npm run test         # Run tests
npm run test:ui      # Interactive UI
npm run test:coverage # Coverage report
```

## Build & Deploy

### Development

```bash
npm run dev          # Start dev server (Vite)
```

### Production Build

```bash
npm run build        # TypeScript check + Vite build
npm run preview      # Preview production build
```

### Environment Variables

```bash
VITE_API_URL=/api/v1              # API base URL
VITE_GOOGLE_CLIENT_ID=...         # Google OAuth client ID
```

## Performance

### Code Splitting

Vite automatically code-splits routes.

### Query Caching

TanStack Query caches API responses with configurable stale times.

### Optimizations

- React.memo for expensive components
- useMemo/useCallback where beneficial
- Lazy loading for routes
- Image optimization
