import { getContentFetcher } from './fetchers';
import { getStorage } from '../storage';
import { isHttpUrl } from './url';
import type { Observation } from '@prisma/client';

export interface PreparedContent {
  markdown?: string | null;
  rawBlobRef?: string | null;
  rawMeta?: Record<string, unknown> | null;
  rawFormat?: 'MARKDOWN' | 'TEXT' | 'HTML' | 'PDF' | 'IMAGE';
}

async function fetchBlobText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob (${response.status})`);
  }
  return response.text();
}

export async function prepareObservationContent(observation: Observation): Promise<PreparedContent> {
  if (observation.rawFormat === 'MARKDOWN' && observation.rawBlobRef) {
    const markdown = await fetchBlobText(observation.rawBlobRef);
    return { markdown, rawFormat: 'MARKDOWN' };
  }

  const storage = getStorage();

  if (observation.rawText && observation.rawFormat === 'TEXT') {
    const markdown = observation.rawText;
    const stored = await storage.putText({
      content: markdown,
      pathnamePrefix: 'observations',
      contentType: 'text/markdown',
    });

    return {
      markdown,
      rawBlobRef: stored.url,
      rawMeta: {
        contentType: stored.contentType,
        sizeBytes: stored.size,
        pathname: stored.pathname,
        source: 'plaintext',
      },
      rawFormat: 'MARKDOWN',
    };
  }

  if (observation.sourceRef && isHttpUrl(observation.sourceRef)) {
    const fetcher = getContentFetcher();
    const result = await fetcher.fetch(observation.sourceRef);
    const stored = await storage.putText({
      content: result.markdown,
      pathnamePrefix: 'observations',
      contentType: 'text/markdown',
    });

    return {
      markdown: result.markdown,
      rawBlobRef: stored.url,
      rawMeta: {
        contentType: stored.contentType,
        sizeBytes: stored.size,
        pathname: stored.pathname,
        source: 'url',
        title: result.title,
        byline: result.byline,
        excerpt: result.excerpt,
        siteName: result.siteName,
        fetchedFrom: result.url,
      },
      rawFormat: 'MARKDOWN',
    };
  }

  return {};
}
