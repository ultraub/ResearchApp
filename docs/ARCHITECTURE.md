# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  React 18 + TypeScript + TanStack Query + Zustand + TailwindCSS │
│                    (Vite + SWC build)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Backend API                                │
│           FastAPI + Pydantic + SQLAlchemy (async)               │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   REST API   │  │  WebSocket   │  │  Background  │          │
│  │  /api/v1/*   │  │   /ws/*      │  │    Tasks     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
         │                                       │
         ▼                                       ▼
┌─────────────────┐                   ┌─────────────────┐
│   PostgreSQL    │                   │     Redis       │
│   (Primary DB)  │                   │  (Cache/Queue)  │
└─────────────────┘                   └─────────────────┘
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │  Celery Worker  │
                                    │  (Async Tasks)  │
                                    └─────────────────┘
```

## Backend Stack

### Core Framework
- **FastAPI**: Async Python web framework with automatic OpenAPI docs
- **SQLAlchemy 2.0**: Async ORM with type hints
- **Pydantic 2.0**: Data validation and settings management
- **Alembic**: Database migrations

### Data Layer
- **PostgreSQL 15**: Primary database with JSONB support
- **Redis 7**: Caching, session storage, Celery broker
- **Celery**: Distributed task queue for background jobs

### AI Integration
- **Multi-provider**: Anthropic Claude, Azure OpenAI, Google Gemini
- **Tool Calling**: Query and action tools for AI assistant
- **PHI Detection**: Pattern-based sensitive data detection

### Key Backend Directories

```
backend/researchhub/
├── api/v1/              # API endpoint handlers
│   ├── auth.py          # Authentication (Google OAuth, JWT)
│   ├── projects.py      # Project CRUD
│   ├── tasks.py         # Task management
│   ├── documents.py     # Document operations
│   ├── reviews.py       # Review workflows
│   ├── assistant.py     # AI assistant chat
│   └── ...
├── models/              # SQLAlchemy ORM models
│   ├── organization.py  # Org/Team/Member models
│   ├── project.py       # Project/Task/Blocker models
│   ├── document.py      # Document/Version models
│   ├── review.py        # Review workflow models
│   └── ai.py            # AI conversation models
├── services/            # Business logic layer
│   ├── access_control.py    # Permission checking
│   ├── workflow.py          # Task workflows
│   ├── review.py            # Review processing
│   └── ...
├── ai/                  # AI subsystem
│   ├── providers/       # LLM provider implementations
│   ├── assistant/       # Assistant service with tools
│   │   ├── queries/     # Read-only query tools
│   │   └── actions/     # Write action tools
│   └── service.py       # Main AI service
├── db/                  # Database configuration
│   ├── session.py       # Async session management
│   └── base.py          # Base model class
├── middleware/          # Request middleware
└── config.py            # Settings from environment
```

## Frontend Stack

### Core Libraries
- **React 18**: UI framework with hooks
- **TypeScript**: Type-safe JavaScript
- **TanStack Query**: Server state management
- **Zustand**: Client state management
- **React Router 6**: Client-side routing

### UI/Styling
- **TailwindCSS**: Utility-first CSS
- **HeadlessUI**: Accessible component primitives
- **Heroicons/Lucide**: Icon libraries
- **TipTap**: Rich text editor
- **Framer Motion**: Animations

### Key Frontend Directories

```
frontend/src/
├── components/          # React components
│   ├── ui/              # Base UI components
│   ├── layout/          # App layout components
│   ├── projects/        # Project-related components
│   ├── tasks/           # Task-related components
│   ├── documents/       # Document components
│   ├── ai/              # AI assistant components
│   └── ...
├── pages/               # Route page components
│   ├── auth/            # Login pages
│   ├── dashboard/       # Dashboard page
│   ├── projects/        # Project pages
│   ├── documents/       # Document pages
│   └── ...
├── stores/              # Zustand state stores
│   ├── auth.ts          # Authentication state
│   └── organization.ts  # Org context state
├── hooks/               # Custom React hooks
├── lib/                 # Utility libraries
├── types/               # TypeScript type definitions
└── services/            # API service functions
```

## Data Flow

### Request Flow
1. Frontend makes API request via TanStack Query
2. Request hits FastAPI with JWT in Authorization header
3. `get_current_user` dependency validates JWT and loads user
4. Endpoint handler calls service layer
5. Service layer applies business logic and access control
6. SQLAlchemy ORM executes database operations
7. Response serialized via Pydantic and returned

### State Management
- **Server State**: TanStack Query manages API data caching
- **Client State**: Zustand stores for auth, organization context
- **Local State**: React useState for component-local state

### Background Tasks
1. API endpoint dispatches Celery task
2. Redis broker queues the task
3. Celery worker picks up and processes
4. Results stored in Redis result backend
5. Frontend can poll for task status

## Environment Configuration

### Backend Environment Variables
```bash
# Core
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=your-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# AI Providers (at least one required)
AI_PRIMARY_PROVIDER=anthropic|azure_openai|gemini
ANTHROPIC_API_KEY=your-key
GEMINI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_API_KEY=your-key

# Feature Flags
FEATURE_AI_ENABLED=true
FEATURE_GUEST_ACCESS_ENABLED=true
FEATURE_DOCUMENT_REVIEWS_ENABLED=true
```

### Frontend Environment Variables
```bash
VITE_API_URL=/api/v1
VITE_GOOGLE_CLIENT_ID=your-client-id
```

## Deployment Modes

### Development
- Docker Compose with hot-reload
- Dev token bypass for authentication
- SQLite optional for simple testing

### Production
- `docker-compose.prod.yml` configuration
- Nginx reverse proxy for frontend
- PostgreSQL with connection pooling
- Redis cluster for high availability
