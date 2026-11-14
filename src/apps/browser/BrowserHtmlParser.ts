import * as cheerio from 'cheerio';

export interface ParsedWebLink {
  readonly label: string;
  readonly url: string;
  readonly snippet?: string;
}

export interface ParsedWebPage {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly paragraphs: readonly string[];
  readonly links: readonly ParsedWebLink[];
}

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^fc00:/i,
  /^fe80:/i,
  /\.local$/i,
  /\.internal$/i,
];

/**
 * Validates that an external URL uses http/https and does not point at
 * loopback, link-local, or private network addresses.
 */
export function validateSafeExternalUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || PRIVATE_IP_PATTERNS.some((re) => re.test(host))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parses arbitrary HTML into clean title, description, readable content
 * paragraphs, and navigable absolute links for 3D spatial rendering.
 */
export function parseHtmlToReadablePage(
  html: string,
  baseUrl: string,
  maxParagraphs = 18,
  maxLinks = 10
): ParsedWebPage {
  const $ = cheerio.load(html);
  const rawTitle = collapseWhitespace($('title').first().text());
  const metaDesc = collapseWhitespace(
    $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
  );

  // Remove non-content tags before extracting text and links.
  $('script, style, noscript, svg, template, iframe, canvas').remove();

  const contentRoot = $('main, article, [role="main"]').first().length
    ? $('main, article, [role="main"]').first()
    : $('body');

  const paragraphs: string[] = [];
  const seenText = new Set<string>();

  contentRoot.find('h1, h2, h3, p, li, blockquote').each((_, el) => {
    if (paragraphs.length >= maxParagraphs) return false;
    const text = collapseWhitespace($(el).text());
    if (text.length < 24 || seenText.has(text)) return;
    seenText.add(text);
    const tag = el.tagName?.toLowerCase() ?? '';
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      paragraphs.push(`▸ ${text}`);
    } else if (tag === 'li') {
      paragraphs.push(`• ${text}`);
    } else {
      paragraphs.push(text);
    }
    return undefined;
  });

  if (paragraphs.length === 0) {
    const fallbackText = collapseWhitespace(contentRoot.text());
    if (fallbackText) {
      paragraphs.push(fallbackText.slice(0, 2400));
    }
  }

  const links: ParsedWebLink[] = [];
  const seenLinks = new Set<string>();
  $('a[href]').each((_, el) => {
    if (links.length >= maxLinks) return false;
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) {
      return;
    }
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (!validateSafeExternalUrl(resolved.href)) return;
    const label = collapseWhitespace($(el).text());
    if (label.length < 3 || label.length > 90) return;
    if (seenLinks.has(resolved.href)) return;
    seenLinks.add(resolved.href);
    links.push({label, url: resolved.href});
    return undefined;
  });

  return {
    url: baseUrl,
    title: rawTitle || new URL(baseUrl).hostname,
    description: metaDesc || `Страница ${new URL(baseUrl).hostname}`,
    paragraphs,
    links,
  };
}

/**
 * Parses DuckDuckGo HTML search results into clean result items.
 */
export function parseDuckDuckGoResults(
  html: string,
  maxResults = 8
): ParsedWebLink[] {
  const $ = cheerio.load(html);
  const results: ParsedWebLink[] = [];
  const seen = new Set<string>();

  $('.result').each((_, el) => {
    if (results.length >= maxResults) return false;
    const anchor = $(el).find('a.result__a').first();
    const rawHref = anchor.attr('href') || '';
    const title = collapseWhitespace(anchor.text());
    if (!rawHref || !title) return;

    let targetUrl = rawHref;
    try {
      const parsed = new URL(rawHref, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) targetUrl = uddg;
    } catch {
      // keep rawHref
    }

    if (!validateSafeExternalUrl(targetUrl) || seen.has(targetUrl)) return;
    seen.add(targetUrl);
    const snippet = collapseWhitespace($(el).find('.result__snippet').text());
    results.push({
      label: title,
      url: targetUrl,
      snippet: snippet || undefined,
    });
    return undefined;
  });

  return results;
}
