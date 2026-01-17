#!/bin/bash

# Install git hooks for sensemaker development
# Run this script once after cloning the repo

set -e

HOOKS_DIR="../.git/hooks"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "📋 Installing git hooks..."

# Create pre-push hook
cat > "$REPO_ROOT/.git/hooks/pre-push" << 'HOOK_EOF'
#!/bin/bash

# Git pre-push hook for sensemaker
# Runs build checks and optionally deploys to GCP

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Pre-push checks starting...${NC}"

# Get the branch being pushed
current_branch=$(git rev-parse --abbrev-ref HEAD)
remote=$1
url=$2

# Read stdin to get the refs being pushed
while read local_ref local_sha remote_ref remote_sha
do
    if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
        # Branch deletion, skip checks
        continue
    fi

    # Extract branch name from ref
    if [[ $remote_ref =~ refs/heads/(.+) ]]; then
        branch="${BASH_REMATCH[1]}"
    else
        branch="$current_branch"
    fi

    echo -e "${YELLOW}📋 Checking branch: $branch${NC}"

    # Change to sensemaker directory
    cd sensemaker

    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    pnpm install --frozen-lockfile > /dev/null 2>&1 || {
        echo -e "${RED}❌ pnpm install failed${NC}"
        exit 1
    }

    echo -e "${BLUE}🔧 Generating Prisma client...${NC}"
    pnpm db:generate > /dev/null 2>&1 || {
        echo -e "${RED}❌ Prisma generate failed${NC}"
        exit 1
    }

    echo -e "${BLUE}🔍 Running type check...${NC}"
    pnpm type-check || {
        echo -e "${RED}❌ Type check failed${NC}"
        exit 1
    }

    echo -e "${BLUE}🧹 Running linter...${NC}"
    pnpm lint || {
        echo -e "${RED}❌ Lint check failed${NC}"
        exit 1
    }

    echo -e "${BLUE}🏗️  Running build...${NC}"
    DATABASE_URL="postgresql://mock@localhost/mock" \
    INFISICAL_CLIENT_ID="mock" \
    INFISICAL_CLIENT_SECRET="mock" \
    INFISICAL_PROJECT_ID="mock" \
    pnpm build || {
        echo -e "${RED}❌ Build failed${NC}"
        exit 1
    }

    echo -e "${GREEN}✅ All checks passed!${NC}"

    # If pushing to main or staging, ask about deployment
    if [[ "$branch" == "main" ]]; then
        echo -e "${YELLOW}⚠️  You are pushing to ${BLUE}main${YELLOW} branch${NC}"
        echo -e "${BLUE}Would you like to deploy to production? (y/N)${NC}"
        read -r -t 10 response || response="n"

        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}🚀 Triggering Cloud Build deployment...${NC}"
            cd ..
            gcloud builds submit --config=sensemaker/cloudbuild.yaml || {
                echo -e "${RED}❌ Deployment failed${NC}"
                echo -e "${YELLOW}⚠️  Push will continue, but deployment failed${NC}"
            }
            echo -e "${GREEN}✅ Deployment triggered${NC}"
        else
            echo -e "${YELLOW}⏭️  Skipping deployment${NC}"
            echo -e "${BLUE}💡 To deploy later, run: gcloud builds submit --config=sensemaker/cloudbuild.yaml${NC}"
        fi
    elif [[ "$branch" == "staging" ]]; then
        echo -e "${YELLOW}📝 Note: Pushing to ${BLUE}staging${YELLOW} branch${NC}"
        echo -e "${BLUE}💡 If GitHub Actions is set up, this will auto-deploy to staging${NC}"
    fi

    # Return to original directory
    cd ..
done

echo -e "${GREEN}✅ Pre-push checks complete!${NC}"

exit 0
HOOK_EOF

# Make hook executable
chmod +x "$REPO_ROOT/.git/hooks/pre-push"

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will:"
echo "  • Run type checks, linting, and build tests"
echo "  • For main branch: optionally deploy to production"
echo "  • For staging branch: remind about GitHub Actions deployment"
echo ""
echo "To skip the hook on a push, use: git push --no-verify"
