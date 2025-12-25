# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy application code first (needed for install)
COPY . .

# Copy docs directory (will be copied from build context)
# The docs are passed via --build-arg or copied in workflow
COPY --chown=appuser:appuser docs/ /app/docs/

# Install Python dependencies
RUN pip install --no-cache-dir .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Default command
CMD ["uvicorn", "researchhub.main:app", "--host", "0.0.0.0", "--port", "8000"]
