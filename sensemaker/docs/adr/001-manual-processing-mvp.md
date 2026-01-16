# ADR-001: Manual Processing for MVP

## Status
Accepted

## Context
The system needs to process observations (raw evidence) into structured revisions using LLM extraction. We considered three approaches:

1. **Automatic background processing**: Job queue + Cron/Workflow that automatically processes observations
2. **Hybrid**: Automatic with manual trigger option
3. **Manual only**: Process button in admin UI, no automation

For MVP, we need to validate the extraction quality and learn what the schema should be before automating at scale.

## Decision
We will implement **manual-only processing** for MVP:

- Observations are created in `PENDING` state
- Admin UI has a "Process" button that triggers LLM extraction synchronously
- No cron jobs, no background workers, no job queue table
- Processing happens in-request or via `waitUntil()` to stay within Vercel function limits

## Consequences

### Positive
- **Simplest possible implementation**: No distributed system complexity
- **Immediate feedback loop**: Operator sees extraction quality instantly
- **Cost control**: No runaway processing costs
- **Easy debugging**: Single request trace, no async coordination
- **Fast to ship**: Fewer moving parts means faster MVP delivery

### Negative
- **Manual overhead**: Operator must click "Process" for each observation
- **No batch processing**: Can't scrape 100 URLs and auto-process overnight
- **Single-threaded**: One observation at a time (though this helps with rate limits)

### Mitigation for post-MVP
When manual processing becomes a bottleneck:
1. Add `ProcessingStatus.PENDING` filter view so operators can batch-select
2. Add Cron endpoint that processes N pending observations per minute
3. Eventually migrate to Vercel Workflow for retries and durability

## Related
- ADR-003 (Error Handling): Defines retry behavior within manual processing
- ADR-004 (One-to-Many Mapping): Kernel processor generates multiple revisions per observation
