#!/bin/bash
# Build and run Sensemaker Docker image locally
# Usage: ./scripts/build-local.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Get git short SHA for tag
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
IMAGE_NAME="sensemaker:${TAG}"
CONTAINER_NAME="sensemaker-local"

echo "Building ${IMAGE_NAME}..."
docker build -t "$IMAGE_NAME" -t "sensemaker:latest" .

echo ""
echo "Build complete: ${IMAGE_NAME}"

# Stop existing container if running
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo "Stopping existing container..."
    docker stop "$CONTAINER_NAME" >/dev/null
fi
if docker ps -aq -f name="$CONTAINER_NAME" | grep -q .; then
    docker rm "$CONTAINER_NAME" >/dev/null
fi

# Load environment variables from .env.local
ENV_FILE="$PROJECT_DIR/.env.local"
if [[ -f "$ENV_FILE" ]]; then
    echo "Loading environment from .env.local..."
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "Warning: .env.local not found, using defaults"
fi

# Run the container
echo "Starting container..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --network host \
    -e "DATABASE_URL=${DATABASE_URL:-postgresql://postgres@localhost:5432/postgres?schema=sensemaker}" \
    -e "LITELLM_API_KEY=${LITELLM_API_KEY:-}" \
    -e "LITELLM_BASE_URL=${LITELLM_BASE_URL:-}" \
    -e "LLM_MODEL=${LLM_MODEL:-gemini-2.5-flash-lite}" \
    -e "NODE_ENV=production" \
    sensemaker:latest

echo ""
echo "Container started: $CONTAINER_NAME"
echo "App running at: http://localhost:8080"
echo ""
echo "Commands:"
echo "  docker logs -f $CONTAINER_NAME  # View logs"
echo "  docker stop $CONTAINER_NAME     # Stop container"
