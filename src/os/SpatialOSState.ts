export type AppCategory = 'all' | 'apps' | 'games' | 'tools';

export interface AppDefinition {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly category: Exclude<AppCategory, 'all'>;
  readonly accentColor: string;
}

export const APP_CATALOG: readonly AppDefinition[] = [
  {
    id: 'browser',
    title: 'Браузер',
    subtitle: 'Веб-поиск и статьи в 3D',
    icon: 'public',
    category: 'apps',
    accentColor: '#38bdf8',
  },
  {
    id: 'cosmic-blaster',
    title: 'Космо-Шутер',
    subtitle: '3D-аркада в комнате',
    icon: 'rocket_launch',
    category: 'games',
    accentColor: '#f43f5e',
  },
  {
    id: 'memory-matrix',
    title: 'Матрица 3D',
    subtitle: 'Память и реакция',
    icon: 'grid_view',
    category: 'games',
    accentColor: '#a855f7',
  },
  {
    id: 'notes',
    title: 'Заметки',
    subtitle: '3D-стикеры в воздухе',
    icon: 'edit_note',
    category: 'tools',
    accentColor: '#f59e0b',
  },
  {
    id: 'calculator',
    title: 'Калькулятор',
    subtitle: 'Быстрые расчёты',
    icon: 'calculate',
    category: 'tools',
    accentColor: '#10b981',
  },
  {
    id: 'gallery',
    title: '3D-Галерея',
    subtitle: 'Объёмные модели',
    icon: 'view_in_ar',
    category: 'apps',
    accentColor: '#6366f1',
  },
  {
    id: 'weather-clock',
    title: 'Погода и Время',
    subtitle: 'Мировые часы и прогноз',
    icon: 'wb_sunny',
    category: 'apps',
    accentColor: '#0ea5e9',
  },
  {
    id: 'synth-pad',
    title: 'Синтезатор',
    subtitle: 'Музыкальные пэды',
    icon: 'music_note',
    category: 'apps',
    accentColor: '#ec4899',
  },
  {
    id: 'gesture-lab',
    title: 'Экран и Жесты',
    subtitle: 'Гироскоп и размер окон',
    icon: 'tune',
    category: 'tools',
    accentColor: '#14b8a6',
  },
];

export const MIN_WINDOW_SCALE = 0.55;
export const MAX_WINDOW_SCALE = 1.45;
export const WINDOW_SCALE_STEP = 0.15;

export function clampWindowScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  const clamped = Math.max(MIN_WINDOW_SCALE, Math.min(MAX_WINDOW_SCALE, scale));
  return Math.round(clamped * 100) / 100;
}

export function getResponsiveBaseScale(
  viewportWidth: number,
  viewportHeight: number
): number {
  const minSide = Math.min(viewportWidth, viewportHeight);
  if (!Number.isFinite(minSide) || minSide <= 0) return 1;
  if (minSide < 620) return 0.78;
  if (minSide < 840) return 0.86;
  return 1;
}

export const LAUNCHER_PAGE_SIZE = 6;

export const THEME_PRESETS = [
  {id: 'grayGlass', label: 'Vision Glass'},
  {id: 'glimmer', label: 'Android Glimmer'},
  {id: 'colorful', label: 'Неон'},
  {id: 'highContrast', label: 'Контраст'},
] as const;

export type SpatialThemeId = (typeof THEME_PRESETS)[number]['id'];

export interface SpatialOSStateSnapshot {
  category: AppCategory;
  page: number;
  totalPages: number;
  visibleApps: readonly AppDefinition[];
  openAppIds: readonly string[];
  launcherVisible: boolean;
  dockPinnedToHead: boolean;
  themeIndex: number;
}

export class SpatialOSState {
  category: AppCategory = 'all';
  page = 0;
  launcherVisible = true;
  dockPinnedToHead = false;
  themeIndex = 0;
  private readonly openIds = new Set<string>();

  getFilteredApps(category: AppCategory = this.category): AppDefinition[] {
    if (category === 'all') return [...APP_CATALOG];
    return APP_CATALOG.filter((app) => app.category === category);
  }

