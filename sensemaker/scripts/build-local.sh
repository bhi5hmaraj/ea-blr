#!/bin/bash
# Build Sensemaker Docker image locally
# Usage: ./scripts/build-local.sh [--no-cache]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Get git short SHA for tag
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
IMAGE_NAME="sensemaker:${TAG}"

echo "Building ${IMAGE_NAME}..."

# Check for --no-cache flag
CACHE_FLAG=""
if [[ "$1" == "--no-cache" ]]; then
    CACHE_FLAG="--no-cache"
    echo "Building without cache..."
fi

docker build $CACHE_FLAG -t "$IMAGE_NAME" -t "sensemaker:latest" .

echo ""
echo "Build complete!"
echo "  Image: ${IMAGE_NAME}"
echo "  Also tagged: sensemaker:latest"
echo ""
echo "Run locally:"
echo "  docker-compose up"
echo ""
echo "Or run directly:"
echo "  docker run --network host -e DATABASE_URL=postgresql://postgres@localhost:5432/postgres?schema=sensemaker sensemaker:latest"
