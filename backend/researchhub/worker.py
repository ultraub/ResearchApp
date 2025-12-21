"""Celery worker configuration."""

from celery import Celery

from researchhub.config import get_settings

settings = get_settings()

# Create Celery app
celery_app = Celery(
    "researchhub",
    broker=settings.celery_broker_url,
    backend=settings.redis_url,
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes
    task_soft_time_limit=240,  # 4 minutes
)

# Auto-discover tasks from researchhub.tasks module
celery_app.autodiscover_tasks(["researchhub"])
