# Sensemaker

Impact listings ingestion + curation with provenance tracking.

**Live:** https://sensemaker-u2lkftxw3a-el.a.run.app

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  React Admin    │────▶│  Express API    │────▶│   PostgreSQL    │
│  (Vite + MUI)   │     │  (Node.js 22)   │     │   (Prisma ORM)  │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   LiteLLM       │
                        │  (LLM Proxy)    │
                        └─────────────────┘
```

- **Frontend**: React Admin with Material UI
- **Backend**: Express.js API server
- **Database**: PostgreSQL via Prisma ORM
- **LLM**: LiteLLM proxy for extraction
- **Deployment**: Google Cloud Run
- **Secrets**: Infisical SDK

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up local database
echo 'DATABASE_URL="postgresql://postgres@localhost:5432/postgres?schema=sensemaker"' > .env
pnpm db:migrate

# Start dev server
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api

## Data Model

### Core Entities

**Observation** - Raw evidence (text, HTML, PDF, image)
- Processing state: PENDING → DONE/FAILED
- Tracks creation and processing actors

**Listing** - Published identity with stable `canonicalKey`
- Points to one `selectedRevision` (current published version)
- Types: JOB, NEWS

**Revision** - LLM-extracted structured data
- Status: PENDING → APPROVED/REJECTED
- Links back to source observation

### Key Design Decisions

1. **Append-only**: Observations and revisions are never deleted
2. **One-to-many**: One observation can generate multiple listings
3. **Retry logic**: 3 attempts with exponential backoff
4. **Audit trail**: All mutations record actor ID

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/observations` | List observations |
| POST | `/api/observations` | Create observation |
| POST | `/api/observations/:id/process` | Trigger LLM extraction |
| GET | `/api/revisions` | List revisions |
| POST | `/api/revisions/:id/approve` | Approve revision |
| POST | `/api/revisions/:id/reject` | Reject revision |
| GET | `/api/listings` | List listings |
| GET | `/api/listings/:id` | Get listing detail |

## Project Structure

```
sensemaker/
├── docs/
│   ├── infrastructure.md      # Deployment & infra guide
│   ├── uber_design_doc.md     # Full design document
│   └── adr/                   # Architecture decisions
├── prisma/
│   └── schema.prisma          # Database schema
├── scripts/
│   ├── run-server.sh          # Local Docker runner
│   └── migrate.ts             # Migration with Infisical
├── src/
│   ├── bootstrap.ts           # Entry point (loads secrets)
│   ├── server.ts              # Express server
│   ├── server/
│   │   ├── deps.ts            # Dependency injection
│   │   ├── secrets.ts         # Infisical SDK
│   │   └── services/          # Business logic
│   ├── client/                # React Admin UI
│   └── lib/
│       ├── schema.ts          # Zod schemas
│       └── kernel/            # LLM extraction
├── Dockerfile                 # Multi-stage build
├── cloudbuild.yaml            # CI/CD pipeline
└── package.json
```

## Development

### Prerequisites

- Node.js 20-22
- pnpm 9+
- PostgreSQL 14+
- Docker (for production testing)

### Commands

```bash
pnpm dev              # Start dev server (frontend + backend)
pnpm build            # Build for production
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Prisma Studio
pnpm type-check       # TypeScript check
pnpm lint             # ESLint
```

### Testing Production Build Locally

```bash
# Create Infisical credentials
cat > .infisical-creds << 'EOF'
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=dev
EOF

# Build and run Docker container
./scripts/run-server.sh
```

## Deployment

Deployed to Google Cloud Run via Cloud Build.

```bash
# Deploy
gcloud builds submit --config=cloudbuild.yaml
```

The pipeline:
1. Builds Docker image
2. Pushes to Artifact Registry
3. Runs database migrations
4. Deploys to Cloud Run
5. Smoke tests the deployment

See [docs/infrastructure.md](./docs/infrastructure.md) for:
- One-time GCP setup
- Secret management
- Troubleshooting
- Making changes

## Important Caveats

### Prisma + Runtime Secrets

Prisma validates `DATABASE_URL` at import time. We solve this with a bootstrap pattern:

```
bootstrap.ts → loadSecretsFromInfisical() → import('./server.js')
```

**Don't** import Prisma or database code at the top level of bootstrap.ts.

### Docker on Linux

Containers need `--network host` to access localhost PostgreSQL:

```bash
docker run --network host sensemaker:latest
```

The `run-server.sh` script handles this automatically.

### ESM Module Resolution

Node.js ESM requires `.js` extensions in imports, but TypeScript doesn't add them. We use esbuild to bundle the server, which resolves all imports.

```json
"build:server": "esbuild src/bootstrap.ts --bundle --platform=node --format=esm --outfile=dist/index.js --packages=external"
```

### Cloud Run Public Access

After first deploy, you must explicitly enable public access:

```bash
gcloud run services add-iam-policy-binding sensemaker \
  --region=asia-south1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

### Secret Rotation

Secrets are loaded at container startup. To rotate secrets:
1. Update in Infisical
2. Restart Cloud Run service (or wait for new deployment)

## Architecture Decision Records

- [ADR-001](./docs/adr/001-manual-processing-mvp.md): Manual processing (no background workers)
- [ADR-002](./docs/adr/002-manual-deduplication.md): Manual deduplication strategy
- [ADR-003](./docs/adr/003-llm-retry-and-error-handling.md): 3-retry policy with exponential backoff
- [ADR-004](./docs/adr/004-kernel-based-one-to-many-mapping.md): One observation → many listings
- [ADR-005](./docs/adr/005-clerk-authentication.md): Clerk authentication

## License

Private / Proprietary
