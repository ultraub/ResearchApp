# Pasteur (ResearchHub)

A research project management system for academic and clinical research teams. Built with FastAPI (Python) backend and React/TypeScript frontend.

## Overview

Pasteur helps research teams manage projects, tasks, documents, and knowledge across organizations. It includes AI-powered features for document review, task assistance, and intelligent workflows.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Development Setup

1. **Clone and configure environment:**
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. **Start with Docker Compose:**
```bash
docker-compose up -d
```

3. **Access the application:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/v1
- API Docs: http://localhost:8000/api/v1/docs

### Dev Token (Local Development)
For local development without OAuth, use the dev token:
- Token: `dev-token-for-testing`
- This creates a dev user with full access automatically

## Architecture

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + Redis + Celery
- **Frontend**: React 18 + TypeScript + TanStack Query + Zustand + TailwindCSS
- **AI**: Multi-provider support (Anthropic Claude, Azure OpenAI, Google Gemini)

## Documentation

See the `/docs` directory for detailed documentation:
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Data Models](docs/DATA_MODELS.md)
- [API Reference](docs/API.md)
- [Authentication & Permissions](docs/AUTH.md)
- [AI Assistant](docs/AI_ASSISTANT.md)
- [Frontend Guide](docs/FRONTEND.md)

## Project Structure

```
/
├── backend/                    # FastAPI Python backend
│   ├── researchhub/           # Main application package
│   │   ├── api/v1/            # API endpoints
│   │   ├── models/            # SQLAlchemy models
│   │   ├── services/          # Business logic
│   │   ├── ai/                # AI providers and assistant
│   │   └── db/                # Database configuration
│   ├── alembic/               # Database migrations
│   └── tests/                 # Backend tests
├── frontend/                   # React TypeScript frontend
│   └── src/
│       ├── components/        # React components
│       ├── pages/             # Page components
│       ├── stores/            # Zustand state stores
│       ├── hooks/             # Custom React hooks
│       └── types/             # TypeScript types
├── docs/                      # Project documentation
└── infrastructure/            # Deployment configs
```

## Key Features

- **Project Management**: Hierarchical projects with subprojects, tasks, and blockers
- **Document Collaboration**: TipTap-based rich text editor with versioning
- **Review Workflows**: Document reviews with multi-reviewer assignments
- **Knowledge Base**: Paper collections with highlights and links
- **AI Assistant**: Context-aware chat with query and action tools
- **Team Collaboration**: Organizations, teams, and role-based access control

## License

MIT
