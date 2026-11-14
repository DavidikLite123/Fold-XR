import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  parseDuckDuckGoResults,
  parseHtmlToReadablePage,
  validateSafeExternalUrl,
  type ParsedWebLink,
} from './src/apps/browser/BrowserHtmlParser.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; SM-F956B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

async function searchWikipediaFallback(query: string): Promise<ParsedWebLink[]> {
  const hasCyrillic = /[а-яё]/i.test(query);
  const lang = hasCyrillic ? 'ru' : 'en';
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=6&format=json&utf8=1`;
  const resp = await fetch(apiUrl, {
    signal: AbortSignal.timeout(7000),
    headers: {'User-Agent': 'FoldXROS/1.0 (Spatial Browser)'},
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    query?: {
      search?: Array<{title: string; snippet?: string}>;
    };
  };
  const items = data.query?.search ?? [];
  return items.map((item) => {
    const slug = encodeURIComponent(item.title.replace(/\s+/g, '_'));
    const cleanSnippet = (item.snippet || '').replace(/<[^>]+>/g, '').trim();
    return {
      label: `${item.title} — Википедия`,
      url: `https://${lang}.wikipedia.org/wiki/${slug}`,
      snippet: cleanSnippet || undefined,
    };
  });
}

async function startServer() {
  const app = express();

  app.get('/api/browse', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const safeUrl = validateSafeExternalUrl(rawUrl);
    if (!safeUrl) {
      res.status(400).json({error: 'Некорректный или небезопасный URL'});
      return;
    }

    try {
      const upstream = await fetch(safeUrl.href, {
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const finalUrl = upstream.url || safeUrl.href;
      if (!validateSafeExternalUrl(finalUrl)) {
        res.status(403).json({error: 'Заблокирован редирект на внутренний адрес'});
        return;
      }

      if (!upstream.ok) {
        res.status(502).json({
          error: `Сайт ответил кодом ${upstream.status}`,
          url: finalUrl,
        });
        return;
      }

      const contentType = upstream.headers.get('content-type') || '';
      const rawBody = await upstream.text();

      if (contentType.includes('application/json')) {
        let formatted = rawBody.slice(0, 3000);
        try {
          formatted = JSON.stringify(JSON.parse(rawBody), null, 2).slice(0, 3000);
        } catch {
          // keep raw slice
        }
        res.json({
          url: finalUrl,
          title: new URL(finalUrl).hostname,
          description: 'JSON-ответ сервера',
          paragraphs: [formatted],
          links: [],
        });
        return;
      }

      if (contentType.includes('text/plain')) {
        res.json({
          url: finalUrl,
          title: new URL(finalUrl).hostname,
          description: 'Текстовый документ',
          paragraphs: [rawBody.slice(0, 3500)],
          links: [],
        });
        return;
      }

      const parsed = parseHtmlToReadablePage(rawBody, finalUrl);
      res.json(parsed);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Не удалось загрузить сайт';
      res.status(502).json({error: msg, url: safeUrl.href});
    }
  });

  app.get('/api/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      res.status(400).json({error: 'Пустой поисковый запрос'});
      return;
    }

    let results: ParsedWebLink[] = [];
    let source = 'DuckDuckGo';

    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(ddgUrl, {
        signal: AbortSignal.timeout(7000),
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
      });
      if (resp.ok) {
        const html = await resp.text();
        results = parseDuckDuckGoResults(html, 8);
      }
    } catch {
      // Fall through to Wikipedia search fallback
    }

    if (results.length === 0) {
      try {
        results = await searchWikipediaFallback(query);
        source = 'Wikipedia Search';
      } catch {
        results = [];
      }
    }

    res.json({
      query,
      source,
      results,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FoldXR OS server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
