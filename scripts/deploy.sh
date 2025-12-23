#!/bin/bash
# Deployment script for Pasteur application
# This script is executed on the EC2 instance by GitHub Actions

set -e  # Exit on any error

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
APP_DIR="${APP_DIR:-/app}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=== Starting deployment ==="
echo "Time: $(date)"
echo "ECR Registry: ${ECR_REGISTRY}"

# Ensure we're in the app directory
cd "$APP_DIR"

# Login to ECR
echo "=== Logging into ECR ==="
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Pull latest images
echo "=== Pulling latest images ==="
docker compose -f "$COMPOSE_FILE" pull

# Run database migrations (if backend has them)
echo "=== Running database migrations ==="
docker compose -f "$COMPOSE_FILE" run --rm backend alembic upgrade head || echo "Migration skipped or already up to date"

# Stop old containers and start new ones
echo "=== Restarting services ==="
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Wait for services to be healthy
echo "=== Waiting for services to start ==="
sleep 10

# Health check
echo "=== Running health check ==="
if curl -f -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "Backend health check passed!"
else
    echo "Warning: Backend health check failed or endpoint not available"
fi

if curl -f -s http://localhost:80 > /dev/null 2>&1; then
    echo "Frontend health check passed!"
else
    echo "Warning: Frontend health check failed or not available"
fi

# Cleanup old images
echo "=== Cleaning up old images ==="
docker image prune -f

echo "=== Deployment complete ==="
echo "Time: $(date)"
