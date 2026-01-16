Design doc: Impact listings ingestion + curation (Apify + Express on Vercel + React-admin + Postgres + Prisma)
Context and intent
We’re building a high-trust listings product (jobs now, news later) where the core differentiator is provenance and curation. The system treats anything ingested (scraped or manual) as evidence, turns evidence into proposed structured versions via an LLM-driven extraction step, and lets a human choose which version becomes “current.” The MVP explicitly avoids long-running worker infrastructure and runs processing inside Express routes on Vercel, using Postgres as the durable source of truth and a small job table to make background-ish processing reliable.
Key concepts
An Observation is evidence captured at a point in time. It contains raw payloads (text/markdown/html, or references to PDFs/images stored elsewhere) plus metadata about where it came from. This is append-only by design.
A Listing is the stable identity for “this opportunity/story as a thing.” Listings are what your product and URLs should point to. A Listing does not contain the full data; instead it points to a chosen Revision.
A Revision is a structured interpretation of one or more observations. Revisions are also append-only. Humans approve/select a revision by updating the Listing’s selectedRevisionId pointer. This is “Option A” and avoids the complexity of “only one active row” constraints.
A Job is a small, durable “to-do” record that lets Vercel-triggered handlers process observations asynchronously-ish without losing work if a function times out or deployment changes mid-flight. This is the same idea as a transactional outbox: persisting the intent to do work in the same database transaction as the state change, so nothing gets dropped on the floor. (Stack Overflow)
External dependencies
Apify is used for best-effort web retrieval. We keep the Apify dataset “dumb” by storing the most important content as HTML/markdown/text and letting the backend handle extraction and normalization. Apify datasets are designed to sequentially store and retrieve results and are automatically created for actor runs. (Apify Documentation) Apify webhooks can send a POST request to our endpoint on run events (e.g., succeeded/failed), which we can use to ingest run outputs. (Apify Documentation) If we ever want a synchronous “run and immediately return dataset items,” Apify documents a sync endpoint but notes that maintaining a long idle HTTP connection can be unreliable due to timeouts, so the async + webhook/poll approach is safer. (Apify Documentation)
React-admin is the internal control plane UI. We use standard CRUD screens for resources plus one custom compare/review page. React-admin supports custom pages via <CustomRoutes>. (Marmelab) React-admin talks to our API via a dataProvider, which is explicitly the adapter layer between react-admin and the backend. (Marmelab) If we use the simple REST data provider, the backend must return pagination metadata via Content-Range (and expose it over CORS). (GitHub)
Vercel Cron is used for “event-driven enough” processing. Vercel Cron triggers work by making an HTTP GET request to a configured endpoint on a schedule. (Vercel) To make observation processing feel more immediate, we can optionally “kick” a drain call using waitUntil() so the response returns fast while the function continues work during the request lifecycle. (Vercel) We must keep batches small because Vercel functions have a maximum duration, and Vercel will terminate invocations that exceed it. (Vercel)
Postgres provides concurrency-safe job claiming via row locks. We use SELECT … FOR UPDATE semantics and SKIP LOCKED to avoid multiple drainers processing the same row when invocations overlap. Postgres documents FOR UPDATE row locking behavior and calls out SKIP LOCKED as a way to prevent contention in “update work in batches” workflows. (PostgreSQL) We avoid relying on Postgres LISTEN/NOTIFY for core reliability because listen registrations are session-scoped and cleared when the session ends, which doesn’t match serverless lifetimes. (Postgres Pro)
Prisma is used as the ORM and migration system. We lean on Prisma relations and Json fields to keep the schema simple early while staying evolvable. Prisma documents relation modeling and Json field support. (Prisma)
End-to-end lifecycle
When an operator manually adds a listing (text, PDF, image) or requests a scrape of a URL, the backend creates an Observation row and enqueues a Job row in the same transaction. The API returns immediately.
On a schedule (for example every minute), Vercel Cron calls a drain endpoint. (Vercel) The drain endpoint claims a small batch of pending jobs using row locks and SKIP LOCKED so overlapping drain invocations don’t duplicate work. (PostgreSQL) For each observation, the backend runs LLM_proc(observation) -> List[revisionPayload]. Each produced revision is attached to a Listing identity, created as PENDING, and linked back to the source observation for provenance.
Humans then review pending revisions in react-admin. Approval is a single atomic action: update the Revision status to APPROVED (optional but useful) and set Listing.selectedRevisionId to that revision. The “published view” is simply the join of Listing with its selected Revision. If we later want a precomputed read model, we can add a normal SQL view first and only consider a materialized view if query pressure demands it.
API surface
The backend exposes an admin API for react-admin and a public read API (not detailed here beyond the selected revision join). The admin API must support listing and filtering observations and revisions, creating observations, editing revisions, and selecting a revision for a listing. React-admin’s dataProvider contract is the controlling interface, so we’ll implement either a simple REST-compatible shape (including pagination headers like Content-Range) or a custom dataProvider that maps react-admin actions to our preferred endpoints. (Marmelab) Custom diff/review UI is implemented as a custom route, which react-admin supports via <CustomRoutes>. (Marmelab)
Apify integration endpoints are optional in the MVP if scrapes are kicked manually in Apify Console. If we do integrate in-app, we’ll store run metadata, fetch dataset items via the Apify API, and write those payloads as observations. Apify documents both dataset storage and dataset item retrieval. (Apify Documentation)
Data model and invariants
The primary invariants are that Observations are append-only evidence, Revisions are append-only interpretations, and a Listing chooses at most one current revision by pointer. We do not implement automated diff calculation in the MVP; the review UI can simply render two JSON blobs side-by-side and let the human decide.
Version numbering is maintained per Listing using @@unique([listingId, version]). In rare concurrent cases, two drainers could race to allocate the same next version; the MVP strategy is to attempt insert and retry on unique constraint violation (or allocate “version = createdAt order” later). Because we process small batches and typically have low concurrency, this is acceptable initially.
Prisma schema (Option A + serverless-friendly job queue)
// Prisma notes:
// - Json fields are used for flexible extracted payloads early. :contentReference[oaicite:18]{index=18}
// - Explicit relation names are used when there are multiple relations between the same models. :contentReference[oaicite:19]{index=19}

