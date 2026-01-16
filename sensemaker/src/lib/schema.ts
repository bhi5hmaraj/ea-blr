/**
 * SINGLE SOURCE OF TRUTH: Zod Schema Definitions
 *
 * All types, validation, and database schemas derive from these Zod schemas.
 * The Prisma schema in prisma/schema.prisma MUST be kept in sync with these definitions.
 *
 * EXTRACTION SCHEMAS live in extraction-schemas.ts and are re-exported here.
 */

import { z } from 'zod';

// Re-export extraction schemas (single source of truth for LLM extraction)
export {
  CURRENT_SCHEMA_VERSION,
  JobListingV1,
  EXTRACTION_SCHEMAS,
  getJsonSchema,
  getZodSchema,
  validateExtraction,
  validateExtractedData,
  getExtractionPrompt,
  getContentPrompt,
} from './extraction-schemas';

export type { JobListingV1 as JobListingV1Type } from './extraction-schemas';

// ============================================================================
// BASE ENUMS - Source of truth for all enum types
// ============================================================================

export const ListingKind = z.enum(['JOB', 'NEWS']);
export type ListingKind = z.infer<typeof ListingKind>;

export const RevisionStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type RevisionStatus = z.infer<typeof RevisionStatus>;

export const ObservationSource = z.enum(['MANUAL', 'SCRAPE', 'EMAIL', 'API']);
export type ObservationSource = z.infer<typeof ObservationSource>;

export const RawFormat = z.enum(['TEXT', 'MARKDOWN', 'HTML', 'PDF', 'IMAGE']);
export type RawFormat = z.infer<typeof RawFormat>;

export const ProcessingStatus = z.enum(['PENDING', 'DONE', 'FAILED']);
export type ProcessingStatus = z.infer<typeof ProcessingStatus>;

// ============================================================================
// CORE DOMAIN MODELS - Complete entity definitions
// ============================================================================

/**
 * Listing: Stable identity for a published opportunity/story
 */
