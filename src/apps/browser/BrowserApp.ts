import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  BROWSER_BOOKMARKS,
  BrowserHistory,
  type BrowserLink,
  type BrowserPageContent,
  getBuiltinPage,
} from './BrowserLogic';
import {
  createSpatialButton,
  createWindowHeader,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
  type SpatialAppInstance,
} from '../../os/SpatialWindow';
import {computeWindowArcSlot} from '../../os/SpatialOSState';
import {soundFX} from '../../utils/SoundFX';

const MAX_RENDERED_LINKS = 8;

interface LinkSlot {
  button: xb.UIButton;
  labelText: xb.UIText;
  urlText: xb.UIText;
  targetUrl?: string;
}

export class BrowserApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'browser';
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private history = new BrowserHistory();
  private addressInput: xb.UITextInput;
  private backBtn: xb.UIButton;
  private forwardBtn: xb.UIButton;
  private externalBtn: xb.UIButton;
  private pageTitle: xb.UIText;
  private pageMeta: xb.UIText;
  private pageBody: xb.UIText;
  private linksHeading: xb.UIText;
  private linkSlots: LinkSlot[] = [];
  private scrollView: xb.UIScrollView;
  private currentPage?: BrowserPageContent;
  private currentExternalUrl?: string;
  private webModal: HTMLDivElement | null = null;
  private loadSeq = 0;
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;

    this.backBtn = new xb.UIButton({
      ariaLabel: 'Назад',
      disabled: true,
      onClick: () => {
        soundFX.playTap();
        const prev = this.history.back();
        if (prev) void this.loadUrl(prev, false);
      },
      style: {width: 36, height: 36, paddingLeft: 0, paddingRight: 0, borderRadius: 18},
      children: [
        new xb.UIIcon({
          icon: 'arrow_back',
          pointerEvents: 'none',
          style: {width: 18, height: 18, color: '#ffffff'},
        }),
      ],
    });

    this.forwardBtn = new xb.UIButton({
      ariaLabel: 'Вперёд',
      disabled: true,
      onClick: () => {
        soundFX.playTap();
        const next = this.history.forward();
        if (next) void this.loadUrl(next, false);
      },
      style: {width: 36, height: 36, paddingLeft: 0, paddingRight: 0, borderRadius: 18},
      children: [
        new xb.UIIcon({
          icon: 'arrow_forward',
          pointerEvents: 'none',
          style: {width: 18, height: 18, color: '#ffffff'},
        }),
      ],
    });

    const reloadBtn = new xb.UIButton({
      ariaLabel: 'Обновить страницу',
      onClick: () => {
        soundFX.playTap();
        void this.loadUrl(this.history.currentUrl, false);
      },
      style: {width: 36, height: 36, paddingLeft: 0, paddingRight: 0, borderRadius: 18},
      children: [
        new xb.UIIcon({
          icon: 'refresh',
          pointerEvents: 'none',
          style: {width: 18, height: 18, color: '#ffffff'},
        }),
      ],
    });

    this.addressInput = new xb.UITextInput({
      ariaLabel: 'Адресная строка браузера',
      value: 'foldxr://home',
      placeholder: 'URL (habr.com) или поиск...',
      style: {
        flexGrow: 1,
        height: 36,
        minHeight: 36,
        fontSize: 14,
        borderRadius: 18,
        paddingLeft: 12,
        paddingRight: 12,
      },
      onSubmit: (value) => {
        soundFX.playTap();
        void this.loadUrl(value, true);
      },
    });

    const goBtn = createSpatialButton({
      label: 'Поиск',
      icon: 'search',
      fontSize: 13,
      iconSize: 17,
      style: {height: 36, borderRadius: 18, paddingLeft: 12, paddingRight: 12},
      onClick: () => {
        soundFX.playTap();
        void this.loadUrl(this.addressInput.value, true);
      },
    }).button;

    this.externalBtn = createSpatialButton({
      label: '2D',
      icon: 'open_in_new',
      fontSize: 13,
      iconSize: 16,
      disabled: true,
      style: {height: 36, borderRadius: 18, paddingLeft: 10, paddingRight: 10},
      onClick: () => {
        soundFX.playTap();
        if (this.currentExternalUrl) {
          this.open2DWebModal(this.currentExternalUrl, this.currentPage);
        }
      },
    }).button;

    const toolbar = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      },
      children: [
        this.backBtn,
        this.forwardBtn,
        reloadBtn,
        this.addressInput,
        goBtn,
        this.externalBtn,
      ],
    });

    const bookmarksBar = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      },
      children: BROWSER_BOOKMARKS.map(
        (bm) =>
          createSpatialButton({
            label: bm.label,
            fontSize: 13,
            style: {
              flexGrow: 1,
              height: 32,
              borderRadius: 15,
              paddingLeft: 8,
              paddingRight: 8,
            },
            onClick: () => {
              soundFX.playTap();
              void this.loadUrl(bm.url, true);
            },
          }).button
      ),
    });

    this.pageTitle = new xb.UIText({
      text: 'FoldXR Браузер',
      style: {fontSize: 20, fontWeight: 'bold', lineHeight: 1.25},
    });
    this.pageMeta = new xb.UIText({
      text: 'Готово',
      style: {fontSize: 12, opacity: 0.78, color: '#7dd3fc'},
    });
    this.pageBody = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        fontSize: 15,
        lineHeight: 1.45,
        whiteSpace: 'pre-line',
      },
    });

    this.linksHeading = new xb.UIText({
      text: 'Ссылки (нажмите для перехода):',
      visible: false,
      style: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#38bdf8',
        paddingTop: 6,
      },
    });

    for (let i = 0; i < MAX_RENDERED_LINKS; i++) {
      this.linkSlots.push(this.createLinkSlot());
    }

    this.scrollView = new xb.UIScrollView({
      ariaLabel: 'Содержимое веб-страницы',
      style: {
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 160,
        padding: 14,
        borderRadius: 18,
        backgroundColor: 'rgba(10, 16, 28, 0.62)',
        gap: 8,
      },
      children: [
        this.pageTitle,
        this.pageMeta,
        this.pageBody,
        this.linksHeading,
        ...this.linkSlots.map((s) => s.button),
      ],
    });

    this.card = new xb.UICard({
      size: {width: 0.76, height: 0.56},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 16,
      },
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card);

    const header = createWindowHeader({
      title: 'Браузер',
      icon: 'public',
      accentColor: '#0284c7',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(header, toolbar, bookmarksBar, this.scrollView);
    this.card.name = 'Browser window';
    this.add(this.card);

    (
      window as unknown as {
        __foldXrBrowserDebug?: {
          navigate: (input: string) => Promise<void>;
          clickLink: (index: number) => Promise<void>;
          getState: () => {
            url: string;
            title: string;
            meta: string;
            linksCount: number;
            firstLinkUrl?: string;
          };
        };
      }
    ).__foldXrBrowserDebug = {
      navigate: async (input: string) => {
        await this.loadUrl(input, true);
      },
      clickLink: async (index: number) => {
        const slot = this.linkSlots[index];
        if (slot?.targetUrl) {
          await this.loadUrl(slot.targetUrl, true);
        }
      },
      getState: () => ({
        url: this.history.currentUrl,
        title: this.pageTitle.text,
        meta: this.pageMeta.text,
        linksCount: this.linkSlots.filter((s) => s.button.visible).length,
        firstLinkUrl: this.linkSlots[0]?.targetUrl,
      }),
    };
  }

  private createLinkSlot(): LinkSlot {
    const labelText = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#e0f2fe',
        textAlign: 'left',
        width: '100%',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      },
    });
    const urlText = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {
        fontSize: 11,
        color: '#7dd3fc',
        opacity: 0.8,
        textAlign: 'left',
        width: '100%',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      },
    });

    const slot: LinkSlot = {
      button: null as unknown as xb.UIButton,
      labelText,
      urlText,
    };

    slot.button = new xb.UIButton({
      ariaLabel: 'Открыть ссылку',
      visible: false,
      style: {
        width: '100%',
        height: 58,
        minHeight: 58,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(56, 189, 248, 0.14)',
        borderColor: 'rgba(56, 189, 248, 0.35)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        overflow: 'hidden',
      },
      children: [
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 2,
            overflow: 'hidden',
          },
          children: [labelText, urlText],
        }),
        new xb.UIIcon({
          icon: 'arrow_forward',
          pointerEvents: 'none',
          style: {width: 18, height: 18, color: '#bae6fd'},
        }),
      ],
      onClick: () => {
        if (slot.targetUrl) {
          soundFX.playTap();
          void this.loadUrl(slot.targetUrl, true);
        }
      },
    });

    return slot;
  }

  init(): void {
    this.recenter(xb.core.camera, 0);
    void this.loadUrl('foldxr://home', false);
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 0): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: slot.distance,
      angleRad: slot.angleRad,
      heightOffset: slot.heightOffset,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  async loadUrl(rawUrl: string, pushHistory: boolean): Promise<void> {
    const seq = ++this.loadSeq;
    const targetUrl = pushHistory ? this.history.push(rawUrl) : rawUrl;
    this.addressInput.value = targetUrl;
    this.backBtn.disabled = !this.history.canGoBack;
    this.forwardBtn.disabled = !this.history.canGoForward;
    this.scrollView.scrollTo(0);

    const builtin = getBuiltinPage(targetUrl);
    if (builtin) {
      this.renderPage(builtin);
      return;
    }

    if (targetUrl.startsWith('search://')) {
      const query = decodeURIComponent(targetUrl.slice('search://'.length));
      this.renderLoading(`Поиск: ${query}`, 'Выполняется веб-поиск...');
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (seq !== this.loadSeq) return;
        const data = (await resp.json()) as {
          source?: string;
          results?: BrowserLink[];
          error?: string;
        };
        if (!resp.ok || data.error) {
          throw new Error(data.error || `HTTP ${resp.status}`);
        }
        const results = data.results ?? [];
        const sections =
          results.length > 0
            ? results
                .slice(0, 6)
                .map((r, i) => `${i + 1}. ${r.label}${r.snippet ? `\n${r.snippet}` : ''}`)
            : ['По вашему запросу ничего не найдено. Попробуйте другой запрос.'];

        this.renderPage({
          url: targetUrl,
          title: `Результаты поиска: «${query}»`,
          summary: `Источник: ${data.source || 'Веб-поиск'} • Найдено: ${results.length}`,
          sections,
          links: results,
          isLiveFetched: true,
        });
      } catch (err) {
        if (seq !== this.loadSeq) return;
        this.renderPage({
          url: targetUrl,
          title: `Поиск: ${query}`,
          summary: 'Ошибка поиска',
          sections: [
            err instanceof Error ? err.message : 'Не удалось выполнить поиск.',
          ],
        });
      }
      return;
    }

    // Live external HTTP/HTTPS webpage through server-side /api/browse
    const cleanUrl = targetUrl.startsWith('wiki://')
      ? `https://ru.wikipedia.org/wiki/${targetUrl.slice('wiki://'.length)}`
      : targetUrl;

    this.currentExternalUrl = cleanUrl;
    this.externalBtn.disabled = false;
    this.renderLoading(cleanUrl, 'Загрузка реальной веб-страницы...');

    try {
      const resp = await fetch(`/api/browse?url=${encodeURIComponent(cleanUrl)}`);
      if (seq !== this.loadSeq) return;
      const data = (await resp.json()) as {
        url?: string;
        title?: string;
        description?: string;
        paragraphs?: string[];
        links?: BrowserLink[];
        error?: string;
      };
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const resolvedUrl = data.url || cleanUrl;
      this.addressInput.value = resolvedUrl;
      this.renderPage({
        url: resolvedUrl,
        title: data.title || resolvedUrl,
        summary: data.description || resolvedUrl,
        sections:
          data.paragraphs && data.paragraphs.length > 0
            ? data.paragraphs
            : ['Текстовое содержимое страницы пусто. Попробуйте открыть в 2D.'],
        links: data.links ?? [],
        externalUrl: resolvedUrl,
        isLiveFetched: true,
      });
    } catch (err) {
      if (seq !== this.loadSeq) return;
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      this.renderPage({
        url: cleanUrl,
        title: cleanUrl,
        summary: 'Не удалось загрузить страницу',
        sections: [
          `Ошибка: ${msg}`,
          'Некоторые сайты блокируют серверные запросы — вы можете попробовать нажать кнопку «2D» сверху или ввести поисковый запрос.',
        ],
        externalUrl: cleanUrl,
      });
    }
  }

  private renderLoading(title: string, meta: string): void {
    this.pageTitle.text = title;
    this.pageMeta.text = meta;
    this.pageBody.text = 'Подождите, загружаем содержимое из сети...';
    this.linksHeading.visible = false;
    for (const slot of this.linkSlots) {
      slot.button.visible = false;
      slot.targetUrl = undefined;
    }
  }

  private renderPage(page: BrowserPageContent): void {
    this.currentPage = page;
    this.pageTitle.text = page.title;
    this.pageMeta.text = page.isLiveFetched
      ? `Онлайн • ${page.summary}`
      : page.summary;
    this.pageBody.text = page.sections.join('\n\n');
    this.currentExternalUrl = page.externalUrl;
    this.externalBtn.disabled = !page.externalUrl;

    const links = page.links ?? [];
    this.linksHeading.visible = links.length > 0;
    for (let i = 0; i < this.linkSlots.length; i++) {
      const slot = this.linkSlots[i];
      const item = links[i];
      if (!item) {
        slot.button.visible = false;
        slot.targetUrl = undefined;
        continue;
      }
      slot.targetUrl = item.url;
      slot.labelText.text = item.label;
      slot.urlText.text = item.url;
      slot.button.ariaLabel = `Перейти: ${item.label}`;
      slot.button.visible = true;
    }

    document.body.dataset.browserUrl = page.url;
    document.body.dataset.browserTitle = page.title;
    document.body.dataset.browserLinks = String(Math.min(links.length, MAX_RENDERED_LINKS));
  }

  private open2DWebModal(url: string, page?: BrowserPageContent): void {
    if (this.webModal) this.webModal.remove();
    const modal = document.createElement('div');
    modal.className = 'foldxr-web-modal';

    const bar = document.createElement('div');
    bar.className = 'foldxr-web-modal-bar';

    const title = document.createElement('span');
    title.className = 'foldxr-web-modal-title';
    title.textContent = url;

    let showingIframe = false;
    const toggleViewBtn = document.createElement('button');
    toggleViewBtn.className = 'foldxr-web-modal-close';
    toggleViewBtn.type = 'button';
    toggleViewBtn.textContent = 'Режим Iframe';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'foldxr-web-modal-close';
    closeBtn.type = 'button';
    closeBtn.textContent = 'Закрыть';
    closeBtn.onclick = () => {
      modal.remove();
      this.webModal = null;
    };

    const reader = document.createElement('div');
    reader.className = 'foldxr-web-modal-reader';
    const h2 = document.createElement('h2');
    h2.textContent = page?.title || url;
    reader.appendChild(h2);

    for (const para of page?.sections ?? []) {
      const p = document.createElement('p');
      p.textContent = para;
      reader.appendChild(p);
    }

    if (page?.links && page.links.length > 0) {
      const linksBox = document.createElement('div');
      linksBox.className = 'foldxr-web-modal-links';
      for (const item of page.links) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'foldxr-web-modal-link';
        btn.textContent = `${item.label} — ${item.url}`;
        btn.onclick = () => {
          modal.remove();
          this.webModal = null;
          void this.loadUrl(item.url, true);
        };
        linksBox.appendChild(btn);
      }
      reader.appendChild(linksBox);
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'foldxr-web-modal-frame';
    iframe.style.display = 'none';
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-popups'
    );

    toggleViewBtn.onclick = () => {
      showingIframe = !showingIframe;
      if (showingIframe) {
        if (!iframe.src) iframe.src = url;
        reader.style.display = 'none';
        iframe.style.display = 'block';
        toggleViewBtn.textContent = 'Режим чтения';
      } else {
        iframe.style.display = 'none';
        reader.style.display = 'block';
        toggleViewBtn.textContent = 'Режим Iframe';
      }
    };

    bar.append(title, toggleViewBtn, closeBtn);
    modal.append(bar, reader, iframe);
    document.body.appendChild(modal);
    this.webModal = modal;
  }

  dispose(): void {
    this.windowController.dispose();
    this.webModal?.remove();
    this.webModal = null;
  }
}