model Organization {
  id        String   @id @default(cuid())
  name      String
  domain    String?  @unique
  meta      Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  listings  Listing[]
}

model Observation {
  id         String            @id @default(cuid())
  sourceType ObservationSource
  sourceRef  String?           // URL, "dm:<id>", "email:<id>", etc.
  capturedAt DateTime          @default(now())

  rawFormat  RawFormat
  rawText    String?           // for pasted text/markdown/html
  rawBlobRef String?           // pointer to stored PDF/image/html
  rawMeta    Json?             // filename, mime type, headers, etc.

  llmMeta    Json?             // model/prompt/versioning metadata (optional)

  createdAt  DateTime          @default(now())

  revisions  Revision[]
  jobs       Job[]
}

model Listing {
  id                 String       @id @default(cuid())
  kind               ListingKind
  canonicalKey        String       @unique // normalized canonical URL or stable hash
  orgId              String?
  org                Organization? @relation(fields: [orgId], references: [id])

  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  selectedRevisionId String?
  selectedRevision   Revision?    @relation("SelectedRevision", fields: [selectedRevisionId], references: [id])

  revisions          Revision[]   @relation("ListingRevisions")
}

model Revision {
  id            String         @id @default(cuid())
  listingId     String
  listing       Listing        @relation("ListingRevisions", fields: [listingId], references: [id])

  observationId String?
  observation   Observation?   @relation(fields: [observationId], references: [id])

  version       Int
  schemaVersion Int
  status        RevisionStatus @default(PENDING)

  extracted     Json           // LLM extracted structured payload
  edited        Json?          // human edits (optional)
  notes         String?

  createdAt     DateTime       @default(now())

  @@unique([listingId, version])
}

model Job {
  id            String     @id @default(cuid())
  kind          JobKind
  status        JobStatus  @default(PENDING)
  attempts      Int        @default(0)
  runAfter      DateTime   @default(now())
  lockedAt      DateTime?
  lockedBy      String?
  lastError     String?

  observationId String
  observation   Observation @relation(fields: [observationId], references: [id])

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@index([status, runAfter, createdAt])
}

enum ListingKind {
  JOB
  NEWS
}

