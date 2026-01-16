# Architecture Decision Records (ADRs)

This directory contains the architectural decisions for the Sensemaker MVP.

## Index

- [ADR-001: Manual Processing for MVP](./001-manual-processing-mvp.md)
  - Decision to use manual "Process" button instead of automated background processing

- [ADR-002: Manual Deduplication Strategy](./002-manual-deduplication.md)
  - Decision to rely on operator judgment for duplicates in MVP

- [ADR-003: LLM Processing Error Handling and Retries](./003-llm-retry-and-error-handling.md)
  - 3-retry policy, error classification, and FAILED state handling

- [ADR-004: Kernel-Based One-to-Many Observation-to-Listing Mapping](./004-kernel-based-one-to-many-mapping.md)
  - How one observation can generate multiple listings via kernel processor

- [ADR-005: Authentication with Clerk](./005-clerk-authentication.md)
  - Decision to use Clerk for admin authentication and user management

- [ADR-006: Content Storage Abstraction](./006-content-storage-abstraction.md)
  - How to abstract storage details from higher layers (Proposed)

## ADR Format

Each ADR follows this structure:
- **Status**: Accepted | Deprecated | Superseded
- **Context**: Problem statement and constraints
- **Decision**: What we decided to do
- **Consequences**: Positive/negative outcomes and mitigations
- **Related**: Links to related ADRs or schema changes

## When to write an ADR

Create a new ADR when:
- Making an architectural choice with long-term impact
- Choosing between multiple valid approaches
- Deciding to defer/exclude a feature
- Changing a previous architectural decision (supersede the old ADR)
