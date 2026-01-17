#!/bin/bash
# Build and run Sensemaker Docker image locally with Infisical secrets
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

# Check for Infisical token
INFISICAL_TOKEN_FILE="$PROJECT_DIR/.infisical-token"
if [[ -z "$INFISICAL_TOKEN" ]]; then
    if [[ -f "$INFISICAL_TOKEN_FILE" ]]; then
        export INFISICAL_TOKEN=$(cat "$INFISICAL_TOKEN_FILE")
    else
        echo "Error: INFISICAL_TOKEN not set and .infisical-token file not found"
        echo "Set INFISICAL_TOKEN env var or create .infisical-token file"
        exit 1
    fi
fi

echo "Fetching secrets from Infisical..."

# Fetch secrets to a temp env file
ENV_FILE=$(mktemp)
infisical secrets --silent -o dotenv > "$ENV_FILE"

echo "Starting container..."

# Run container with env file
docker run -d \
    --name "$CONTAINER_NAME" \
    --network host \
    --env-file "$ENV_FILE" \
    -e "NODE_ENV=production" \
    sensemaker:latest

# Clean up temp file
rm -f "$ENV_FILE"

echo ""
echo "Container started: $CONTAINER_NAME"
echo "App running at: http://localhost:8080"
echo ""
echo "Commands:"
echo "  docker logs -f $CONTAINER_NAME  # View logs"
echo "  docker stop $CONTAINER_NAME     # Stop container"
