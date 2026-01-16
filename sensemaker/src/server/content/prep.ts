import { readFile } from 'fs/promises';
import * as path from 'path';
import { getContentFetcher } from './fetchers';
import { getStorage } from '../storage';
import { isHttpUrl } from './url';
import { contentLogger } from '../logger';
import type { Observation } from '@prisma/client';

export interface PreparedContent {
  markdown?: string | null;
  rawBlobRef?: string | null;
  rawMeta?: Record<string, unknown> | null;
  rawFormat?: 'MARKDOWN' | 'TEXT' | 'HTML' | 'PDF' | 'IMAGE';
}

const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || '/tmp/sensemaker';

async function fetchBlobText(url: string): Promise<string> {
  // Handle local storage paths (e.g., /storage/2026-01-16/observations/...)
  if (url.startsWith('/storage/')) {
    const relativePath = url.replace('/storage/', '');
    const filePath = path.join(LOCAL_STORAGE_DIR, relativePath);
    contentLogger.debug({ url, filePath }, 'Reading blob from local storage');
    try {
      return await readFile(filePath, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({ url, filePath, error: message }, 'Failed to read local blob');
      throw new Error(`Failed to read local blob ${filePath}: ${message}`);
    }
  }

  // Handle absolute URLs
  contentLogger.debug({ url }, 'Fetching blob from URL');
  try {
    const response = await fetch(url);
    if (!response.ok) {
      contentLogger.error({ url, status: response.status }, 'Failed to fetch blob');
      throw new Error(`Failed to fetch blob from ${url}: HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Failed to fetch blob')) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    contentLogger.error({ url, error: message }, 'Network error fetching blob');
    throw new Error(`Network error fetching blob from ${url}: ${message}`);
  }
}

export async function prepareObservationContent(observation: Observation): Promise<PreparedContent> {
  const obsContext = {
    observationId: observation.id,
    rawFormat: observation.rawFormat,
    sourceRef: observation.sourceRef,
    hasRawText: !!observation.rawText,
    hasRawBlobRef: !!observation.rawBlobRef,
  };

  contentLogger.info(obsContext, 'Preparing observation content');

  // Step 1: If already markdown with blob, just fetch it
  if (observation.rawFormat === 'MARKDOWN' && observation.rawBlobRef) {
    contentLogger.debug({ ...obsContext, step: 'fetch-existing-markdown' }, 'Fetching existing markdown blob');
    try {
      const markdown = await fetchBlobText(observation.rawBlobRef);
      contentLogger.info({ ...obsContext, markdownLength: markdown.length }, 'Existing markdown fetched');
      return { markdown, rawFormat: 'MARKDOWN' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({ ...obsContext, error: message, step: 'fetch-existing-markdown' }, 'Failed to fetch existing markdown');
      throw new Error(`[Step: fetch-existing-markdown] ${message}`);
    }
  }

  const storage = getStorage();

  // Step 2: If plain text, convert and store as markdown
  if (observation.rawText && observation.rawFormat === 'TEXT') {
    contentLogger.debug({ ...obsContext, step: 'convert-plaintext' }, 'Converting plaintext to markdown');
    try {
      const markdown = observation.rawText;
      const stored = await storage.putText({
        content: markdown,
        pathnamePrefix: 'observations',
        contentType: 'text/markdown',
      });

      contentLogger.info({
        ...obsContext,
        markdownLength: markdown.length,
        storedUrl: stored.url,
      }, 'Plaintext converted and stored');

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({ ...obsContext, error: message, step: 'convert-plaintext' }, 'Failed to convert/store plaintext');
      throw new Error(`[Step: convert-plaintext] ${message}`);
    }
  }

  // Step 3: If HTTP URL, fetch and extract content
  if (observation.sourceRef && isHttpUrl(observation.sourceRef)) {
    contentLogger.debug({ ...obsContext, step: 'fetch-url', url: observation.sourceRef }, 'Fetching and extracting URL content');

    let result;
    try {
      const fetcher = getContentFetcher();
      result = await fetcher.fetch(observation.sourceRef);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({
        ...obsContext,
        error: message,
        step: 'fetch-url',
        url: observation.sourceRef,
      }, 'Failed to fetch/extract URL content');
      throw new Error(`[Step: fetch-url] ${message}`);
    }

    contentLogger.debug({
      ...obsContext,
      step: 'store-extracted',
      markdownLength: result.markdown.length,
      title: result.title,
    }, 'Storing extracted content');

    try {
      const stored = await storage.putText({
        content: result.markdown,
        pathnamePrefix: 'observations',
        contentType: 'text/markdown',
      });

      contentLogger.info({
        ...obsContext,
        markdownLength: result.markdown.length,
        storedUrl: stored.url,
        title: result.title,
        siteName: result.siteName,
      }, 'URL content extracted and stored');

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({ ...obsContext, error: message, step: 'store-extracted' }, 'Failed to store extracted content');
      throw new Error(`[Step: store-extracted] ${message}`);
    }
  }

  contentLogger.warn(obsContext, 'No content preparation strategy matched - returning empty');
  return {};
}
