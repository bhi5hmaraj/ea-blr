# Sensemaker Infrastructure

## Overview

Sensemaker is deployed as a Docker container on Google Cloud Run. The architecture uses:
- **Runtime**: Node.js 22 with Express server
- **Database**: PostgreSQL (Neon for prod, local for dev)
- **Secrets**: Infisical SDK for runtime secret injection
- **CI/CD**: GitHub Actions (preferred) or Google Cloud Build
- **Container Registry**: Google Artifact Registry
- **Environments**: Staging (on `staging` branch) and Production (on `main` branch)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Google Cloud Platform                           │
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │ Cloud Build │───▶│ Artifact Registry │───▶│         Cloud Run           │ │
│  │   (CI/CD)   │    │    (Docker)       │    │                             │ │
│  └──────┬──────┘    └──────────────────┘    │  ┌───────────────────────┐  │ │
│         │                                    │  │     Bootstrap.ts      │  │ │
│         │ migrations                         │  │          │            │  │ │
│         ▼                                    │  │          ▼            │  │ │
│  ┌─────────────┐                            │  │  Load Infisical SDK   │  │ │
│  │   Neon DB   │◀───────────────────────────│  │          │            │  │ │
│  │ (PostgreSQL)│                            │  │          ▼            │  │ │
│  └─────────────┘                            │  │     Server.ts         │  │ │
│                                             │  │   (Express + API)     │  │ │
│  ┌─────────────┐                            │  └───────────────────────┘  │ │
│  │   Secret    │                            │              │              │ │
│  │   Manager   │────────────────────────────│──────────────┘              │ │
│  │ (Infisical  │                            │                             │ │
│  │  creds only)│                            └─────────────────────────────┘ │
│  └─────────────┘                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────┐
                            │    Infisical    │
                            │  (All Secrets)  │
                            │ DATABASE_URL,   │
                            │ LITELLM_API_KEY │
                            └─────────────────┘
```

## Secret Management Strategy

We use a two-tier secret management approach:

1. **GCP Secret Manager**: Stores only Infisical credentials (3 secrets)
   - `SENSEMAKER_INFISICAL_CLIENT_ID`
   - `SENSEMAKER_INFISICAL_CLIENT_SECRET`
   - `SENSEMAKER_INFISICAL_PROJECT_ID`

2. **Infisical**: Stores all application secrets
   - `DATABASE_URL`
   - `LITELLM_API_KEY`
   - `LITELLM_BASE_URL`
   - `CLERK_SECRET_KEY`
   - Any future secrets

**Why this approach?**
- Single source of truth for app secrets (Infisical)
- Easy to rotate secrets without redeploying
- Same secrets work across environments (dev/staging/prod)
- Infisical has better UI for secret management

## Bootstrap Pattern

Prisma validates `DATABASE_URL` at import time. To handle this with runtime secret loading:

```
Entry Point: dist/index.js (compiled from bootstrap.ts)
     │
     ▼
loadSecretsFromInfisical()  ──▶  Fetches all secrets from Infisical
     │                            and injects into process.env
     ▼
import('./server.js')       ──▶  Now Prisma can read DATABASE_URL
```

**Key files:**
- `src/bootstrap.ts` - Entry point that loads secrets first
- `src/server/secrets.ts` - Infisical SDK integration
- `src/server.ts` - Express server (imported after secrets load)

## Local Development

### Prerequisites

- Node.js 20-22
- pnpm 9+
- Docker (for production-like testing)
- PostgreSQL running locally on port 5432

### Quick Start (Development)

```bash
# Install dependencies
pnpm install

# Create .env file with local DATABASE_URL
echo 'DATABASE_URL="postgresql://postgres@localhost:5432/postgres?schema=sensemaker"' > .env

# Run migrations
pnpm db:migrate

# Start dev server (hot reload)
pnpm dev
```

Frontend: http://localhost:5173
API: http://localhost:3001/api

### Running with Docker (Production Mode)

For testing the production build locally:

```bash
# Create Infisical credentials file
cat > .infisical-creds << 'EOF'
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=dev
EOF

