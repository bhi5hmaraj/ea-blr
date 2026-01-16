# Sensemaker MVP

Impact listings ingestion + curation with provenance tracking.

## Architecture

This is a Next.js application with:
- **Admin UI**: React-admin for curation interface
- **API**: Next.js API routes for CRUD + processing
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: Clerk for user management
- **Processing**: Manual LLM extraction with retry logic

See [docs/uber_design_doc.md](./docs/uber_design_doc.md) for full design rationale.

## Architecture Decision Records

- [ADR-001](./docs/adr/001-manual-processing-mvp.md): Manual processing (no background workers)
- [ADR-002](./docs/adr/002-manual-deduplication.md): Manual deduplication strategy
- [ADR-003](./docs/adr/003-llm-retry-and-error-handling.md): 3-retry policy with exponential backoff
- [ADR-004](./docs/adr/004-kernel-based-one-to-many-mapping.md): One observation → many listings via kernel
- [ADR-005](./docs/adr/005-clerk-authentication.md): Clerk authentication

## Data Model

### Core Entities

**Observation** (evidence)
- Raw content (text, HTML, PDF, image) from manual input or scraping
- Processing state: PENDING → DONE/FAILED (with retry tracking)
- Audit: createdBy, processedBy (Clerk user IDs)

**Listing** (published identity)
- Stable identity via `canonicalKey` (normalized URL or hash)
- Points to one `selectedRevision` (current published version)
- Types: JOB, NEWS

**Revision** (structured interpretation)
- LLM-extracted + optional human edits
- Status: PENDING → APPROVED/REJECTED
- Schema versioning for payload evolution
- Provenance link back to source observation

### Key Design Decisions

1. **Append-only**: Observations and revisions are never deleted, only status changes
2. **Pointer-based selection**: Listing.selectedRevisionId determines what's published
3. **One-to-many mapping**: One observation can generate multiple listings (via kernel processor)
4. **Retry logic**: 3 attempts with exponential backoff, tracked via processingAttempts
5. **Auth tracking**: All mutations record Clerk userId for audit trail

## Getting Started

### Prerequisites

- Node.js 18+ (or 20+)
- pnpm 8+
- PostgreSQL 14+
- Clerk account (free tier)
- OpenAI API key

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your values:
# - DATABASE_URL
# - Clerk keys (from clerk.com)
# - OPENAI_API_KEY

# Generate Prisma client
pnpm db:generate

# Create database and run migrations
pnpm db:migrate

# Start dev server
pnpm dev
```

Visit `http://localhost:3000` for the admin interface.

### Database Commands

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Create and apply migration
pnpm db:migrate

# Push schema without migration (dev only)
pnpm db:push

# Open Prisma Studio (database GUI)
pnpm db:studio
```

## Project Structure

```
sensemaker/
├── docs/
│   ├── adr/                    # Architecture decision records
│   └── uber_design_doc.md      # Full design document
├── prisma/
│   └── schema.prisma           # Database schema
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── admin/              # React-admin UI
│   │   ├── api/                # API routes
│   │   └── sign-in/            # Auth pages
│   ├── lib/
│   │   ├── prisma.ts           # Prisma client singleton
│   │   ├── kernel/             # LLM extraction kernels
│   │   └── auth.ts             # Clerk helpers
│   └── types/                  # Shared TypeScript types
├── package.json
└── tsconfig.json
```

## API Endpoints (Planned)

### Admin API
- `POST /api/observations` - Create observation
- `POST /api/observations/:id/process` - Trigger LLM extraction
- `GET /api/observations` - List observations (with filters)
- `GET /api/revisions` - List revisions
- `POST /api/revisions/:id/approve` - Approve revision (sets as selected)
- `GET /api/listings` - List listings
- `GET /api/listings/:id` - Get listing with current revision

### Public API (Future)
- `GET /api/public/listings` - Public listings feed
- `GET /api/public/listings/:id` - Public listing detail

## Development Workflow

1. **Create observation** (manual paste/upload or scrape)
2. **Process observation** (click "Process" button → triggers LLM)
3. **Review revisions** (compare extracted vs current)
4. **Approve revision** (marks as selected for listing)
5. **Publish** (listing now shows approved revision)

## Deployment

Designed for Vercel deployment:

```bash
# Install Vercel CLI
pnpm add -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Run migrations on production DB
```

See [ea-blr-wva.18](../.beads) for detailed deployment checklist.

## License

Private / Proprietary