enum RevisionStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ObservationSource {
  MANUAL
  SCRAPE
}

enum RawFormat {
  TEXT
  MARKDOWN
  HTML
  PDF
  IMAGE
}

enum JobKind {
  EXTRACT_REVISIONS
  // Future: INGEST_APIFY_RUN, NORMALIZE_ORGS, SEND_NEWSLETTER, etc.
}

enum JobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}

Processing design on Vercel
Observation creation endpoints should enqueue a Job in the same transaction, which is the durable “event log” approach that survives function crashes and deploys. (Stack Overflow)
The drain endpoint is called by Vercel Cron, which is a scheduled HTTP GET. (Vercel) It claims a limited number of jobs and processes them to completion within the function’s maximum duration. Vercel documents that functions have a configurable max duration and will be terminated if they exceed it. (Vercel) For responsiveness, the observation creation endpoint can optionally call waitUntil() to kick one drain pass without blocking the response, while still relying on cron as the reliable backstop. (Vercel)
Concurrency safety comes from Postgres row locking with FOR UPDATE plus SKIP LOCKED, which Postgres positions as a way to avoid lock contention in batch-processing patterns. (PostgreSQL)
React-admin screens
The admin app uses standard resource screens for Organizations, Observations, Listings, and Revisions. The review/compare flow is implemented as a custom route (for example a page that loads a listing’s selected revision and a candidate pending revision and shows them side-by-side), which react-admin supports via <CustomRoutes>. (Marmelab) Data access is mediated via a dataProvider, which react-admin defines as the interface between the UI and your API. (Marmelab)
Apify integration in this model
Apify runs are optional in the MVP; if used, Apify datasets store sequential results, and we fetch dataset items and store each “best effort content blob” as an Observation. (Apify Documentation) Webhooks can notify our backend of run completion by sending a POST request to a URL we specify, which can enqueue ingestion jobs. (Apify Documentation)
Open issues and future extensions
As soon as you want automated diffing, it becomes natural to store a computed diff artifact on Revision creation (or at review time), but the MVP can remain manual. When you introduce scheduling, Apify schedules can run scrapes automatically, but your internal job draining system remains unchanged because it’s driven by rows in Postgres and cron-triggered drain calls. (Apify Documentation)
If you want, I can also generate the concrete SQL for the job-claim query (the SKIP LOCKED CTE pattern) and a matching Prisma transaction sketch for “claim job → run LLM → create revisions → mark job done,” tuned to stay under typical Vercel duration limits.
This is already a strong “trust-first, provenance-first” shape. The big change I’d make is aligning the processing mechanics with your new commitment to Vercel Workflow + Queues, because right now the doc still assumes a Postgres-backed Job table + drain loop.
The main architectural tweak: make Workflow the primary “job runner”
Vercel Workflow is explicitly designed to be durable, resumable, and to keep an event log/state so long-running multi-step logic survives deploys/crashes; it also sits on top of Vercel Queues and managed persistence. That’s basically what your Job table is trying to approximate.
So I’d do this:
On observation creation: write the Observation (and any Listing stub if you already know the identity), then immediately start a workflow keyed by observationId.
Cron becomes reconciliation, not the primary engine: it periodically finds “stuck” observations (e.g., PENDING for >N minutes, FAILED but retryable) and re-kicks the workflow.
This is cleaner because Vercel Cron invocations aren’t retried by Vercel if they fail. You don’t want your reliability story to hinge on cron being flawless.
Keep a small Postgres state machine anyway (for idempotency + visibility)
Even if Workflow stores its own event log, you still want your DB to be the truth of “what happened.” Otherwise you’ll be debugging across two systems.
Add fields on Observation like:
processingStatus (PENDING | RUNNING | DONE | FAILED)
processingAttempts, lastError, processedAt
workflowRunId (string) so you can link DB rows to workflow executions
This also makes the whole system idempotent: if a workflow restarts, it checks whether Observation is already DONE and no-ops.
Replace the Job table with Workflow-orchestrated steps
Given Workflow already gives you the “durable step” semantics (and manages retries/state), you can usually delete Job entirely unless you want a portable queue that’s independent of Vercel.
If you do keep a DB queue, I’d only keep it as a fallback/re-drive mechanism (“force reprocess this observation”), not as the daily engine.
Tighten the provenance story: store blobs out-of-row
For jobs-now/news-later, raw payloads get big fast (HTML pages, PDFs, screenshots, newsletter emails). Your schema already anticipates rawBlobRef, which is good—lean into that and treat rawText as “small inline convenience,” not the default.
In practice: store raw artifacts in object storage (Supabase Storage / S3 / R2), and keep in Postgres: rawBlobRef, mime, sizeBytes, sha256, plus a short extracted text/summary if needed for quick review.
Make “what is published” unambiguous: store a resolved payload
Right now you have extracted + optional edited. That’s great for audit, but the read path becomes “merge these at runtime.”
I’d add one of these patterns:
either a resolved Json on Revision that is computed when the human approves (merge extracted + edited into a single payload), or
treat approval as “create a new revision that represents the curated version,” and keep the LLM output as just another non-approved revision.
Either way, your public API reads one JSON blob per listing, no merge logic. Prisma’s Json type is a good fit for this kind of flexible payload evolution.
Versioning: keep it, but allocate it deterministically
Your current plan (“try insert, retry on unique violation”) is okay at low concurrency, but there’s a cleaner, totally boring approach: keep an integer listing.revisionCounter and increment it transactionally when you create revisions. That avoids “MAX(version)+1 races” entirely.
Security/ops footnote you should add to the doc
Since you’re using Cron as a backstop, secure it with CRON_SECRET. Vercel will send it as an Authorization: Bearer … header automatically, and you should verify it in the handler.
Minimal Prisma deltas I’d make
Conceptually:
remove Job
add Observation.processingStatus, processingAttempts, workflowRunId, processedAt, lastError
add Listing.revisionCounter Int @default(0) (optional but recommended)
add Revision.resolved Json? (or adopt “curated revision is a new revision”)
Everything else is basically right for MVP.
If you want, I can rewrite just the “Processing design on Vercel” section so it reflects Workflow-first (including how retries and step boundaries should map to LLM_proc(obs) -> revisions), without ballooning the scope.

