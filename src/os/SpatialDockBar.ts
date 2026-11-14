import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  createSpatialButton,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
  type SpatialButtonHandle,
} from './SpatialWindow';
import {WINDOW_SCALE_STEP} from './SpatialOSState';
import {soundFX} from '../utils/SoundFX';

export interface SpatialDockCallbacks {
  onToggleLauncher: () => void;
  onRecenterAll: () => void;
  onToggleFollowAll: () => boolean;
  onAdjustGlobalScale: (delta: number) => void;
  onCycleTheme: () => string;
  onCloseAll: () => void;
}

export class SpatialDockBar extends xb.Script {
  readonly card: xb.UICard;
  readonly windowController: SpatialWindowController;
  private followScript: xb.FollowHead | null = null;
  private faceScript: xb.FaceCamera | null = null;
  private followBtn: SpatialButtonHandle;
  private themeBtn: SpatialButtonHandle;
  private callbacks: SpatialDockCallbacks;

  constructor(callbacks: SpatialDockCallbacks) {
    super();
    this.callbacks = callbacks;

    const menuBtn = createSpatialButton({
      label: 'Меню',
      icon: 'apps',
      fontSize: 13,
      iconSize: 17,
      style: {height: 40, borderRadius: 20, paddingLeft: 10, paddingRight: 10},
      onClick: () => {
        soundFX.playTap();
        this.callbacks.onToggleLauncher();
      },
    }).button;

    const recenterBtn = createSpatialButton({
      label: 'Сюда',
      icon: 'center_focus_strong',
      fontSize: 13,
      iconSize: 17,
      style: {height: 40, borderRadius: 20, paddingLeft: 10, paddingRight: 10},
      onClick: () => {
        soundFX.playTap();
        this.callbacks.onRecenterAll();
      },
    }).button;

    this.followBtn = createSpatialButton({
      label: 'На месте',
      icon: 'lock',
      fontSize: 13,
      iconSize: 17,
      style: {height: 40, borderRadius: 20, paddingLeft: 10, paddingRight: 10},
      onClick: () => {
        soundFX.playTap();
        const pinned = this.callbacks.onToggleFollowAll();
        this.setFollowMode(pinned);
      },
    });

    const shrinkBtn = new xb.UIButton({
      ariaLabel: 'Уменьшить интерфейс',
      onClick: () => {
        soundFX.playTap();
        this.callbacks.onAdjustGlobalScale(-WINDOW_SCALE_STEP);
      },
      style: {
        width: 38,
        height: 40,
        padding: 0,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
      },
      children: [
        new xb.UIText({
          text: '−',
          pointerEvents: 'none',
          style: {fontSize: 20, fontWeight: 'bold', color: '#ffffff', textAlign: 'center'},
        }),
      ],
    });

    const growBtn = new xb.UIButton({
      ariaLabel: 'Увеличить интерфейс',
      onClick: () => {
        soundFX.playTap();
        this.callbacks.onAdjustGlobalScale(WINDOW_SCALE_STEP);
      },
      style: {
        width: 38,
        height: 40,
        padding: 0,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
      },
      children: [
        new xb.UIText({
          text: '+',
          pointerEvents: 'none',
          style: {fontSize: 20, fontWeight: 'bold', color: '#ffffff', textAlign: 'center'},
        }),
      ],
    });

    this.themeBtn = createSpatialButton({
      label: 'Тема',
      icon: 'palette',
      fontSize: 13,
      iconSize: 17,
      style: {height: 40, borderRadius: 20, paddingLeft: 10, paddingRight: 10},
      onClick: () => {
        soundFX.playTap();
        const label = this.callbacks.onCycleTheme();
        this.themeBtn.setLabel(label);
      },
    });

    const closeAllBtn = new xb.UIButton({
      ariaLabel: 'Закрыть все окна',
      onClick: () => {
        soundFX.playWindowClose();
        this.callbacks.onCloseAll();
      },
      style: {
        width: 40,
        height: 40,
        paddingLeft: 0,
        paddingRight: 0,
        borderRadius: 20,
        backgroundColor: 'rgba(244, 63, 94, 0.25)',
        borderColor: 'rgba(244, 63, 94, 0.5)',
      },
      children: [
        new xb.UIIcon({
          icon: 'close_fullscreen',
          pointerEvents: 'none',
          style: {width: 18, height: 18, color: '#ffffff'},
        }),
      ],
    });

    this.card = new xb.UICard({
      size: {width: 0.78, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        padding: 10,
        borderRadius: 30,
      },
      children: [
        menuBtn,
        recenterBtn,
        this.followBtn.button,
        shrinkBtn,
        growBtn,
        this.themeBtn.button,
        closeAllBtn,
      ],
    });
    this.card.name = 'Spatial Control Dock';
    this.windowController = new SpatialWindowController(this.card);
    this.add(this.card);
  }

  init(): void {
    this.summonInFrontOfCamera(xb.core.camera);
  }

  summonInFrontOfCamera(camera: THREE.Camera): void {
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: 1.02,
      angleRad: 0,
      heightOffset: -0.28,
    });
  }

  setFollowMode(followHead: boolean): void {
    this.followScript?.removeFromParent();
    this.faceScript?.removeFromParent();
    this.followScript = null;
    this.faceScript = null;

    if (followHead) {
      this.followBtn.setLabel('За мной');
      this.followBtn.setIcon('my_location');
      this.followBtn.button.style.backgroundColor = 'rgba(56, 189, 248, 0.38)';
      this.followScript = new xb.FollowHead({
        offset: new THREE.Vector3(0, -0.28, -1.02),
        smoothing: 0.14,
      });
      this.faceScript = new xb.FaceCamera({mode: 'spherical', smoothing: 0.16});
      this.card.add(this.followScript, this.faceScript);
    } else {
      this.followBtn.setLabel('На месте');
      this.followBtn.setIcon('lock');
      this.followBtn.button.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
    }
  }

  dispose(): void {
    this.followScript?.removeFromParent();
    this.faceScript?.removeFromParent();
    this.windowController.dispose();
  }
}
