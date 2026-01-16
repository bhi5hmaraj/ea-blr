import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { ContentFetcher, FetchResult } from './types';
import { contentLogger } from '../../logger';

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
    contentLogger.debug({ url }, 'Fetching URL');

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'user-agent': DEFAULT_USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      contentLogger.error({ url, error: message }, 'Network fetch failed');
      throw new Error(`Network fetch failed for ${url}: ${message}`);
    }

    if (!response.ok) {
      contentLogger.error({
        url,
        status: response.status,
        statusText: response.statusText,
      }, 'HTTP error fetching URL');
      throw new Error(`HTTP ${response.status} (${response.statusText}) fetching ${url}`);
    }

    const contentType = response.headers.get('content-type');
    contentLogger.debug({ url, status: response.status, contentType }, 'Fetch successful');

    let html: string;
    try {
      html = await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({ url, error: message }, 'Failed to read response body');
      throw new Error(`Failed to read response body from ${url}: ${message}`);
    }

    contentLogger.debug({ url, htmlLength: html.length }, 'HTML received');

    // Check for common non-parseable content
    if (html.length < 100) {
      contentLogger.warn({ url, htmlLength: html.length }, 'HTML content too short');
      throw new Error(`HTML content too short (${html.length} bytes) from ${url}`);
    }

    let dom: JSDOM;
    try {
      dom = new JSDOM(html, { url });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({ url, error: message, htmlLength: html.length }, 'JSDOM parsing failed');
      throw new Error(`JSDOM failed to parse HTML from ${url}: ${message}`);
    }

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    // Extract metadata for fallback and result
    const docTitle = dom.window.document.title || null;
    const metaDesc = dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content');
    const ogTitle = dom.window.document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogDesc = dom.window.document.querySelector('meta[property="og:description"]')?.getAttribute('content');
    const ogSiteName = dom.window.document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');

    if (!article) {
      // Try fallback: use meta description if available (common for JS-rendered job boards)
      const fallbackContent = metaDesc || ogDesc;
      const fallbackTitle = ogTitle || docTitle;

      if (fallbackContent && fallbackContent.length > 100) {
        contentLogger.warn({
          url,
          htmlLength: html.length,
          fallbackSource: metaDesc ? 'meta-description' : 'og-description',
          fallbackLength: fallbackContent.length,
        }, 'Readability failed, using meta description fallback');

        // Format the fallback content as markdown
        const markdown = fallbackTitle
          ? `# ${fallbackTitle}\n\n${fallbackContent}`
          : fallbackContent;

        return {
          url,
          markdown: normalizeWhitespace(markdown),
          title: fallbackTitle,
          byline: null,
          excerpt: fallbackContent.slice(0, 200),
          siteName: ogSiteName ?? null,
          contentType,
        };
      }

      // No usable fallback - log and throw
      const bodyText = dom.window.document.body?.textContent?.slice(0, 200) || '(no body)';

      contentLogger.error({
        url,
        htmlLength: html.length,
        documentTitle: docTitle || '(no title)',
        metaDescription: metaDesc || null,
        bodyPreview: bodyText.replace(/\s+/g, ' ').trim(),
        contentType,
      }, 'Readability failed to extract article content');

      throw new Error(
        `Readability failed to parse article from ${url}. ` +
        `HTML length: ${html.length}, title: "${docTitle || '(no title)'}". ` +
        `The page may be JavaScript-rendered, require authentication, or have unusual structure.`
      );
    }

    let markdown: string;
    try {
      markdown = normalizeWhitespace(this.turndown.turndown(article.content));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      contentLogger.error({ url, error: message }, 'Turndown markdown conversion failed');
      throw new Error(`Markdown conversion failed for ${url}: ${message}`);
    }

    contentLogger.info({
      url,
      title: article.title,
      markdownLength: markdown.length,
      siteName: article.siteName,
    }, 'Article extracted successfully');

    return {
      url,
      markdown,
      title: article.title ?? docTitle ?? null,
      byline: article.byline ?? null,
      excerpt: article.excerpt ?? null,
      siteName: article.siteName ?? ogSiteName ?? null,
      contentType,
    };
  }
}
