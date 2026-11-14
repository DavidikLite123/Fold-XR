import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  type AppDefinition,
  evaluateHorizontalSwipe,
  SpatialOSState,
  type SpatialThemeId,
} from './SpatialOSState';
import {LauncherDock} from './LauncherDock';
import {SpatialDockBar} from './SpatialDockBar';
import {MotionGestureBridge} from './MotionGestureBridge';
import type {SpatialAppInstance} from './SpatialWindow';
import {BrowserApp} from '../apps/browser/BrowserApp';
import {CosmicBlasterApp} from '../apps/games/CosmicBlasterApp';
import {MemoryMatrixApp} from '../apps/games/MemoryMatrixApp';
import {NotesApp} from '../apps/notes/NotesApp';
import {CalculatorApp} from '../apps/calculator/CalculatorApp';
import {GalleryApp} from '../apps/gallery/GalleryApp';
import {ClockWeatherApp} from '../apps/weather/ClockWeatherApp';
import {SynthPadApp} from '../apps/synth/SynthPadApp';
import {GestureLabApp} from '../apps/gesturelab/GestureLabApp';
import {soundFX} from '../utils/SoundFX';

export class SpatialOSManager extends xb.Script {
  private osState = new SpatialOSState();
  private launcher!: LauncherDock;
  private dockBar!: SpatialDockBar;
  private motionBridge!: MotionGestureBridge;
  private openApps = new Map<string, SpatialAppInstance>();
  private trackingStatus = 'Готово';
  private touchSwipeStart: {x: number; y: number; active: boolean} | null = null;

