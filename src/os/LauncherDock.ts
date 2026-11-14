import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  type AppCategory,
  type AppDefinition,
  evaluateHorizontalSwipe,
  LAUNCHER_PAGE_SIZE,
  SpatialOSState,
  WINDOW_SCALE_STEP,
} from './SpatialOSState';
import {
  createSpatialButton,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
} from './SpatialWindow';
import {soundFX} from '../utils/SoundFX';

const _localHit = new THREE.Vector3();

const CATEGORIES: ReadonlyArray<{id: AppCategory; label: string}> = [
  {id: 'all', label: 'Все'},
  {id: 'apps', label: 'Приложения'},
  {id: 'games', label: 'Игры'},
  {id: 'tools', label: 'Инструменты'},
];

interface AppTileSlot {
  button: xb.UIButton;
  iconPanel: xb.UIPanel;
  icon: xb.UIIcon;
  titleText: xb.UIText;
  subtitleText: xb.UIText;
  openDot: xb.UIPanel;
  currentApp?: AppDefinition;
}

export interface LauncherDockCallbacks {
  onLaunchApp: (app: AppDefinition) => void;
  onCategoryChange: (category: AppCategory) => void;
  onPageChange: (direction: -1 | 1) => void;
  onHideLauncher: () => void;
}

export class LauncherDock extends xb.Script {
  readonly card: xb.UICard;
  readonly windowController: SpatialWindowController;
  private osState: SpatialOSState;
  private callbacks: LauncherDockCallbacks;
  private statusText: xb.UIText;
  private pageText: xb.UIText;
  private categoryButtons = new Map<AppCategory, xb.UIButton>();
  private tileSlots: AppTileSlot[] = [];
  private prevBtn: xb.UIButton;
  private nextBtn: xb.UIButton;
  private swipeStartLocalX: number | null = null;
  private swipeHandled = false;