MVP final design 
You’re not wrong to ask. The universe is littered with MVPs that died of “beautiful architecture” before they met a single user.
Here’s the simplest way to think about it:
Definition (MVP correctness). For your MVP, the only correctness properties you must have are: you don’t lose submissions, you can review/edit before publishing, and you can explain “where this came from” when asked.
Everything else (queues, workflows, retries, fancy versioning) is optional until reality forces your hand.
What’s over-engineering right now?
Vercel Workflow + Queues + Cron all at once is likely too much for day 1. Pick one async mechanism.
A full job queue table with locking/retries is great, but if your volume is small, it’s more machinery than signal.
Per-listing version counters and race handling are only needed once you have concurrent processing and automation.
The MVP I’d actually ship (minimum moving parts)
Use Postgres as the source of truth. Use one Express API (Vercel). Use one admin UI (React-admin or your own). Skip Apify automation; do scrape runs manually if needed.
Data model: keep only these tables:
observations (append-only inbox)
listings (stable identity)
revisions (structured snapshots, pending/approved)
organizations (optional in v1; can be a string field first)
Flow:
Create observation (manual paste, file upload reference, or URL). Set processing_status = PENDING.
Add a button in admin: “Process”. When clicked, your Express endpoint runs the LLM extraction synchronously (or with waitUntil), and writes revisions as PENDING, then sets processing_status = DONE/FAILED.
Human edits the pending revision and clicks Approve, which sets listing.selectedRevisionId.
That’s it. No cron. No workflow. No queue.
This is the “one-person newsroom” mode. It’s scrappy and it will teach you what the real schema needs to be.
When do you add automation?
Add automation only when a specific pain appears:
If you’re forgetting to click “Process” → add Cron to process pending observations every few minutes.
If LLM calls exceed function limits or are flaky → upgrade to Workflow/Queues (or move processing to a longer-lived environment).
If you have multiple processors running concurrently and stepping on each other → add a job table or a workflow idempotency key and locking.
So you don’t start with Workflow/Queues; you earn them.
What I would keep even in the “simple MVP”
Two small “future-proof” bits that cost almost nothing but save you later:
Keep rawBlobRef and store large raw content in object storage (Supabase Storage or similar). Don’t shove PDFs into Postgres rows.
Keep schemaVersion on Revision and store the extracted payload as JSONB (Json in Prisma). That’s your flexibility lever.
The real call
If your current goal is “launch something and learn,” simplify to manual processing + manual approval. You’ll still have provenance and revision history, and you’ll avoid building a tiny distributed system before you have users.

