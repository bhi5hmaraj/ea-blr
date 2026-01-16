# ADR-006: Content Storage Abstraction

**Status**: Proposed
**Date**: 2026-01-16

## Context

Currently, observations store raw content references in `rawBlobRef` as either:
- Full URLs (Vercel Blob): `https://blob.vercel-storage.com/...`
- Relative paths (Local storage): `/storage/2026-01-16/observations/...`

This leaks storage implementation details to higher layers:

```typescript
// prep.ts currently does this - BAD
async function fetchBlobText(url: string): Promise<string> {
  if (url.startsWith('/storage/')) {
    // Handle local storage
    return readFile(filePath, 'utf-8');
  }
  // Handle remote URLs
  return fetch(url).then(r => r.text());
}
```

**Problems:**
1. Higher layers (prep.ts, observationService) need to understand storage internals
2. Switching storage providers requires changes in multiple places
3. No clear contract for what `rawBlobRef` contains
4. Testing requires mocking storage specifics

## Options Considered

### Option A: Storage Adapter with `getContent()` Method

Add a read method to the existing `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  // Existing
  putText(params): Promise<StoredObject>;
  handleUpload(request): Promise<Response>;

  // New
  getContent(ref: string): Promise<string | Buffer>;
}
```

**Pros:**
- Minimal change to existing code
- Single place for read logic
- Higher layers just call `storage.getContent(ref)`

**Cons:**
- Need to pass storage instance around or use singleton
- Ref format still varies by provider (URL vs path)

### Option B: Content Reference Object (Structured Ref)

Store a structured object instead of a string:

```typescript
interface ContentRef {
  provider: 'vercel-blob' | 'local' | 's3';
  path: string;       // Canonical path within provider
  url?: string;       // Public URL if available
  contentType?: string;
}

// In Prisma schema
model Observation {
  rawBlobRef  Json?   // ContentRef object
}
```

**Pros:**
- Explicit about storage location
- Self-describing, easy to migrate
- Can store both path and public URL

**Cons:**
- Schema change (JSON instead of String)
- More complex serialization
- Overkill for MVP?

### Option C: URI Scheme Pattern

Use URI schemes to encode provider:

```
local:///2026-01-16/observations/file.md
blob://bucket/path/file.md
s3://bucket/key
```

```typescript
function resolveContentUri(uri: string): Promise<string> {
  const [scheme, path] = parseUri(uri);
  const resolver = resolvers[scheme];
  return resolver.read(path);
}
```

**Pros:**
- Single string (no schema change)
- Extensible to new providers
- Clear, standard pattern

**Cons:**
- Need URI parsing everywhere or a resolver layer
- Non-standard schemes may confuse tooling

### Option D: Observation Domain Entity

Create a domain object that encapsulates content loading:

```typescript
class ObservationEntity {
  constructor(
    private data: Observation,
    private storage: StorageAdapter
  ) {}

  async getContent(): Promise<string> {
    if (this.data.rawText) return this.data.rawText;
    if (this.data.rawBlobRef) {
      return this.storage.getContent(this.data.rawBlobRef);
    }
    throw new Error('No content available');
  }

  get id() { return this.data.id; }
  get sourceRef() { return this.data.sourceRef; }
  // ... other accessors
}
```

**Pros:**
- Clean OO design
- Content loading is observation's responsibility
- Easy to test (inject mock storage)
- Can add caching, lazy loading

**Cons:**
- More code/abstraction
- Need to wrap Prisma objects
- May be overkill for current scale

### Option E: Hybrid - StorageAdapter with Content Resolution

Enhance StorageAdapter to handle its own refs:

```typescript
interface StorageAdapter {
  putText(params): Promise<StoredObject>;
  handleUpload(request): Promise<Response>;

  // Storage knows how to read its own refs
  read(ref: string): Promise<string>;

  // Check if this adapter owns a ref
  canRead(ref: string): boolean;
}

// Usage in prep.ts
const storage = getStorage();
const content = await storage.read(observation.rawBlobRef);
```

The storage adapter checks if the ref belongs to it (e.g., local storage checks for `/storage/` prefix, Vercel checks for blob URLs).

**Pros:**
- Minimal changes
- Each adapter handles its own refs
- Higher layers don't care about ref format

**Cons:**
- Need to handle "wrong adapter" case
- Refs must be self-identifying

## Recommendation

**Option E (Hybrid)** for MVP, with path to **Option D** later:

1. Add `read(ref: string)` to `StorageAdapter`
2. Each storage implementation knows how to read its own refs
3. Higher layers call `storage.read(ref)` without caring about internals
4. Later, if we need richer behavior, wrap in domain entities

This gives us:
- Clean abstraction NOW with minimal changes
- Clear migration path to richer domain model
- No schema changes required

## Implementation

```typescript
// types.ts
interface StorageAdapter {
  handleUpload(request: Request): Promise<Response>;
  putText(params: { content: string; pathnamePrefix: string; contentType: string }): Promise<StoredObject>;
  read(ref: string): Promise<string>;  // NEW
}

// localFileStorage.ts
class LocalFileStorage implements StorageAdapter {
  async read(ref: string): Promise<string> {
    if (!ref.startsWith('/storage/')) {
      throw new Error(`Invalid local storage ref: ${ref}`);
    }
    const relativePath = ref.replace('/storage/', '');
    const filePath = path.join(LOCAL_STORAGE_DIR, relativePath);
    return readFile(filePath, 'utf-8');
  }
}

// vercelBlob.ts
class VercelBlobStorage implements StorageAdapter {
  async read(ref: string): Promise<string> {
    const response = await fetch(ref);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    return response.text();
  }
}

// prep.ts - CLEAN
async function prepareObservationContent(observation: Observation) {
  const storage = getStorage();

  if (observation.rawBlobRef) {
    const markdown = await storage.read(observation.rawBlobRef);
    return { markdown, rawFormat: 'MARKDOWN' };
  }
  // ...
}
```

## Consequences

**Positive:**
- Higher layers no longer need to know storage internals
- Easy to add new storage providers
- Testing is simpler (mock storage.read)
- Single responsibility: storage handles storage

**Negative:**
- Slight overhead of abstraction
- Need to ensure all storage adapters implement read()

**Migration:**
- Add `read()` to existing adapters
- Update prep.ts to use storage.read()
- Remove storage-specific logic from higher layers

## Related

- ADR-004: Kernel-Based Mapping (observation processing)
- [Storage implementation](../../src/server/storage/)