export const Listing = z.object({
  id: z.string().cuid(),
  kind: ListingKind,
  canonicalKey: z.string().min(1), // Unique identifier (URL or hash)

  // Convenience fields (denormalized for performance)
  title: z.string().nullable(),
  orgName: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),

  // Current published version
  selectedRevisionId: z.string().cuid().nullable(),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Listing = z.infer<typeof Listing>;

/**
 * Observation: Raw evidence captured at a point in time (append-only)
 */
export const Observation = z.object({
  id: z.string().cuid(),

  // Source tracking
  sourceType: ObservationSource,
  sourceRef: z.string().nullable(), // URL, "dm:<id>", "email:<id>", etc.
  capturedAt: z.date(),

  // Raw content
  rawFormat: RawFormat,
  rawText: z.string().nullable(),
  rawBlobRef: z.string().nullable(), // Object storage key
  rawMeta: z.record(z.unknown()).nullable(), // { filename, mime, size, etc. }

  // Deduplication (ADR-002)
  contentHash: z.string().nullable(), // sha256 of normalized content

  // Processing state (ADR-001, ADR-003)
  processingStatus: ProcessingStatus,
  processingAttempts: z.number().int().min(0),
  lastError: z.string().nullable(),
  processedAt: z.date().nullable(),

  // Audit trail (ADR-005)
  createdBy: z.string().nullable(), // Clerk user ID
  processedBy: z.string().nullable(), // Clerk user ID

  createdAt: z.date(),
});

export type Observation = z.infer<typeof Observation>;

/**
 * Revision: Structured interpretation of observations (append-only)
 */
export const Revision = z.object({
  id: z.string().cuid(),

  // Links
  listingId: z.string().cuid(),
  observationId: z.string().cuid().nullable(),

  // Schema versioning
  schemaVersion: z.number().int().positive(),

  // Lifecycle
  status: RevisionStatus,

  // Structured data
  extracted: z.record(z.unknown()), // LLM output
  edited: z.record(z.unknown()).nullable(), // Human edits
  resolved: z.record(z.unknown()).nullable(), // Merged view (computed on approval)

  notes: z.string().nullable(),

  // Audit trail (ADR-005)
  approvedBy: z.string().nullable(), // Clerk user ID
  approvedAt: z.date().nullable(),

  createdAt: z.date(),
});

export type Revision = z.infer<typeof Revision>;

// ============================================================================
// DOMAIN-SPECIFIC SCHEMAS
// ============================================================================
// NOTE: Extraction schemas (JobListingV1, etc.) are defined in extraction-schemas.ts
// and re-exported above. That file is the SINGLE SOURCE OF TRUTH for:
//   - TypeScript types
//   - Runtime validation
//   - LLM structured output (JSON Schema)
//   - Database storage format

// ============================================================================
// API INPUT SCHEMAS - Request validation
// ============================================================================

/**
 * Create observation (POST /api/observations)
 *
 * One-of content input: exactly one of text | url | file.
 */
const CreateObservationBase = z.object({
  sourceType: ObservationSource.default('MANUAL'),
});

const CreateObservationText = z.object({
  kind: z.literal('text'),
  text: z.string().min(1),
});

const CreateObservationUrl = z.object({
  kind: z.literal('url'),
  url: z.string().url(),
});

const CreateObservationFile = z.object({
  kind: z.literal('file'),
  fileUrl: z.string().url(),
  contentType: z.string().min(1),
  filename: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
});

export const CreateObservationContent = z.discriminatedUnion('kind', [
  CreateObservationText,
  CreateObservationUrl,
  CreateObservationFile,
]);

export const CreateObservationInput = CreateObservationBase.and(CreateObservationContent);

export type CreateObservationInput = z.infer<typeof CreateObservationInput>;

/**
 * Approve revision (POST /api/revisions/:id/approve)
 */
export const ApproveRevisionInput = z.object({
  edited: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
});

export type ApproveRevisionInput = z.infer<typeof ApproveRevisionInput>;

/**
 * List query parameters (GET /api/*)
 */
export const ListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListQuery = z.infer<typeof ListQuery>;

/**
 * Observation list filters
 */
export const ObservationListQuery = ListQuery.extend({
  status: ProcessingStatus.optional(),
  sourceType: ObservationSource.optional(),
  createdBy: z.string().optional(),
});

export type ObservationListQuery = z.infer<typeof ObservationListQuery>;

/**
 * Revision list filters
 */
export const RevisionListQuery = ListQuery.extend({
  status: RevisionStatus.optional(),
  listingId: z.string().cuid().optional(),
  observationId: z.string().cuid().optional(),
});

export type RevisionListQuery = z.infer<typeof RevisionListQuery>;

/**
 * Listing list filters
 */
export const ListingListQuery = ListQuery.extend({
  kind: ListingKind.optional(),
  orgName: z.string().optional(),
});

export type ListingListQuery = z.infer<typeof ListingListQuery>;

// ============================================================================
// KERNEL INTERFACE (ADR-004)
// ============================================================================

/**
 * Output from kernel processor: one or more revision payloads per observation
 */
export const RevisionPayload = z.object({
  canonicalKey: z.string().min(1, 'canonicalKey is required'),
  kind: ListingKind,
  schemaVersion: z.number().int().positive(),
  data: z.record(z.unknown()), // Will be validated against schema version

  // Convenience fields (for Listing denormalization)
  title: z.string().optional(),
  orgName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

export type RevisionPayload = z.infer<typeof RevisionPayload>;

/**
 * Kernel interface for LLM extraction
 */
export interface Kernel {
  readonly name: string;
  readonly kind: ListingKind;
  readonly schemaVersion: number;

  process(observation: Observation): Promise<RevisionPayload[]>;
}

// ============================================================================
// ERROR TYPES (ADR-003)
// ============================================================================

export class RetryableError extends Error {
  constructor(message: string, public readonly attempt: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class NonRetryableError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/**
 * Classify if an error should be retried (ADR-003)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) return true;
  if (error instanceof NonRetryableError) return false;

  const message = error instanceof Error ? error.message : String(error);
  const retryablePatterns = [
    /timeout/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /429/,
    /rate limit/i,
    /5\d{2}/, // 5xx errors
  ];

  return retryablePatterns.some((pattern) => pattern.test(message));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
// NOTE: validateExtraction() is re-exported from extraction-schemas.ts above

/**
 * Generate canonical key from URL or content
 */
export function generateCanonicalKey(input: {
  sourceUrl?: string | null;
  rawText?: string | null;
  rawBlobRef?: string | null;
}): string {
  // Priority: sourceUrl > content hash
  if (input.sourceUrl) {
    try {
      const url = new URL(input.sourceUrl);
      // Normalize: lowercase, remove trailing slash, remove query params that don't matter
      return `url:${url.hostname}${url.pathname.replace(/\/$/, '')}`;
    } catch {
      // Invalid URL, fall through to hash
    }
  }

  // Hash-based canonical key
  const content = input.rawText || input.rawBlobRef || '';
  // In production, use crypto.subtle.digest
  return `hash:${simpleHash(content)}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