  init(): void {
    this.setupLighting();

    this.launcher = new LauncherDock(this.osState, {
      onLaunchApp: (app) => this.openOrFocusApp(app),
      onCategoryChange: (cat) => {
        this.osState.setCategory(cat);
        this.launcher.refresh();
        this.syncDiagnosticAttributes();
      },
      onPageChange: (dir) => this.handlePageChange(dir),
      onHideLauncher: () => {
        this.osState.launcherVisible = false;
        this.launcher.card.visible = false;
        this.syncDiagnosticAttributes();
      },
    });
    this.add(this.launcher);

    this.dockBar = new SpatialDockBar({
      onToggleLauncher: () => {
        const nextVisible = !this.launcher.card.visible;
        this.osState.launcherVisible = nextVisible;
        if (nextVisible) {
          this.launcher.summonInFrontOfCamera(this.getActiveCamera());
          this.launcher.refresh();
        } else {
          this.launcher.card.visible = false;
        }
        this.syncDiagnosticAttributes();
      },
      onRecenterAll: () => {
        const cam = this.getActiveCamera();
        this.launcher.summonInFrontOfCamera(cam);
        this.osState.launcherVisible = true;
        this.dockBar.summonInFrontOfCamera(cam);
        let slot = 0;
        for (const app of this.openApps.values()) {
          app.recenter(cam, slot++);
        }
        this.syncDiagnosticAttributes();
      },
      onToggleFollowAll: () => {
        const next = !this.osState.dockPinnedToHead;
        this.osState.dockPinnedToHead = next;
        const cam = this.getActiveCamera();
        this.launcher.windowController.setFollow(next, cam);
        for (const app of this.openApps.values()) {
          app.getWindowController?.().setFollow(next, cam);
        }
        this.setTrackingStatus(
          next ? 'Интерфейс следует за вами' : 'Окна закреплены в комнате'
        );
        this.syncDiagnosticAttributes();
        return next;
      },
      onAdjustGlobalScale: (delta) => {
        const nextScale = this.launcher.windowController.adjustScale(delta);
        this.dockBar.windowController.adjustScale(delta);
        for (const app of this.openApps.values()) {
          app.getWindowController?.().adjustScale(delta);
        }
        this.setTrackingStatus(`Масштаб: ${Math.round(nextScale * 100)}%`);
        this.syncDiagnosticAttributes();
      },
      onCycleTheme: () => {
        const theme = this.osState.cycleTheme();
        xb.ui.theme = theme.id as SpatialThemeId;
        return theme.label;
      },
      onCloseAll: () => this.closeAllApps(),
    });
    this.add(this.dockBar);

    this.motionBridge = new MotionGestureBridge({
      onSwipePage: (dir, label) => this.handlePageChange(dir, label),
      onSummonLauncher: (label) => {
        soundFX.playWindowOpen();
        this.osState.launcherVisible = true;
        this.launcher.summonInFrontOfCamera(this.getActiveCamera());
        this.launcher.refresh();
        this.setTrackingStatus(label);
      },
      onTrackingStatus: (status) => this.setTrackingStatus(status),
    });
    this.add(this.motionBridge);

    this.bindTouchSwipeOnCanvas();
    this.syncDiagnosticAttributes();
    document.body.dataset.osState = 'ready';

    (
      window as unknown as {
        __foldXrDebug?: {
          validateUI: () => unknown;
          openApp: (id: string) => void;
          setPage: (dir: -1 | 1) => void;
          getCameraYaw: () => number;
          getAppWorldPosition: (id: string) => {x: number; y: number; z: number} | null;
          rotateCameraBy: (yawRad: number) => void;
          getLauncherInfo: () => {
            scale: number;
            following: boolean;
            visible: boolean;
            position: {x: number; y: number; z: number};
          };
          adjustLauncherScale: (delta: number) => number;
          toggleLauncherFollow: () => boolean;
          getAppInfo: (id: string) => {
            scale: number;
            following: boolean;
            position: {x: number; y: number; z: number};
          } | null;
          adjustAppScale: (id: string, delta: number) => number | null;
          toggleAppFollow: (id: string) => boolean | null;
        };
      }
    ).__foldXrDebug = {
      validateUI: () =>
        (xb.ui as unknown as {validate?: () => unknown}).validate?.(),
      openApp: (id: string) => {
        const def = this.osState
          .getSnapshot()
          .visibleApps.find((a) => a.id === id);
        if (def) {
          this.openOrFocusApp(def);
          return;
        }
        this.osState.setCategory('all');
        for (let p = 0; p < 3; p++) {
          const found = this.osState
            .getSnapshot()
            .visibleApps.find((a) => a.id === id);
          if (found) {
            this.openOrFocusApp(found);
            return;
          }
          this.osState.nextPage();
        }
      },
      setPage: (dir: -1 | 1) => this.handlePageChange(dir),
      getCameraYaw: () => this.getActiveCamera().rotation.y,
      getAppWorldPosition: (id: string) => {
        const app = this.openApps.get(id);
        if (!app) return null;
        const cardObj = app.children.find((c) => c instanceof xb.UICard);
        if (!cardObj) return null;
        const v = new THREE.Vector3();
        cardObj.getWorldPosition(v);
        return {x: v.x, y: v.y, z: v.z};
      },
      rotateCameraBy: (yawRad: number) => {
        const cam = this.getActiveCamera();
        cam.rotation.y += yawRad;
        cam.updateMatrixWorld();
      },
      getLauncherInfo: () => {
        const v = new THREE.Vector3();
        this.launcher.card.getWorldPosition(v);
        return {
          scale: this.launcher.windowController.scale,
          following: this.launcher.windowController.isFollowing,
          visible: this.launcher.card.visible,
          position: {x: v.x, y: v.y, z: v.z},
        };
      },
      adjustLauncherScale: (delta: number) =>
        this.launcher.windowController.adjustScale(delta),
      toggleLauncherFollow: () =>
        this.launcher.windowController.toggleFollow(this.getActiveCamera()),
      getAppInfo: (id: string) => {
        const app = this.openApps.get(id);
        if (!app) return null;
        const ctrl = app.getWindowController?.();
        const cardObj = app.children.find((c) => c instanceof xb.UICard);
        const v = new THREE.Vector3();
        cardObj?.getWorldPosition(v);
        return {
          scale: ctrl?.scale ?? 1,
          following: ctrl?.isFollowing ?? false,
          position: {x: v.x, y: v.y, z: v.z},
        };
      },
      adjustAppScale: (id: string, delta: number) => {
        const app = this.openApps.get(id);
        return app?.getWindowController?.().adjustScale(delta) ?? null;
      },
      toggleAppFollow: (id: string) => {
        const app = this.openApps.get(id);
        return (
          app?.getWindowController?.().toggleFollow(this.getActiveCamera()) ??
          null
        );
      },
    };
  }

  onXRSessionStarted(): void {
    const cam = this.getActiveCamera();
    this.launcher.summonInFrontOfCamera(cam);
    this.dockBar.summonInFrontOfCamera(cam);
  }

  onSimulatorStarted(): void {
    const cam = this.getActiveCamera();
    this.launcher.summonInFrontOfCamera(cam);
    this.dockBar.summonInFrontOfCamera(cam);
  }

