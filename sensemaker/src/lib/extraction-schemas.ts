/**
 * SINGLE SOURCE OF TRUTH: Extraction Schemas
 *
 * These Zod schemas define what data we extract from observations.
 * They serve as the source of truth for:
 *   1. TypeScript types (inferred)
 *   2. Runtime validation (Zod .parse())
 *   3. LLM structured output (JSON Schema via zod-to-json-schema)
 *   4. Database storage (Revision.extracted/edited/resolved)
 *
 * IMPORTANT: Field descriptions become LLM extraction instructions!
 * Write them as if you're telling an LLM what to extract.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================================================
// CURRENT SCHEMA VERSION
// ============================================================================

export const CURRENT_SCHEMA_VERSION = 1;

// ============================================================================
// JOB LISTING SCHEMA v1
// ============================================================================

export const JobListingV1 = z.object({
  title: z
    .string()
    .min(1)
    .describe('The job title exactly as it appears in the posting. Do not modify or abbreviate.'),

  organization: z
    .string()
    .min(1)
    .describe('The hiring organization/company name. Use the official name, not abbreviations.'),

  applyUrl: z
    .string()
    .url()
    .describe('The URL where candidates can apply. Must be a valid, complete URL starting with http:// or https://'),

  location: z
    .string()
    .nullable()
    .describe('Physical location of the job (city, state/country). Set to null if not specified.'),

  locationType: z
    .enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNSPECIFIED'])
    .describe('Whether the job is remote, hybrid, onsite, or unspecified. Infer from context if not explicit.'),

  salaryMin: z
    .number()
    .nullable()
    .describe('Minimum salary as a number (no currency symbols). Convert to annual if given monthly/hourly. Null if not provided.'),

  salaryMax: z
    .number()
    .nullable()
    .describe('Maximum salary as a number (no currency symbols). Convert to annual if given monthly/hourly. Null if not provided.'),

  salaryCurrency: z
    .string()
    .length(3)
    .default('USD')
    .describe('3-letter ISO 4217 currency code (e.g., USD, EUR, INR). Default to USD if not specified.'),

  salaryPeriod: z
    .enum(['HOURLY', 'MONTHLY', 'YEARLY'])
    .default('YEARLY')
    .describe('Pay period for the salary. Default to YEARLY.'),

  description: z
    .string()
    .nullable()
    .describe('A concise summary of the role (2-3 sentences). Capture the essence of what the job entails.'),

  requirements: z
    .array(z.string())
    .default([])
    .describe('List of required qualifications, skills, or experience. Each item should be one requirement.'),

  responsibilities: z
    .array(z.string())
    .default([])
    .describe('List of job duties and responsibilities. Each item should be one responsibility.'),

  benefits: z
    .array(z.string())
    .default([])
    .describe('List of benefits offered (health insurance, PTO, etc.). Each item should be one benefit.'),

  tags: z
    .array(z.string())
    .default([])
    .describe('Relevant tags/keywords for categorization (e.g., "python", "senior", "startup", "nonprofit").'),

  experienceLevel: z
    .enum(['ENTRY', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE', 'UNSPECIFIED'])
    .describe('Seniority level of the position. Infer from title/requirements if not explicit.'),

  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'VOLUNTEER', 'UNSPECIFIED'])
    .describe('Type of employment. Default to FULL_TIME if not specified but appears to be a regular job.'),

  postedDate: z
    .string()
    .datetime()
    .nullable()
    .describe('When the job was posted, in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ). Null if not found.'),

  closingDate: z
    .string()
    .datetime()
    .nullable()
    .describe('Application deadline, in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ). Null if not found.'),

  contactEmail: z
    .string()
    .email()
    .nullable()
    .describe('Contact email for applications or inquiries. Null if not provided.'),

  impactArea: z
    .array(z.string())
    .default([])
    .describe('Areas of social impact (e.g., "climate", "education", "health", "poverty"). Infer from org and role.'),
});

export type JobListingV1 = z.infer<typeof JobListingV1>;

// ============================================================================
// SCHEMA REGISTRY
// ============================================================================

export const EXTRACTION_SCHEMAS = {
  JOB: {
    1: JobListingV1,
    // Future: 2: JobListingV2,
  },
  NEWS: {
    // Future: 1: NewsArticleV1,
  },
} as const;

export type ListingKind = keyof typeof EXTRACTION_SCHEMAS;

// ============================================================================
// JSON SCHEMA GENERATION (for LLM prompts)
// ============================================================================

/**
 * Generate JSON Schema for LLM structured output
 */
export function getJsonSchema(kind: ListingKind, version: number = CURRENT_SCHEMA_VERSION) {
  const schema = EXTRACTION_SCHEMAS[kind]?.[version as keyof (typeof EXTRACTION_SCHEMAS)[typeof kind]];

  if (!schema) {
    throw new Error(`Unknown schema: ${kind} v${version}`);
  }

  return zodToJsonSchema(schema, {
    name: `${kind}Listing`,
    $refStrategy: 'none', // Inline all refs for LLM compatibility
  });
}

/**
 * Get the Zod schema for validation
 */
export function getZodSchema(kind: ListingKind, version: number = CURRENT_SCHEMA_VERSION): z.ZodType {
  const schemas = EXTRACTION_SCHEMAS[kind] as Record<number, z.ZodType | undefined>;
  const schema = schemas?.[version];

  if (!schema) {
    throw new Error(`Unknown schema: ${kind} v${version}`);
  }

  return schema;
}

/**
 * Validate extracted data against schema
 */
export function validateExtraction(
  kind: ListingKind,
  data: unknown,
  version: number = CURRENT_SCHEMA_VERSION
): z.SafeParseReturnType<unknown, unknown> {
  const schema = getZodSchema(kind, version);
  return schema.safeParse(data);
}

// Alias for backwards compatibility
export const validateExtractedData = validateExtraction;

// ============================================================================
// LLM PROMPT GENERATION
// ============================================================================

/**
 * Generate system prompt for LLM extraction
 */
export function getExtractionPrompt(kind: ListingKind, version: number = CURRENT_SCHEMA_VERSION): string {
  const jsonSchema = getJsonSchema(kind, version);

  return `You are an expert data extractor. Extract structured information from the provided content.

TASK: Extract ${kind.toLowerCase()} listing information.

OUTPUT FORMAT: Return a JSON object matching this schema:
${JSON.stringify(jsonSchema, null, 2)}

RULES:
1. Extract information exactly as it appears - do not invent or assume data
2. Use null for fields where information is not available
3. Use UNSPECIFIED for enum fields where the value cannot be determined
4. Dates must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)
5. URLs must be complete and valid (starting with http:// or https://)
6. Arrays should be empty [] if no items found, not null
7. Be concise but accurate in descriptions

Respond ONLY with the JSON object, no additional text.`;
}

/**
 * Generate user prompt with the content to extract from
 */
export function getContentPrompt(content: string, sourceUrl?: string | null): string {
  let prompt = `Extract the listing information from the following content:\n\n${content}`;

  if (sourceUrl) {
    prompt += `\n\nSource URL: ${sourceUrl}`;
  }

  return prompt;
}

// ============================================================================
// EXPORTS FOR CONVENIENCE
// ============================================================================

export { z } from 'zod';
