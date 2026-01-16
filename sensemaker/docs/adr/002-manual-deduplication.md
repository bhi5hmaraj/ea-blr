# ADR-002: Manual Deduplication Strategy

## Status
Accepted

## Context
The system will ingest observations from multiple sources (manual paste, scrapes, DMs, emails). Duplicate submissions are inevitable:

- Same job posted to multiple boards
- User accidentally submits the same URL twice
- Scraper re-runs on the same page

We need a strategy to detect and handle duplicates. Options considered:

1. **Automated deduplication**: Hash content, reject/merge duplicates automatically
2. **Warning + manual decision**: Detect duplicates, show warning, let operator decide
3. **No deduplication**: Allow duplicates, rely on downstream curation
4. **Manual only**: Operator checks before submitting (no system support)

## Decision
We will implement **manual deduplication** (option 4) for MVP:

- Schema includes `Observation.contentHash` field (nullable)
- No automatic hash computation or duplicate checking on insert
- Operators are responsible for checking if content already exists
- Future: Add "similar observations" search in admin UI

## Consequences

### Positive
- **Zero complexity**: No hash computation, no duplicate detection logic
- **No false positives**: Avoids "same hash, different content" edge cases
- **Operator stays in control**: Humans decide what's truly duplicate
- **Fast to ship**: One less feature to build and test

### Negative
- **Duplicate observations possible**: Same content ingested multiple times
- **Wasted LLM processing**: Processing same content creates redundant revisions
- **Messy data**: Listing.canonicalKey might conflict if duplicates processed

### Mitigation strategies

**Immediate (MVP)**:
- Admin UI shows recent observations before creating new ones
- Observation list view shows `sourceRef` (URL) for visual scan
- If insert fails on `Listing.canonicalKey` unique constraint, show friendly error

**Post-MVP** (when pain appears):
1. Compute `contentHash = sha256(normalized(rawText || rawBlobRef))` on insert
2. Admin UI queries "observations with same hash" before processing
3. Show warning: "3 observations have identical content. Process anyway?"
4. Eventually: auto-link duplicate observations to same listing

## Related
- Schema includes `contentHash` field to unblock future automation
- Listing.canonicalKey uniqueness constraint provides last-line deduplication
