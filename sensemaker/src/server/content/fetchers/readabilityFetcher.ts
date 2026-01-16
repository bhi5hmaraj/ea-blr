import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { ContentFetcher, FetchResult } from './types';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function normalizeWhitespace(markdown: string): string {
  return markdown.replace(/\n{3,}/g, '\n\n').trim();
}

export class ReadabilityFetcher implements ContentFetcher {
  private readonly turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
  }

  async fetch(url: string): Promise<FetchResult> {
    const response = await fetch(url, {
      headers: {
        'user-agent': DEFAULT_USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch url: ${response.status}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      throw new Error('Readability failed to parse article');
    }

    const markdown = normalizeWhitespace(this.turndown.turndown(article.content));

    return {
      url,
      markdown,
      title: article.title ?? dom.window.document.title ?? null,
      byline: article.byline ?? null,
      excerpt: article.excerpt ?? null,
      siteName: article.siteName ?? null,
      contentType: response.headers.get('content-type'),
    };
  }
}