# Build and run
./scripts/run-server.sh
```

The script:
1. Builds Docker image tagged with git SHA
2. Loads Infisical credentials from `.infisical-creds`
3. Runs with `--network host` (Linux) to access localhost PostgreSQL
4. Container loads secrets from Infisical at startup

## Docker Build

### Multi-stage Build

```dockerfile
# Stage 1: base - Node.js 22 Alpine with pnpm
# Stage 2: deps - Install all dependencies
# Stage 3: build - Generate Prisma, build server (esbuild) + client (Vite)
# Stage 4: runner - Production image (~150MB)
```

### Build Artifacts

```
dist/
├── index.js        # Bundled server (bootstrap + server + deps)
public/
├── index.html      # Vite-built React app
├── assets/
│   ├── index-*.js
│   └── index-*.css
```

### Key Build Commands

```bash
# Full build (server + client)
pnpm build

# Server only (esbuild bundle)
pnpm build:server

# Client only (Vite)
pnpm build:client
```

## GCP Deployment

### One-time Setup

Run these commands once to set up the GCP infrastructure:

```bash
# 1. Set your project
gcloud config set project YOUR_PROJECT_ID

# 2. Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# 3. Create Artifact Registry repository
gcloud artifacts repositories create sensemaker \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Sensemaker Docker images"

# 4. Create GCP secrets for Infisical credentials
echo -n "your-infisical-client-id" | \
  gcloud secrets create SENSEMAKER_INFISICAL_CLIENT_ID --data-file=-

echo -n "your-infisical-client-secret" | \
  gcloud secrets create SENSEMAKER_INFISICAL_CLIENT_SECRET --data-file=-

echo -n "your-infisical-project-id" | \
  gcloud secrets create SENSEMAKER_INFISICAL_PROJECT_ID --data-file=-

# 5. Grant Cloud Build access to secrets
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

for secret in SENSEMAKER_INFISICAL_CLIENT_ID SENSEMAKER_INFISICAL_CLIENT_SECRET SENSEMAKER_INFISICAL_PROJECT_ID; do
  # Cloud Build service account
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

  # Cloud Run service account
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done

# 6. Enable public access (after first deploy)
gcloud run services add-iam-policy-binding sensemaker \
  --region=asia-south1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

### Deploying

```bash
# Deploy via Cloud Build (recommended)
gcloud builds submit --config=cloudbuild.yaml

# View build logs
gcloud builds log BUILD_ID

# Check service status
gcloud run services describe sensemaker --region=asia-south1
```

### GitHub Actions CI/CD (Recommended)

We use GitHub Actions for automated deployments with branch-based development:

**Branches:**
- `staging` → Deploys to `sensemaker-staging` Cloud Run service
- `main` → Deploys to `sensemaker` Cloud Run service (production)

**Workflows:**
1. **PR Checks** (`pr-checks.yml`) - Runs on PRs to `main` or `staging`
   - Type checking
   - Linting
   - Build test

2. **Deploy Staging** (`deploy-staging.yml`) - Runs on push to `staging`
   - Builds with `staging-{sha}` tags
   - Runs migrations
   - Deploys to staging environment
   - Posts deployment URL in commit comment

3. **Deploy Production** (`deploy-production.yml`) - Runs on push to `main`
   - Builds with `prod-{sha}` and `latest` tags
   - Runs migrations
   - Deploys to production environment
   - Creates GitHub release
   - Posts deployment URL in commit comment

**Setup:** See [github-actions-setup.md](./github-actions-setup.md) for complete setup instructions including:
- Workload Identity Federation configuration
- GitHub repository secrets
- Service account permissions
- Development workflow

**Development Flow:**
```bash
# Create feature branch from staging
git checkout staging
git pull
git checkout -b feature/my-feature

# Make changes, push, create PR to staging
git push -u origin feature/my-feature

# After merge to staging, test in staging environment
# Then create PR from staging to main for production
```