  getTotalPages(category: AppCategory = this.category): number {
    const count = this.getFilteredApps(category).length;
    return Math.max(1, Math.ceil(count / LAUNCHER_PAGE_SIZE));
  }

  getVisibleApps(): AppDefinition[] {
    const filtered = this.getFilteredApps();
    const totalPages = this.getTotalPages();
    const clampedPage = Math.max(0, Math.min(this.page, totalPages - 1));
    const start = clampedPage * LAUNCHER_PAGE_SIZE;
    return filtered.slice(start, start + LAUNCHER_PAGE_SIZE);
  }

  setCategory(category: AppCategory): void {
    this.category = category;
    this.page = 0;
  }

  setPage(page: number): boolean {
    const total = this.getTotalPages();
    const next = Math.max(0, Math.min(page, total - 1));
    if (next === this.page) return false;
    this.page = next;
    return true;
  }

  nextPage(): boolean {
    const total = this.getTotalPages();
    if (total <= 1) return false;
    this.page = (this.page + 1) % total;
    return true;
  }

  prevPage(): boolean {
    const total = this.getTotalPages();
    if (total <= 1) return false;
    this.page = (this.page - 1 + total) % total;
    return true;
  }

  markAppOpened(appId: string): void {
    this.openIds.add(appId);
  }

  markAppClosed(appId: string): void {
    this.openIds.delete(appId);
  }

  isAppOpen(appId: string): boolean {
    return this.openIds.has(appId);
  }

  getOpenAppIds(): string[] {
    return [...this.openIds];
  }

  clearOpenApps(): void {
    this.openIds.clear();
  }

  cycleTheme(): (typeof THEME_PRESETS)[number] {
    this.themeIndex = (this.themeIndex + 1) % THEME_PRESETS.length;
    return THEME_PRESETS[this.themeIndex];
  }

  getCurrentTheme(): (typeof THEME_PRESETS)[number] {
    return THEME_PRESETS[this.themeIndex];
  }

  getSnapshot(): SpatialOSStateSnapshot {
    return {
      category: this.category,
      page: this.page,
      totalPages: this.getTotalPages(),
      visibleApps: this.getVisibleApps(),
      openAppIds: this.getOpenAppIds(),
      launcherVisible: this.launcherVisible,
      dockPinnedToHead: this.dockPinnedToHead,
      themeIndex: this.themeIndex,
    };
  }
}

/**
 * Evaluates a horizontal swipe delta (in pixels or normalized units).
 * Swiping left (negative deltaX) advances to the next page (+1).
 * Swiping right (positive deltaX) returns to the previous page (-1).
 */
export function evaluateHorizontalSwipe(
  deltaX: number,
  threshold = 45
): -1 | 0 | 1 {
  if (!Number.isFinite(deltaX) || Math.abs(deltaX) < threshold) return 0;
  return deltaX < 0 ? 1 : -1;
}

export interface WindowPlacementOffset {
  angleRad: number;
  distance: number;
  heightOffset: number;
}

/**
 * Computes non-overlapping world-space arc offsets around the user so multiple
 * dragged/opened windows stay clearly separated in the room.
 */
export function computeWindowArcSlot(slotIndex: number): WindowPlacementOffset {
  const slots: readonly WindowPlacementOffset[] = [
    {angleRad: 0, distance: 1.08, heightOffset: 0.04},
    {angleRad: -0.62, distance: 1.16, heightOffset: 0.05},
    {angleRad: 0.62, distance: 1.16, heightOffset: 0.05},
    {angleRad: -1.04, distance: 1.24, heightOffset: 0.02},
    {angleRad: 1.04, distance: 1.24, heightOffset: 0.02},
    {angleRad: -0.32, distance: 1.02, heightOffset: -0.14},
    {angleRad: 0.32, distance: 1.02, heightOffset: -0.14},
  ];
  const normalized = ((slotIndex % slots.length) + slots.length) % slots.length;
  return slots[normalized];
}
