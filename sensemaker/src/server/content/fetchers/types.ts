export interface FetchResult {
  url: string;
  markdown: string;
  title?: string | null;
  byline?: string | null;
  excerpt?: string | null;
  siteName?: string | null;
  contentType?: string | null;
}

export interface ContentFetcher {
  fetch(url: string): Promise<FetchResult>;
}

export type ContentFetcherProvider = 'readability' | 'apify';
