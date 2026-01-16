import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { Kernel, Observation, RevisionPayload } from '../../lib/schema';
import { ListingKind, generateCanonicalKey } from '../../lib/schema';
import {
  JobListingV1,
  CURRENT_SCHEMA_VERSION,
  getExtractionPrompt,
  getContentPrompt,
} from '../../lib/extraction-schemas';
import { badRequest } from '../http/errors';
import { kernelLogger } from '../logger';

// Config is read at module load time (after entry.ts loads dotenv)
const litellmApiKey = process.env.LITELLM_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const apiKey = litellmApiKey || openaiApiKey;

const baseURL = litellmApiKey
  ? (process.env.LITELLM_BASE_URL || 'https://asgard.bhishmaraj.org')
  : undefined;

const model = process.env.LLM_MODEL || 'gpt-4o-2024-08-06';
const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || '30000');

declare global {
  // eslint-disable-next-line no-var
  var __SENSEMAKER_LLM_CLIENT__: InstanceType<typeof OpenAI> | undefined;
  // eslint-disable-next-line no-var
  var __SENSEMAKER_LLM_SIG__: string | undefined;
}

function getClient(): InstanceType<typeof OpenAI> {
  if (!apiKey) {
    throw new Error('Missing LLM configuration. Set LITELLM_API_KEY or OPENAI_API_KEY.');
  }

  const signature = `${baseURL ?? 'openai'}|${model}|${timeoutMs}|${apiKey.slice(-4)}`;
  if (!globalThis.__SENSEMAKER_LLM_CLIENT__ || globalThis.__SENSEMAKER_LLM_SIG__ !== signature) {
    globalThis.__SENSEMAKER_LLM_CLIENT__ = new OpenAI({
      apiKey,
      ...(baseURL && { baseURL }),
      timeout: timeoutMs,
      maxRetries: 1,
    });
    globalThis.__SENSEMAKER_LLM_SIG__ = signature;
    kernelLogger.info({ baseURL: baseURL ?? 'api.openai.com', model, timeoutMs }, 'LLM client initialized');
  }

  return globalThis.__SENSEMAKER_LLM_CLIENT__;
}

/**
 * Extract job listing using OpenAI Structured Outputs
 * https://platform.openai.com/docs/guides/structured-outputs
 *
 * Structured outputs guarantee the response matches the Zod schema exactly.
 * No manual JSON parsing needed - the SDK handles validation automatically.
 */
async function extractJobListing(
  text: string,
  sourceRef: string | null
): Promise<typeof JobListingV1._type> {
  const client = getClient();
  const startTime = Date.now();

  const systemPrompt = getExtractionPrompt('JOB', CURRENT_SCHEMA_VERSION);
  const userPrompt = getContentPrompt(text, sourceRef);

  kernelLogger.debug({ sourceRef, textLength: text.length }, 'Starting LLM extraction');

  const response = await client.beta.chat.completions.parse({
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: zodResponseFormat(JobListingV1, 'job_listing'),
  });

  const durationMs = Date.now() - startTime;
  const message = response.choices[0]?.message;

  // Check for refusal (content policy)
  if (message?.refusal) {
    kernelLogger.warn({ refusal: message.refusal, durationMs }, 'LLM refused extraction');
    throw new Error(`LLM refused to extract: ${message.refusal}`);
  }

  const parsed = message?.parsed;
  if (!parsed) {
    kernelLogger.error({ durationMs }, 'LLM returned no parsed content');
    throw new Error('LLM returned no parsed content');
  }

  kernelLogger.info({
    title: parsed.title,
    org: parsed.organization,
    durationMs,
    usage: response.usage,
  }, 'LLM extraction complete');

  return parsed;
}

export class OpenAIJobKernel implements Kernel {
  readonly name = 'openai-structured-job-kernel';
  readonly kind = ListingKind.enum.JOB;
  readonly schemaVersion = CURRENT_SCHEMA_VERSION;

  async process(observation: Observation): Promise<RevisionPayload[]> {
    if (!observation.rawText) {
      throw badRequest('Observation has no rawText; unable to extract');
    }

    const extracted = await extractJobListing(observation.rawText, observation.sourceRef);

    const canonicalKey = generateCanonicalKey({
      sourceUrl: extracted.applyUrl || observation.sourceRef,
      rawText: observation.rawText,
      rawBlobRef: observation.rawBlobRef,
    });

    return [
      {
        canonicalKey,
        kind: ListingKind.enum.JOB,
        schemaVersion: this.schemaVersion,
        data: extracted,
        title: extracted.title,
        orgName: extracted.organization,
        sourceUrl: extracted.applyUrl,
      },
    ];
  }
}
