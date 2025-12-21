# ResearchHub Backend

FastAPI backend for the ResearchHub research project management system.

## Features

- RESTful API with async support
- PostgreSQL database with SQLAlchemy ORM
- Azure AD authentication integration
- AI-powered research assistance (Anthropic Claude, Azure OpenAI)
- Redis caching and Celery task queue
- Comprehensive API documentation (Swagger/OpenAPI)

## Quick Start

```bash
# Install dependencies
pip install -e ".[dev]"

# Run migrations
alembic upgrade head

# Start server
uvicorn researchhub.main:app --reload
```

## Environment Variables

See `.env.example` for required configuration.

## API Documentation

- Swagger UI: http://localhost:8000/api/v1/docs
- ReDoc: http://localhost:8000/api/v1/redoc