### Cloud Build Pipeline (Alternative)

The `cloudbuild.yaml` runs these steps:

1. **build** - Build Docker image with BuildKit
2. **push** - Push to Artifact Registry
3. **migrate** - Run Prisma migrations (loads DATABASE_URL from Infisical)
4. **deploy** - Deploy to Cloud Run
5. **smoke-test** - Verify deployment

### Infisical Environments

| Environment | Usage |
|-------------|-------|
| `dev` | Local development, localhost PostgreSQL |
| `staging` | Cloud Run staging, separate Neon database |
| `prod` | Cloud Run production, Neon PostgreSQL |

## Environment Variables

### Required in Infisical

| Secret | Description | Example |
|--------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `LITELLM_API_KEY` | LiteLLM proxy API key | `sk-...` |
| `LITELLM_BASE_URL` | LiteLLM proxy URL | `https://litellm.example.com` |

### Set by Cloud Run

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Enables production mode |
| `PORT` | `8080` | Cloud Run default |
| `INFISICAL_ENVIRONMENT` | `prod` | Which Infisical env to use |
| `INFISICAL_CLIENT_ID` | (from secret) | Machine identity |
| `INFISICAL_CLIENT_SECRET` | (from secret) | Machine identity |
| `INFISICAL_PROJECT_ID` | (from secret) | Infisical project |

## Making Changes

### Adding a New Secret

1. Add to Infisical (dev and prod environments)
2. Use in code via `process.env.YOUR_SECRET`
3. No deployment changes needed - secrets load at runtime

### Changing Database Schema

1. Edit `prisma/schema.prisma`
2. Create migration: `pnpm db:migrate`
3. Deploy - Cloud Build runs migrations automatically

### Updating Dependencies

```bash
pnpm update
pnpm build  # Test build locally
gcloud builds submit --config=cloudbuild.yaml
```

### Changing Cloud Run Config

Edit `cloudbuild.yaml` deploy step:
- Memory: `--memory=512Mi`
- CPU: `--cpu=1`
- Scaling: `--min-instances=0 --max-instances=10`

## Troubleshooting

### Local: Docker can't connect to PostgreSQL

On Linux, containers need `--network host` to access localhost:
```bash
docker run --network host sensemaker:latest
```

### Local: Prisma can't find DATABASE_URL

Ensure `.env` file exists with `DATABASE_URL` for local dev, or `.infisical-creds` for Docker.

### Cloud Build: Migration fails

Check if DATABASE_URL exists in Infisical prod environment:
```bash
# Test locally with prod env
export $(cat .infisical-creds | xargs)
INFISICAL_ENVIRONMENT=prod npx tsx scripts/migrate.ts
```

### Cloud Run: 403 Forbidden

Enable public access:
```bash
gcloud run services add-iam-policy-binding sensemaker \
  --region=asia-south1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

### Cloud Run: Secrets not loading

1. Check Secret Manager IAM:
   ```bash
   gcloud secrets get-iam-policy SENSEMAKER_INFISICAL_CLIENT_ID
   ```

2. Check Cloud Run logs:
   ```bash
   gcloud run services logs read sensemaker --region=asia-south1 --limit=50
   ```

### Checking Deployed Version

```bash
# Get service URL
gcloud run services describe sensemaker --region=asia-south1 --format="value(status.url)"

# Test API
curl https://sensemaker-xxx.a.run.app/api/observations
```

## File Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Docker build |
| `.dockerignore` | Files excluded from Docker context |
| `docker-compose.yml` | Local Docker development |
| `cloudbuild.yaml` | Cloud Build CI/CD pipeline |
| `scripts/run-server.sh` | Local Docker build & run script |
| `scripts/migrate.ts` | Migration script with Infisical |
| `src/bootstrap.ts` | Entry point (loads secrets first) |
| `src/server.ts` | Express server |
| `src/server/secrets.ts` | Infisical SDK integration |
| `.infisical-creds` | Local Infisical credentials (gitignored) |
