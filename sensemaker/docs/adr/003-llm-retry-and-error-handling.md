# ADR-003: LLM Processing Error Handling and Retries

## Status
Accepted

## Context
The LLM extraction step (`kernel.process(observation)`) can fail in multiple ways:

- **Transient errors**: Rate limits, timeouts, network failures
- **Content errors**: Malformed input, content policy violations
- **Output errors**: Invalid JSON, schema validation failures
- **Partial success**: Extract 5 of 10 jobs, then timeout

We need a strategy that balances reliability, cost, and operator experience.

## Decision

### Retry policy: 3 attempts then FAILED
1. **Attempt 1**: Process immediately when operator clicks "Process"
2. **Attempt 2-3**: Retry with exponential backoff (5s, 15s)
3. **After 3 failures**: Set `Observation.processingStatus = FAILED`, store error in `lastError`

### State tracking
Add fields to `Observation`:
```prisma
processingAttempts  Int       @default(0)
lastError          String?   // Store last failure reason
processedAt        DateTime? // Timestamp of last attempt
```

### Error classification
- **Retryable** (429 rate limit, 5xx, timeout): Auto-retry up to 3 times
- **Non-retryable** (400 bad request, content policy, invalid schema): Fail immediately, store error
- **Partial success**: Create revisions for successfully extracted items, mark observation DONE with warning

### Operator experience
- Admin UI shows processing spinner with attempt count
- On failure, show `lastError` in observation list view
- "Retry" button resets `processingAttempts = 0` and re-triggers processing
- FAILED observations highlighted in admin UI

## Consequences

### Positive
- **Handles transient failures**: Rate limits and timeouts auto-recover
- **Operator visibility**: Clear error messages and retry capability
- **Cost bounded**: Maximum 3 LLM calls per observation
- **Simple state machine**: PENDING → DONE/FAILED (with attempt counter)

### Negative
- **Synchronous retries block UI**: User waits up to 20s for 3 attempts
- **No sophisticated backoff**: Fixed delays, not adaptive
- **Lost context on non-retryable errors**: Hard to debug "why did extraction fail?"

### Implementation notes

**Retry logic** (pseudocode):
```typescript
async function processObservation(obsId: string) {
  const obs = await prisma.observation.findUnique({ where: { id: obsId } });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.observation.update({
        where: { id: obsId },
        data: { processingAttempts: attempt }
      });

      const revisions = await kernel.process(obs);

      await prisma.$transaction([
        ...revisions.map(r => prisma.revision.create({ data: r })),
        prisma.observation.update({
          where: { id: obsId },
          data: {
            processingStatus: 'DONE',
            processedAt: new Date(),
            lastError: null
          }
        })
      ]);

      return; // Success

    } catch (error) {
      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt === 3;

      if (!isRetryable || isLastAttempt) {
        await prisma.observation.update({
          where: { id: obsId },
          data: {
            processingStatus: 'FAILED',
            lastError: error.message,
            processedAt: new Date()
          }
        });
        throw error;
      }

      await delay(5000 * attempt); // 5s, 10s, 15s
    }
  }
}
```

**Schema updates needed**:
```prisma
enum ProcessingStatus {
  PENDING
  DONE
  FAILED
}

model Observation {
  // ... existing fields
  processingStatus   ProcessingStatus @default(PENDING)
  processingAttempts Int              @default(0)
  lastError         String?
  processedAt       DateTime?
}
```

## Related
- ADR-001 (Manual Processing): Retries happen in-request during manual processing
- ADR-004 (One-to-Many Mapping): Partial success creates subset of revisions
