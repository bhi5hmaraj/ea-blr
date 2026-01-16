import {
  Kernel,
  ListingKind,
  Observation,
  RevisionPayload,
  generateCanonicalKey,
} from '../../lib/schema';
import { OpenAIJobKernel } from './openaiJobKernel';
import { extractFirstUrl } from '../content';

export interface KernelRegistry {
  resolve(observation: Observation): Kernel | null;
}

class StaticKernelRegistry implements KernelRegistry {
  constructor(private readonly kernels: Kernel[]) {}

  resolve(_observation: Observation): Kernel | null {
    return this.kernels[0] ?? null;
  }
}

class MockJobKernel implements Kernel {
  readonly name = 'mock-job-kernel';
  readonly kind = ListingKind.enum.JOB;
  readonly schemaVersion = 1;

  async process(observation: Observation): Promise<RevisionPayload[]> {
    const text = observation.rawText ?? '';
    const title = firstNonEmptyLine(text) ?? 'Untitled role';
    const applyUrl = extractFirstUrl(text) ?? observation.sourceRef ?? 'https://example.com/apply';

    const data = {
      title,
      organization: 'Unknown',
      applyUrl,
      description: text.slice(0, 4000),
    };

    const canonicalKey = generateCanonicalKey({
      sourceUrl: applyUrl,
      rawText: observation.rawText,
      rawBlobRef: observation.rawBlobRef,
    });

    return [
      {
        canonicalKey,
        kind: ListingKind.enum.JOB,
        schemaVersion: this.schemaVersion,
        data,
        title,
        orgName: 'Unknown',
        sourceUrl: applyUrl,
      },
    ];
  }
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

let cachedRegistry: KernelRegistry | null = null;

export function getKernelRegistry(): KernelRegistry {
  if (cachedRegistry) return cachedRegistry;

  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  const hasLiteLLM = Boolean(process.env.LITELLM_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const isDev = process.env.NODE_ENV !== 'production';

  if (provider === 'mock' || provider === 'local') {
    console.log('[Kernel] Using MockJobKernel (LLM_PROVIDER=mock)');
    cachedRegistry = new StaticKernelRegistry([new MockJobKernel()]);
  } else if (hasLiteLLM || hasOpenAI) {
    console.log(`[Kernel] Using OpenAIJobKernel (${hasLiteLLM ? 'LiteLLM' : 'OpenAI'} API)`);
    cachedRegistry = new StaticKernelRegistry([new OpenAIJobKernel()]);
  } else if (isDev) {
    console.log('[Kernel] No API key configured, using MockJobKernel for development');
    cachedRegistry = new StaticKernelRegistry([new MockJobKernel()]);
  } else {
    console.warn('[Kernel] No LLM configured! Set LITELLM_API_KEY or OPENAI_API_KEY');
    cachedRegistry = new StaticKernelRegistry([]);
  }

  return cachedRegistry;
}
