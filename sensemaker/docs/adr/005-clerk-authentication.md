# ADR-005: Authentication with Clerk

## Status
Accepted

## Context
The admin interface needs authentication to control who can:
- Create observations
- Process observations (trigger LLM extraction)
- Approve/reject revisions
- Publish listings

The public read API will eventually need rate limiting and possibly API keys, but MVP focuses on admin access control.

We evaluated:

1. **No auth**: Rely on Vercel password protection or private deployment
2. **Roll our own**: Passport.js + session management + user table
3. **NextAuth.js**: Self-hosted, flexible, but requires session management
4. **Clerk**: Managed auth with React/Next.js SDKs, includes user management UI
5. **Auth0**: Enterprise-focused, heavier integration

## Decision
Use **Clerk** for authentication:

- **Admin UI**: Clerk React SDK for Next.js/React-admin
- **API**: Clerk middleware for Express routes (verify JWT)
- **User model**: Clerk manages users, we store `userId` references in Prisma

## Consequences

### Positive
- **Zero auth boilerplate**: No password hashing, session management, email verification
- **Built-in UI**: Sign-in, sign-up, user profile components
- **Fast integration**: `@clerk/nextjs` and `@clerk/express` SDKs
- **User management**: Admin dashboard for managing operators (no custom UI needed)
- **Audit trail**: `Observation.createdBy`, `Revision.approvedBy` store Clerk user IDs

### Negative
- **Vendor lock-in**: Migration away from Clerk requires rebuilding auth
- **Cost**: Free tier limited (10k MAU); paid plans start at $25/mo
- **Clerk-specific patterns**: Must learn Clerk SDK conventions
- **Overkill for MVP**: Could have started with Vercel password protection

### Mitigation
- Keep auth boundary thin: Only store `userId: string` in Prisma, no Clerk-specific data
- Abstract behind auth interface if we need to migrate later:
  ```typescript
  interface AuthProvider {
    getCurrentUser(): Promise<User>;
    verifyToken(token: string): Promise<User>;
  }
  ```

## Implementation

### Schema updates
```prisma
model Observation {
  // ... existing fields
  createdBy    String?  // Clerk user ID
  processedBy  String?  // Who triggered processing
}

model Revision {
  // ... existing fields
  approvedBy   String?  // Who approved this revision
  approvedAt   DateTime?
}
```

### Admin UI (Next.js + React-admin)
```typescript
// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

// app/admin/page.tsx
import { auth } from '@clerk/nextjs/server';

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return <ReactAdmin dataProvider={...} />;
}
```

### API (Express on Vercel)
```typescript
// api/middleware/auth.ts
import { clerkMiddleware } from '@clerk/express';

export const requireAuth = clerkMiddleware();

// api/observations/process.ts
import { requireAuth } from '../middleware/auth';

app.post('/api/observations/:id/process', requireAuth, async (req, res) => {
  const userId = req.auth.userId; // Clerk injects this

  await processObservation(req.params.id, userId);

  res.json({ success: true });
});
```

### Authorization rules (MVP)
- **Any authenticated user** can:
  - Create observations
  - Process observations
  - Approve/reject revisions

**Post-MVP**: Add roles (operator, reviewer, admin) using Clerk Organizations or custom roles in Prisma.

## Related
- Schema: Add `createdBy`, `processedBy`, `approvedBy` fields
- Admin UI: Clerk sign-in gate before React-admin
- API: Clerk middleware on all `/api/*` routes
