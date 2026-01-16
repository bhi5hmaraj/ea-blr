import type { ContentFetcher, ContentFetcherProvider } from './types';
import { ReadabilityFetcher } from './readabilityFetcher';

let cachedFetcher: ContentFetcher | null = null;

export function getContentFetcher(): ContentFetcher {
  if (cachedFetcher) return cachedFetcher;

  const provider = (process.env.CONTENT_FETCHER as ContentFetcherProvider | undefined) ?? 'readability';

  switch (provider) {
    case 'readability':
    default:
      cachedFetcher = new ReadabilityFetcher();
      break;
  }

  return cachedFetcher;
}