Here’s a stripped-down Prisma schema that matches the “manual intake → manual/one-click LLM process → human approve → publish” MVP, with no job table, no queues, no cron required.
It keeps the two “cheap but future-proof” levers: JSON payloads + schemaVersion, and rawBlobRef for big artifacts.
// MVP schema: Observations -> Revisions -> Listing selects one Revision.
// No Job table, no background workers.

model Listing {
  id                 String      @id @default(cuid())
  kind               ListingKind @default(JOB)

  // Stable identity for the thing. For jobs/news this can be normalized URL,
  // or a hash of (source + externalId), etc.
  canonicalKey        String      @unique

  title              String?     // optional convenience fields for list views
  orgName            String?     // keep as string in MVP; normalize later
  sourceUrl          String?     // convenience, not authoritative

  selectedRevisionId String?
  selectedRevision   Revision?   @relation("SelectedRevision", fields: [selectedRevisionId], references: [id])

  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  revisions          Revision[]  @relation("ListingRevisions")
}

model Observation {
  id               String            @id @default(cuid())

  sourceType       ObservationSource
  sourceRef        String?           // URL, "dm:<id>", "email:<id>", etc.
  capturedAt       DateTime          @default(now())

  rawFormat        RawFormat
  rawText          String?           // pasted text / extracted text / html snippet
  rawBlobRef       String?           // object storage key / URL for PDF/image/html
  rawMeta          Json?             // filename, mime, sizeBytes, headers, etc.
  contentHash      String?           // optional: sha256 of rawText/rawBlob for dedupe

  processingStatus ProcessingStatus  @default(PENDING)
  lastError        String?
  processedAt      DateTime?
  processedBy      String?           // user id/email if you have auth; otherwise omit

  createdAt        DateTime          @default(now())

  revisions        Revision[]
}

model Revision {
  id            String         @id @default(cuid())

  listingId     String
  listing       Listing        @relation("ListingRevisions", fields: [listingId], references: [id])

  observationId String?
  observation   Observation?   @relation(fields: [observationId], references: [id])

  // Keep this even in MVP: it makes schema evolution painless.
  schemaVersion Int

  status        RevisionStatus @default(PENDING)

  // What the LLM extracted (or what a human entered).
  extracted     Json

  // Optional human edits (store only if you need it).
  edited        Json?

  // Optional: merged view for easy read path (populate on approval).
  resolved      Json?

  notes         String?
  createdAt     DateTime       @default(now())

  @@index([listingId, createdAt])
  @@index([status, createdAt])
}

enum ListingKind {
  JOB
  NEWS
}

enum RevisionStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ObservationSource {
  MANUAL
  SCRAPE
}

enum RawFormat {
  TEXT
  MARKDOWN
  HTML
  PDF
  IMAGE
}

enum ProcessingStatus {
  PENDING
  DONE
  FAILED
}

How this maps to your MVP flows (so it doesn’t drift)
Create observation: insert Observation(PENDING) with rawText or rawBlobRef.
Process observation (button click): your API loads the observation, runs the LLM, creates one or more Revision(status=PENDING, schemaVersion=1, extracted=…), sets Observation.processingStatus=DONE/FAILED.
Approve revision: set Revision.status=APPROVED, set Listing.selectedRevisionId=revision.id. Optionally compute resolved = merge(extracted, edited) at this moment.
Public API reads Listing joined to selectedRevision and returns resolved ?? edited ?? extracted.
One tiny choice: do you still want per-listing version?
For MVP: no. Use createdAt ordering. If later you want “Revision #7,” you can add a counter or a version column once concurrency and automation make it useful.
If you tell me whether you want “one observation can create multiple listings” (scrape pages with many jobs) in MVP v1, I can adjust the schema slightly (you’d add an optional listingHintKey on Observation, or ensure your processor creates Listings as needed).



