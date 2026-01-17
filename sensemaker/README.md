# Sensemaker

Impact listings ingestion + curation with provenance tracking.

**Live:** https://sensemaker-u2lkftxw3a-el.a.run.app

## Vision: OAEA-SenseMaker

This project is the foundation for **OAEA-SenseMaker** - an open-source, democratized data sense-making platform. Part of the Open Application Ecosystem for AI (OAEA), it aims to provide Palantir-like capabilities to individuals, MSMEs, and communities.

### The Problem: Gradual Disempowerment Risk (GDR)

As AI capabilities advance, there's a risk of "gradual disempowerment" - a slow erosion of human agency where:
- Advanced analytics become exclusive to well-resourced elites
- Economic and political power concentrates in AI-capable entities
- The majority loses bargaining power and relevance

### The Solution: D^4 Acceleration

OAEA-SenseMaker embodies **D^4** principles:
- **Defensive**: Tools that protect human agency
- **Democratic**: Accessible to everyone, not just elites
- **Decentralized**: Self-hostable, no central dependency
- **Differential**: Benefits the less powerful more than the already powerful

### Roadmap to Full Vision

| Phase | Focus | Status |
|-------|-------|--------|
| **MVP** | Impact listings curation | Current |
| **Phase 1** | Personal knowledge assistant (chat-based) | Planned |
| **Phase 2** | Citizen data journalism tools | Planned |
| **Phase 3** | MSME market intelligence | Planned |
| **Phase 4** | Full knowledge graph + orchestration (Kestra) | Planned |

**Current MVP** handles the core data pipeline: ingest observations (text, HTML, PDF) → LLM extraction → curated listings with provenance. This proves the fundamental pattern of democratized sense-making.

**Future capabilities** will add:
- Chat interface for natural language queries
- Knowledge graph for entity linking across sources
- Workflow orchestration for automated data pipelines
- Visualization tools for link analysis and geospatial data

**Further Reading:**
- [Vision synthesis](docs/vision-synthesis.md) - Synthesized vision, MVP scope, and next steps
- [Design doc](docs/uber_design_doc.md) - Full design document
- [OAEA-SenseMaker Technical Blueprint](https://docs.google.com/document/d/1HBppladcaNpgLzoH8lur3fBPEcGFAxUZtnbpamgC6U8/edit?tab=t.0) - Feasibility study and architecture
- [NOTHG: D^4 Acceleration & OAEA Analysis](https://docs.google.com/document/d/1r3KzmOF0z3ZmHbzaj1t3PD9cUhrO8LimJhbIRBNGjg0/edit?tab=t.f9ju76kjacqh#heading=h.sf6035tyaraj) - Full analysis of OAEA vs AI-driven disempowerment

---

## Current Implementation

### Architecture

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
│   ├── vision-synthesis.md    # Vision + MVP scope synthesis
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

### Branch-based Development (GitHub Actions)

We use a staging → production workflow:

```bash
# Develop on feature branches from staging
git checkout staging
git checkout -b feature/my-feature

# Push and create PR to staging
git push -u origin feature/my-feature
# → Triggers PR checks (lint, type-check, build)

# After merge to staging
# → Auto-deploys to sensemaker-staging.run.app

# Create PR from staging to main
# → After merge, auto-deploys to production
```

**Environments:**
- `staging` branch → `sensemaker-staging` (asia-south1)
- `main` branch → `sensemaker` (asia-south1)

See [docs/github-actions-setup.md](./docs/github-actions-setup.md) for complete setup.

### Manual Deployment (Alternative)

```bash
# Deploy to production manually
gcloud builds submit --config=cloudbuild.yaml
```

See [docs/infrastructure.md](./docs/infrastructure.md) for:
- GitHub Actions setup
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

## Contributing

This is part of the OAEA ecosystem. Contributions that align with the D^4 principles are welcome:
- Democratizing access to data tools
- Decentralizing control
- Defending human agency

## License

AGPL-3.0 - Ensuring the tool remains open and benefits everyone.
