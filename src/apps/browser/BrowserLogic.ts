export interface BrowserBookmark {
  readonly id: string;
  readonly label: string;
  readonly url: string;
}

export interface BrowserLink {
  readonly label: string;
  readonly url: string;
  readonly snippet?: string;
}

export interface BrowserPageContent {
  readonly url: string;
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly string[];
  readonly links?: readonly BrowserLink[];
  readonly externalUrl?: string;
  readonly isLiveFetched?: boolean;
}

export const BROWSER_BOOKMARKS: readonly BrowserBookmark[] = [
  {id: 'home', label: 'Главная', url: 'foldxr://home'},
  {id: 'search', label: 'Поиск', url: 'search://WebXR Android XR'},
  {id: 'wiki', label: 'Вики', url: 'https://ru.wikipedia.org/wiki/Смешанная_реальность'},
  {id: 'habr', label: 'Habr', url: 'https://habr.com/ru/news/'},
  {id: 'threejs', label: 'Three.js', url: 'https://threejs.org'},
];

const BUILTIN_PAGES: Record<string, BrowserPageContent> = {
  'foldxr://home': {
    url: 'foldxr://home',
    title: 'FoldXR Браузер — Живой веб в 3D',
    summary:
      'Настоящий пространственный браузер: открывает реальные сайты, ищет в интернете и переходит по ссылкам прямо в AR/XR-окне.',
    sections: [
      '• Введите любой URL (например: habr.com, wikipedia.org, threejs.org) или любой поисковый запрос сверху.',
      '• Сервер загружает реальную страницу, извлекает текст и кликабельные ссылки — нажимайте на ссылки ниже, чтобы путешествовать по сайтам в 3D.',
      '• Используйте кнопки «−» / «+» в заголовке окна для изменения размера и «⌖» чтобы окно следовало за вами.',
    ],
    links: [
      {
        label: 'Википедия: WebXR и смешанная реальность',
        url: 'https://ru.wikipedia.org/wiki/Смешанная_реальность',
      },
      {
        label: 'Новости IT на Habr',
        url: 'https://habr.com/ru/news/',
      },
      {
        label: 'Three.js — 3D-движок для веба',
        url: 'https://threejs.org',
      },
      {
        label: 'Поиск: новости Samsung Galaxy Fold',
        url: 'search://Samsung Galaxy Z Fold',
      },
    ],
  },
};

export function normalizeBrowserInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return 'foldxr://home';
  if (
    trimmed.startsWith('foldxr://') ||
    trimmed.startsWith('search://') ||
    trimmed.startsWith('wiki://')
  ) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `search://${encodeURIComponent(trimmed)}`;
}

export function getBuiltinPage(url: string): BrowserPageContent | undefined {
  return BUILTIN_PAGES[url];
}

export function buildWikipediaSummaryEndpoint(topic: string): {
  apiUrl: string;
  externalUrl: string;
  displayTopic: string;
} {
  const decoded = decodeURIComponent(topic).replace(/_/g, ' ').trim();
  const hasCyrillic = /[а-яё]/i.test(decoded);
  const lang = hasCyrillic ? 'ru' : 'en';
  const slug = encodeURIComponent(decoded.replace(/\s+/g, '_'));
  return {
    apiUrl: `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`,
    externalUrl: `https://${lang}.wikipedia.org/wiki/${slug}`,
    displayTopic: decoded,
  };
}

export class BrowserHistory {
  private entries: string[] = ['foldxr://home'];
  private cursor = 0;

  get currentUrl(): string {
    return this.entries[this.cursor];
  }

  get canGoBack(): boolean {
    return this.cursor > 0;
  }

  get canGoForward(): boolean {
    return this.cursor < this.entries.length - 1;
  }

  push(url: string): string {
    const normalized = normalizeBrowserInput(url);
    if (normalized === this.currentUrl) return normalized;
    this.entries = this.entries.slice(0, this.cursor + 1);
    this.entries.push(normalized);
    this.cursor = this.entries.length - 1;
    return normalized;
  }

  back(): string | null {
    if (!this.canGoBack) return null;
    this.cursor--;
    return this.currentUrl;
  }

  forward(): string | null {
    if (!this.canGoForward) return null;
    this.cursor++;
    return this.currentUrl;
  }
}
