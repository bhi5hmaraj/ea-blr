#!/bin/bash
# Build and run Sensemaker Docker image locally with Infisical SDK
# Usage: ./scripts/run-server.sh

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

# Load Infisical credentials from file or environment
INFISICAL_CREDS_FILE="$PROJECT_DIR/.infisical-creds"
if [[ -f "$INFISICAL_CREDS_FILE" ]]; then
    echo "Loading Infisical credentials..."
    source "$INFISICAL_CREDS_FILE"
fi

# Check required credentials
if [[ -z "$INFISICAL_CLIENT_ID" || -z "$INFISICAL_CLIENT_SECRET" || -z "$INFISICAL_PROJECT_ID" ]]; then
    echo "Error: Infisical credentials not configured"
    echo "Create .infisical-creds file with:"
    echo "  INFISICAL_CLIENT_ID=your-client-id"
    echo "  INFISICAL_CLIENT_SECRET=your-client-secret"
    echo "  INFISICAL_PROJECT_ID=your-project-id"
    echo "  INFISICAL_ENVIRONMENT=dev  # optional, defaults to dev"
    exit 1
fi

echo "Starting container with Infisical SDK..."

# Run container - SDK will load secrets at runtime
docker run -d \
    --name "$CONTAINER_NAME" \
    --network host \
    -e "INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}" \
    -e "INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}" \
    -e "INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}" \
    -e "INFISICAL_ENVIRONMENT=${INFISICAL_ENVIRONMENT:-dev}" \
    -e "NODE_ENV=production" \
    sensemaker:latest

echo ""
echo "Container started: $CONTAINER_NAME"
echo "App running at: http://localhost:8080"
echo ""
echo "Commands:"
echo "  docker logs -f $CONTAINER_NAME  # View logs"
echo "  docker stop $CONTAINER_NAME     # Stop container"
