# Sensemaker Architecture

## Design Philosophy

**Zod is the single source of truth** for all data models, types, and validation.

Everything else derives from Zod schemas:
- TypeScript types → inferred from Zod
- API validation → Zod `.parse()`
- Prisma schema → manually kept in sync (see sync checklist below)
- Domain logic → operates on Zod types

## File Structure

```
src/
├── lib/
│   ├── schema.ts          # 🎯 SOURCE OF TRUTH: All Zod schemas
│   ├── prisma.ts          # Prisma client singleton
│   └── kernel/            # LLM extraction kernels
├── types/
│   └── index.ts           # Re-exports from schema.ts
├── app/
│   ├── api/               # API routes (Next.js)
│   └── admin/             # Admin UI (React-admin)
└── ...
```

## Schema Sync Checklist

When you modify `src/lib/schema.ts`, you MUST update `prisma/schema.prisma` to match:

### For Enum Changes
- [ ] Update `enum` definition in Prisma
- [ ] Run `pnpm db:generate` to regenerate client
- [ ] Check for type errors in code

### For Model Changes
- [ ] Update `model` fields in Prisma
- [ ] Add/remove indexes if needed
- [ ] Run `pnpm db:migrate` to create migration
- [ ] Update seed data if applicable

### For Validation Changes
- [ ] Zod validation changes don't require Prisma changes
- [ ] But check if database constraints should match (e.g., `.min(1)` → `@db.VarChar(255)`)

## Key Patterns

### 1. Validation in API Routes

```typescript
import { CreateObservationInput } from '@/types';

export async function POST(request: Request) {
  const body = await request.json();
  const input = CreateObservationInput.parse(body); // Throws if invalid

  // input is now typed and validated
}
```

### 2. Schema Versioning

Schema versions are defined in `SCHEMA_VERSIONS` constant:

```typescript
const SCHEMA_VERSIONS = {
  JOB: {
    1: JobListingV1,
    // 2: JobListingV2, // Future
  },
};
```

When adding a new version:
- Define new Zod schema (e.g., `JobListingV2`)
- Add to `SCHEMA_VERSIONS`
- Update kernel to output new version
- Old revisions remain valid (no migration needed)

### 3. Kernel Implementation

```typescript
import { Kernel, JobListingV1, RevisionPayload } from '@/types';

class JobKernelV1 implements Kernel {
  readonly name = 'job-v1';
  readonly kind = 'JOB' as const;
  readonly schemaVersion = 1;

  async process(observation: Observation): Promise<RevisionPayload[]> {
    const extracted = await llm.extract(observation.rawText);

    // Validate against schema
    const validated = JobListingV1.parse(extracted);

    return [{
      canonicalKey: generateCanonicalKey({ sourceUrl: observation.sourceRef }),
      kind: 'JOB',
      schemaVersion: 1,
      data: validated,
      title: validated.title,
      orgName: validated.organization,
      sourceUrl: observation.sourceRef,
    }];
  }
}
```

## ADR Implementation

- **ADR-001**: Manual processing → No background workers, button-triggered
- **ADR-002**: Manual dedup → `contentHash` field, no auto-checking
- **ADR-003**: Retry logic → `processingAttempts`, `isRetryableError()`
- **ADR-004**: One-to-many → Kernel returns `RevisionPayload[]`
- **ADR-005**: Clerk auth → `createdBy`, `processedBy`, `approvedBy` fields

## Testing Strategy

Since Zod is the source of truth, test at the schema level:

```typescript
import { JobListingV1 } from '@/types';

test('valid job listing', () => {
  const result = JobListingV1.safeParse({
    title: 'Software Engineer',
    organization: 'Acme Corp',
    applyUrl: 'https://acme.com/apply',
  });

  expect(result.success).toBe(true);
});

test('invalid job listing', () => {
  const result = JobListingV1.safeParse({
    title: '',
    organization: 'Acme',
    applyUrl: 'not-a-url',
  });

  expect(result.success).toBe(false);
});
```

## Why Zod First?

1. **Single source of truth**: No drift between types, validation, and docs
2. **Runtime safety**: Validation at API boundaries prevents bad data
3. **Type inference**: TypeScript types come for free
4. **Schema evolution**: Easy to version and migrate
5. **Testing**: Schemas are testable, types are not
6. **Documentation**: Schemas self-document validation rules

## Migrations

Since Prisma is still the database layer, migrations work as normal:

```bash
# After changing Prisma schema to match Zod
pnpm db:migrate

# This creates a new migration file
# Edit it if you need custom SQL (e.g., backfill data)
```

The key is: **Zod defines what's valid, Prisma defines what's stored**.
