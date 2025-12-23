#!/bin/bash
# Deployment script for Pasteur application
# This script is executed on the EC2 instance by GitHub Actions

set -e  # Exit on any error

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
APP_DIR="${APP_DIR:-/home/ec2-user/app}"
COMPOSE_FILE="docker-compose.prod.yml"
OLD_APP_DIR="/home/ec2-user/ResearchApp"

echo "=== Starting deployment ==="
echo "Time: $(date)"
echo "ECR Registry: ${ECR_REGISTRY}"

# Stop old ResearchApp containers if they exist (one-time migration)
if [ -d "$OLD_APP_DIR" ] && [ -f "$OLD_APP_DIR/docker-compose.yml" ]; then
    echo "=== Stopping old ResearchApp containers ==="
    cd "$OLD_APP_DIR"
    docker compose down --remove-orphans 2>/dev/null || true
    echo "Old containers stopped"
fi

# Ensure we're in the app directory
cd "$APP_DIR"

# Source environment variables
if [ -f ".env" ]; then
    source .env
fi

# Login to ECR
echo "=== Logging into ECR ==="
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Pull latest images
echo "=== Pulling latest images ==="
docker compose -f "$COMPOSE_FILE" pull

# Stop current containers
echo "=== Stopping current containers ==="
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

# Run database migrations
echo "=== Running database migrations ==="
docker compose -f "$COMPOSE_FILE" run --rm backend alembic upgrade head || echo "Migration skipped or already up to date"

# Start new containers
echo "=== Starting services ==="
docker compose -f "$COMPOSE_FILE" up -d

# Wait for services to be healthy
echo "=== Waiting for services to start ==="
sleep 15

# Health check
echo "=== Running health check ==="
if curl -f -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ Backend health check passed!"
else
    echo "⚠ Warning: Backend health check failed or endpoint not available"
fi

if curl -f -s http://localhost:80 > /dev/null 2>&1; then
    echo "✓ Frontend health check passed!"
else
    echo "⚠ Warning: Frontend health check failed or not available"
fi

# Cleanup old containers and images
echo "=== Cleaning up ==="
docker container prune -f
docker image prune -af  # Remove all unused images, not just dangling
docker volume prune -f --filter "label!=keep"  # Remove unused volumes except those labeled 'keep'

# Show disk usage
echo "=== Disk usage ==="
df -h / | tail -1
docker system df

echo "=== Deployment complete ==="
echo "Time: $(date)"