  constructor(osState: SpatialOSState, callbacks: LauncherDockCallbacks) {
    super();
    this.osState = osState;
    this.callbacks = callbacks;

    this.statusText = new xb.UIText({
      text: 'Свайп влево/вправо или выбор приложения',
      pointerEvents: 'none',
      style: {fontSize: 13, color: '#7dd3fc'},
    });

    const compactBtnStyle: xb.UIStyle = {
      width: 32,
      height: 32,
      padding: 0,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    };

    const scaleDownBtn = new xb.UIButton({
      ariaLabel: 'Уменьшить меню',
      onClick: () => {
        soundFX.playTap();
        this.windowController.adjustScale(-WINDOW_SCALE_STEP);
      },
      style: compactBtnStyle,
      children: [
        new xb.UIText({
          text: '−',
          pointerEvents: 'none',
          style: {fontSize: 20, fontWeight: 'bold', color: '#ffffff', textAlign: 'center'},
        }),
      ],
    });

    const scaleUpBtn = new xb.UIButton({
      ariaLabel: 'Увеличить меню',
      onClick: () => {
        soundFX.playTap();
        this.windowController.adjustScale(WINDOW_SCALE_STEP);
      },
      style: compactBtnStyle,
      children: [
        new xb.UIText({
          text: '+',
          pointerEvents: 'none',
          style: {fontSize: 20, fontWeight: 'bold', color: '#ffffff', textAlign: 'center'},
        }),
      ],
    });

    const followIcon = new xb.UIIcon({
      icon: 'lock',
      pointerEvents: 'none',
      style: {width: 18, height: 18, color: '#ffffff'},
    });
    const followBtn = new xb.UIButton({
      ariaLabel: 'Следовать за мной: меню',
      onClick: () => {
        soundFX.playTap();
        const cam = xb.core.simulator?.getRenderCamera?.() ?? xb.core.camera;
        const next = this.windowController.toggleFollow(cam);
        this.setTrackingStatus(next ? 'Следует за вами' : 'Закреплено в комнате');
      },
      style: compactBtnStyle,
      children: [followIcon],
    });

    const closeBtn = new xb.UIButton({
      ariaLabel: 'Скрыть меню приложений',
      onClick: () => {
        soundFX.playTap();
        this.callbacks.onHideLauncher();
      },
      style: {
        ...compactBtnStyle,
        backgroundColor: 'rgba(244, 63, 94, 0.25)',
        borderColor: 'rgba(244, 63, 94, 0.5)',
      },
      children: [
        new xb.UIIcon({
          icon: 'close',
          pointerEvents: 'none',
          style: {width: 18, height: 18, color: '#ffffff'},
        }),
      ],
    });

    const topBar = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
      },
      children: [
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0},
          children: [
            new xb.UIText({
              text: 'FoldXR OS',
              style: {fontSize: 22, fontWeight: 'bold'},
            }),
            this.statusText,
          ],
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', alignItems: 'center', gap: 6},
          children: [scaleDownBtn, scaleUpBtn, followBtn, closeBtn],
        }),
      ],
    });

    const categoryRow = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: CATEGORIES.map((cat) => {
        const {button} = createSpatialButton({
          label: cat.label,
          fontSize: 14,
          style: {
            flexGrow: 1,
            height: 36,
            borderRadius: 18,
            paddingLeft: 8,
            paddingRight: 8,
          },
          onClick: () => {
            soundFX.playTap();
            this.callbacks.onCategoryChange(cat.id);
          },
        });
        this.categoryButtons.set(cat.id, button);
        return button;
      }),
    });

    for (let i = 0; i < LAUNCHER_PAGE_SIZE; i++) {
      this.tileSlots.push(this.createTileSlot(i));
    }

    const row1 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 10},
      children: this.tileSlots.slice(0, 3).map((s) => s.button),
    });
    const row2 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 10},
      children: this.tileSlots.slice(3, 6).map((s) => s.button),
    });

    this.prevBtn = createSpatialButton({
      label: 'Назад',
      icon: 'chevron_left',
      fontSize: 13,
      iconSize: 18,
      style: {height: 36, borderRadius: 18, paddingLeft: 12, paddingRight: 14},
      onClick: () => {
        soundFX.playSwipe(-1);
        this.callbacks.onPageChange(-1);
      },
    }).button;

    this.pageText = new xb.UIText({
      text: 'Стр. 1 / 2',
      pointerEvents: 'none',
      style: {
        flexGrow: 1,
        fontSize: 13,
        opacity: 0.82,
        textAlign: 'center',
      },
    });

    this.nextBtn = createSpatialButton({
      label: 'Далее',
      icon: 'chevron_right',
      iconPosition: 'right',
      fontSize: 13,
      iconSize: 18,
      style: {height: 36, borderRadius: 18, paddingLeft: 14, paddingRight: 12},
      onClick: () => {
        soundFX.playSwipe(1);
        this.callbacks.onPageChange(1);
      },
    }).button;

    const footerRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingTop: 2,
      },
      children: [this.prevBtn, this.pageText, this.nextBtn],
    });

    this.card = new xb.UICard({
      size: {width: 0.76, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 18,
      },
      children: [topBar, categoryRow, row1, row2, footerRow],
    });
    this.card.name = 'FoldXR App Launcher';
    this.windowController = new SpatialWindowController(this.card);
    this.windowController.bindFollowControl(followBtn, followIcon);
    this.add(this.card);
  }

  private createTileSlot(index: number): AppTileSlot {
    const icon = new xb.UIIcon({
      icon: 'apps',
      pointerEvents: 'none',
      style: {width: 26, height: 26, color: '#ffffff'},
    });
    const iconPanel = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: 46,
        height: 46,
        borderRadius: 14,
        backgroundColor: '#38bdf8',
        justifyContent: 'center',
        alignItems: 'center',
      },
      children: [icon],
    });
    const openDot = new xb.UIPanel({
      pointerEvents: 'none',
      visible: false,
      style: {
        position: 'absolute',
        top: 12,
        right: 18,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#4ade80',
      },
    });
    const titleText = new xb.UIText({
      text: `App ${index + 1}`,
      pointerEvents: 'none',
      style: {fontSize: 16, fontWeight: 'bold', textAlign: 'center'},
    });
    const subtitleText = new xb.UIText({
      text: 'Описание',
      pointerEvents: 'none',
      style: {fontSize: 12, opacity: 0.75, textAlign: 'center'},
    });

    const slot: AppTileSlot = {
      button: null as unknown as xb.UIButton,
      iconPanel,
      icon,
      titleText,
      subtitleText,
      openDot,
    };

    slot.button = new xb.UIButton({
      ariaLabel: `Открыть приложение ${index + 1}`,
      style: {
        flexGrow: 1,
        height: 112,
        borderRadius: 20,
        padding: 10,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
      },
      children: [openDot, iconPanel, titleText, subtitleText],
      onClick: () => {
        if (slot.currentApp) {
          soundFX.playWindowOpen();
          this.callbacks.onLaunchApp(slot.currentApp);
        }
      },
    });

    return slot;
  }

  init(): void {
    this.summonInFrontOfCamera(xb.core.camera);
    this.refresh();
  }

  summonInFrontOfCamera(camera: THREE.Camera): void {
    this.card.visible = true;
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: 1.06,
      angleRad: 0,
      heightOffset: 0.05,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  setTrackingStatus(status: string): void {
    this.statusText.text = `${status} • Свайп или перетаскивание`;
  }

  refresh(): void {
    const snap = this.osState.getSnapshot();
    for (const [catId, btn] of this.categoryButtons.entries()) {
      const active = snap.category === catId;
      btn.style.backgroundColor = active
        ? 'rgba(56, 189, 248, 0.38)'
        : 'rgba(255, 255, 255, 0.08)';
      btn.style.borderColor = active
        ? 'rgba(125, 211, 252, 0.85)'
        : 'rgba(255, 255, 255, 0.18)';
    }

    for (let i = 0; i < this.tileSlots.length; i++) {
      const slot = this.tileSlots[i];
      const app = snap.visibleApps[i];
      slot.currentApp = app;
      if (!app) {
        slot.button.visible = false;
        continue;
      }
      slot.button.visible = true;
      slot.button.ariaLabel = `Открыть ${app.title}`;
      slot.icon.icon = app.icon;
      slot.iconPanel.style.backgroundColor = app.accentColor;
      slot.titleText.text = app.title;
      slot.subtitleText.text = app.subtitle;
      const isOpen = snap.openAppIds.includes(app.id);
      slot.openDot.visible = isOpen;
      slot.button.style.borderColor = isOpen
        ? 'rgba(74, 222, 128, 0.72)'
        : 'rgba(255, 255, 255, 0.18)';
    }

    const multiPage = snap.totalPages > 1;
    this.prevBtn.disabled = !multiPage;
    this.nextBtn.disabled = !multiPage;
    this.pageText.text = multiPage
      ? `Стр. ${snap.page + 1} / ${snap.totalPages} • Свайп или ‹ ›`
      : `Категория: ${CATEGORIES.find((c) => c.id === snap.category)?.label ?? 'Все'}`;
  }

  onObjectSelectStart(event: xb.SelectEvent): void {
    if (!event.intersection?.point) return;
    _localHit.copy(event.intersection.point);
    this.card.worldToLocal(_localHit);
    this.swipeStartLocalX = _localHit.x;
    this.swipeHandled = false;
  }

  onSelecting(event: xb.SelectEvent): void {
    if (
      this.swipeStartLocalX === null ||
      this.swipeHandled ||
      !event.intersection?.point
    ) {
      return;
    }
    _localHit.copy(event.intersection.point);
    this.card.worldToLocal(_localHit);
    const deltaMeters = _localHit.x - this.swipeStartLocalX;
    const dir = evaluateHorizontalSwipe(deltaMeters, 0.06);
    if (dir !== 0) {
      this.swipeHandled = true;
      soundFX.playSwipe(dir);
      this.callbacks.onPageChange(dir);
    }
  }

  onObjectSelectEnd(): void {
    this.swipeStartLocalX = null;
    this.swipeHandled = false;
  }

  dispose(): void {
    this.windowController.dispose();
  }
}