  private getActiveCamera(): THREE.Camera {
    return xb.core.simulator?.getRenderCamera?.() ?? xb.core.camera;
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 2.5);
    const key = new THREE.DirectionalLight(0xfff7ed, 2.2);
    key.position.set(2.5, 4.5, 3.0);
    const fill = new THREE.DirectionalLight(0x7dd3fc, 0.8);
    fill.position.set(-2.5, 1.5, -2.0);
    this.add(hemi, key, fill);
  }

  private handlePageChange(dir: -1 | 1, statusLabel?: string): void {
    const changed = dir > 0 ? this.osState.nextPage() : this.osState.prevPage();
    if (changed) {
      this.launcher.refresh();
      if (statusLabel) this.setTrackingStatus(statusLabel);
      this.syncDiagnosticAttributes();
    }
  }

  private openOrFocusApp(def: AppDefinition): void {
    const existing = this.openApps.get(def.id);
    if (existing) {
      existing.recenter(this.getActiveCamera(), 0);
      return;
    }

    const closeHandler = () => this.closeApp(def.id);
    let instance: SpatialAppInstance;
    switch (def.id) {
      case 'browser':
        instance = new BrowserApp(closeHandler);
        break;
      case 'cosmic-blaster':
        instance = new CosmicBlasterApp(closeHandler);
        break;
      case 'memory-matrix':
        instance = new MemoryMatrixApp(closeHandler);
        break;
      case 'notes':
        instance = new NotesApp(closeHandler);
        break;
      case 'calculator':
        instance = new CalculatorApp(closeHandler);
        break;
      case 'gallery':
        instance = new GalleryApp(closeHandler);
        break;
      case 'weather-clock':
        instance = new ClockWeatherApp(closeHandler);
        break;
      case 'synth-pad':
        instance = new SynthPadApp(closeHandler);
        break;
      case 'gesture-lab':
      default:
        instance = new GestureLabApp(
          {
            onToggleGyro: () => this.motionBridge.togglePhoneGyro(),
            onAdjustGlobalScale: (delta) => {
              const nextScale = this.launcher.windowController.adjustScale(delta);
              this.dockBar.windowController.adjustScale(delta);
              for (const app of this.openApps.values()) {
                app.getWindowController?.().adjustScale(delta);
              }
              return nextScale;
            },
            getGlobalScale: () => this.launcher.windowController.scale,
            getTrackingStatus: () => this.trackingStatus,
          },
          closeHandler
        );
        break;
    }

    const slotIndex = this.openApps.size;
    this.openApps.set(def.id, instance);
    this.osState.markAppOpened(def.id);
    this.osState.launcherVisible = false;
    this.launcher.card.visible = false;
    this.add(instance);
    instance.recenter(this.getActiveCamera(), slotIndex);
    if (this.osState.dockPinnedToHead) {
      instance.getWindowController?.().setFollow(true, this.getActiveCamera());
    }
    this.launcher.refresh();
    this.syncDiagnosticAttributes();
  }

  private closeApp(appId: string): void {
    const instance = this.openApps.get(appId);
    if (!instance) return;
    instance.removeFromParent();
    instance.dispose();
    this.openApps.delete(appId);
    this.osState.markAppClosed(appId);
    this.launcher.refresh();
    this.syncDiagnosticAttributes();
  }

  private closeAllApps(): void {
    for (const id of [...this.openApps.keys()]) {
      this.closeApp(id);
    }
  }

  private setTrackingStatus(status: string): void {
    this.trackingStatus = status;
    this.launcher.setTrackingStatus(status);
  }

  private bindTouchSwipeOnCanvas(): void {
    const dom = xb.core.renderer?.domElement;
    if (!dom) return;

    dom.addEventListener('touchstart', this.onTouchStart, {passive: true});
    dom.addEventListener('touchend', this.onTouchEnd, {passive: true});
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1 || !this.launcher.card.visible) return;
    const t = e.touches[0];
    let overLauncher = false;
    try {
      const hit = xb.core.user?.getRayIntersection?.(0);
      overLauncher = Boolean(
        hit && this.isDescendantOf(hit.object, this.launcher.card)
      );
    } catch {
      overLauncher = false;
    }
    this.touchSwipeStart = {x: t.clientX, y: t.clientY, active: overLauncher};
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (!this.touchSwipeStart || e.changedTouches.length === 0) return;
    const start = this.touchSwipeStart;
    this.touchSwipeStart = null;
    if (!start.active) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.3) {
      const dir = evaluateHorizontalSwipe(dx, 55);
      if (dir !== 0) {
        soundFX.playSwipe(dir);
        this.handlePageChange(dir, dir > 0 ? 'Свайп пальцем ->' : '<- Свайп пальцем');
      }
    }
  };

  private isDescendantOf(obj: THREE.Object3D | null, root: THREE.Object3D): boolean {
    let curr: THREE.Object3D | null = obj;
    while (curr) {
      if (curr === root) return true;
      curr = curr.parent;
    }
    return false;
  }

  private syncDiagnosticAttributes(): void {
    const snap = this.osState.getSnapshot();
    document.body.dataset.launcherPage = String(snap.page + 1);
    document.body.dataset.launcherCategory = snap.category;
    document.body.dataset.launcherVisible = String(snap.launcherVisible);
    document.body.dataset.openApps = snap.openAppIds.join(',');
    document.body.dataset.launcherScale = String(
      this.launcher.windowController.scale
    );
    document.body.dataset.launcherFollowing = String(
      this.launcher.windowController.isFollowing
    );
  }

  dispose(): void {
    const dom = xb.core.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('touchstart', this.onTouchStart);
      dom.removeEventListener('touchend', this.onTouchEnd);
    }
    this.closeAllApps();
  }
}
