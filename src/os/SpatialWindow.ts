import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  clampWindowScale,
  getResponsiveBaseScale,
  WINDOW_SCALE_STEP,
} from './SpatialOSState';
import {soundFX} from '../utils/SoundFX';

const _camPos = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
const _camForward = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _cardWorldPos = new THREE.Vector3();

export interface CameraPlacementOptions {
  distance?: number;
  angleRad?: number;
  heightOffset?: number;
}

export function getDefaultWindowScale(): number {
  if (typeof window === 'undefined') return 1;
  return getResponsiveBaseScale(window.innerWidth, window.innerHeight);
}

/**
 * Places a world-anchored object in front of the active camera along the XZ
 * heading so turning away later keeps the object anchored in the room.
 */
export function placeObjectInFrontOfCamera(
  object: THREE.Object3D,
  camera: THREE.Camera,
  {distance = 1.18, angleRad = 0, heightOffset = 0}: CameraPlacementOptions = {}
): void {
  camera.getWorldPosition(_camPos);
  camera.getWorldDirection(_camForward);
  _camForward.y = 0;
  if (_camForward.lengthSq() < 1e-5) {
    _camForward.set(0, 0, -1);
  } else {
    _camForward.normalize();
  }

  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rx = _camForward.x * cos - _camForward.z * sin;
  const rz = _camForward.x * sin + _camForward.z * cos;

  _targetPos.set(
    _camPos.x + rx * distance,
    _camPos.y + heightOffset,
    _camPos.z + rz * distance
  );
  object.position.copy(_targetPos);
  object.lookAt(_camPos.x, _targetPos.y, _camPos.z);
}

/**
 * Manages per-window scale (Smaller / Larger buttons) and per-window
 * Follow-Me attachment (`xb.FollowHead` + `xb.FaceCamera`).
 */
export class SpatialWindowController {
  readonly card: xb.UICard;
  private currentScale: number;
  private following = false;
  private followScript: xb.FollowHead | null = null;
  private faceScript: xb.FaceCamera | null = null;
  private followBtn?: xb.UIButton;
  private followIcon?: xb.UIIcon;
  private onScaleCallback?: (scale: number) => void;
  private onFollowCallback?: (following: boolean) => void;

  constructor(
    card: xb.UICard,
    options?: {
      initialScale?: number;
      onScaleChange?: (scale: number) => void;
      onFollowChange?: (following: boolean) => void;
    }
  ) {
    this.card = card;
    this.currentScale = clampWindowScale(
      options?.initialScale ?? getDefaultWindowScale()
    );
    this.onScaleCallback = options?.onScaleChange;
    this.onFollowCallback = options?.onFollowChange;
    this.card.scale.setScalar(this.currentScale);
  }

  get scale(): number {
    return this.currentScale;
  }

  get isFollowing(): boolean {
    return this.following;
  }

  setScale(nextScale: number): number {
    const clamped = clampWindowScale(nextScale);
    this.currentScale = clamped;
    this.card.scale.setScalar(clamped);
    this.onScaleCallback?.(clamped);
    return clamped;
  }

  adjustScale(delta: number): number {
    return this.setScale(this.currentScale + delta);
  }

  bindFollowControl(button: xb.UIButton, icon: xb.UIIcon): void {
    this.followBtn = button;
    this.followIcon = icon;
    this.updateFollowButtonVisual();
  }

  toggleFollow(camera: THREE.Camera): boolean {
    return this.setFollow(!this.following, camera);
  }

  setFollow(enable: boolean, camera: THREE.Camera): boolean {
    this.following = enable;
    this.detachScripts();

    if (enable) {
      this.attachFollowAtCurrentPose(camera);
    }

    this.updateFollowButtonVisual();
    this.onFollowCallback?.(this.following);
    return this.following;
  }

  refreshAfterRecenter(camera: THREE.Camera): void {
    if (!this.following) return;
    this.detachScripts();
    this.attachFollowAtCurrentPose(camera);
  }

  private attachFollowAtCurrentPose(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.card.updateMatrixWorld();
    camera.getWorldPosition(_camPos);
    camera.getWorldQuaternion(_camQuat);
    this.card.getWorldPosition(_cardWorldPos);

    const offset = _cardWorldPos
      .clone()
      .sub(_camPos)
      .applyQuaternion(_camQuat.clone().invert());

    if (offset.z > -0.75 || offset.z < -1.8) {
      offset.z = -1.1;
    }
    offset.x = THREE.MathUtils.clamp(offset.x, -0.55, 0.55);
    offset.y = THREE.MathUtils.clamp(offset.y, -0.45, 0.45);

    this.followScript = new xb.FollowHead({
      offset,
      smoothing: 0.14,
    });
    this.faceScript = new xb.FaceCamera({
      mode: 'spherical',
      smoothing: 0.16,
    });
    this.card.add(this.followScript, this.faceScript);
  }

  private detachScripts(): void {
    this.followScript?.removeFromParent();
    this.faceScript?.removeFromParent();
    this.followScript = null;
    this.faceScript = null;
  }

  private updateFollowButtonVisual(): void {
    if (!this.followBtn || !this.followIcon) return;
    if (this.following) {
      this.followIcon.icon = 'my_location';
      this.followBtn.ariaLabel = 'Открепить окно (оставить на месте)';
      this.followBtn.style.backgroundColor = 'rgba(56, 189, 248, 0.42)';
      this.followBtn.style.borderColor = 'rgba(125, 211, 252, 0.85)';
    } else {
      this.followIcon.icon = 'lock';
      this.followBtn.ariaLabel = 'Следовать за мной';
      this.followBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      this.followBtn.style.borderColor = 'rgba(255, 255, 255, 0.22)';
    }
  }

  dispose(): void {
    this.detachScripts();
  }
}

export interface WindowHeaderOptions {
  title: string;
  icon: string;
  accentColor?: string;
  controller?: SpatialWindowController;
  onRecenter?: () => void;
  onClose: () => void;
}

export function createWindowHeader({
  title,
  icon,
  accentColor = '#38bdf8',
  controller,
  onRecenter,
  onClose,
}: WindowHeaderOptions): xb.UIPanel {
  const iconBadge = new xb.UIPanel({
    pointerEvents: 'none',
    style: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: accentColor,
      justifyContent: 'center',
      alignItems: 'center',
    },
    children: [
      new xb.UIIcon({
        icon,
        pointerEvents: 'none',
        style: {width: 18, height: 18, color: '#ffffff'},
      }),
    ],
  });

  const titleText = new xb.UIText({
    text: title,
    pointerEvents: 'none',
    style: {
      fontSize: 18,
      fontWeight: 'bold',
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  });

  const actions: THREE.Object3D[] = [];
  const compactIconBtnStyle: xb.UIStyle = {
    width: 30,
    height: 30,
    padding: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  };

  if (controller) {
    actions.push(
      new xb.UIButton({
        ariaLabel: `Уменьшить окно ${title}`,
        onClick: () => {
          soundFX.playTap();
          controller.adjustScale(-WINDOW_SCALE_STEP);
        },
        style: compactIconBtnStyle,
        children: [
          new xb.UIText({
            text: '−',
            pointerEvents: 'none',
            style: {fontSize: 19, fontWeight: 'bold', color: '#ffffff', textAlign: 'center'},
          }),
        ],
      }),
      new xb.UIButton({
        ariaLabel: `Увеличить окно ${title}`,
        onClick: () => {
          soundFX.playTap();
          controller.adjustScale(WINDOW_SCALE_STEP);
        },
        style: compactIconBtnStyle,
        children: [
          new xb.UIText({
            text: '+',
            pointerEvents: 'none',
            style: {fontSize: 19, fontWeight: 'bold', color: '#ffffff', textAlign: 'center'},
          }),
        ],
      })
    );

    const followIcon = new xb.UIIcon({
      icon: 'lock',
      pointerEvents: 'none',
      style: {width: 17, height: 17, color: '#ffffff'},
    });
    const followBtn = new xb.UIButton({
      ariaLabel: `Следовать за мной: ${title}`,
      onClick: () => {
        soundFX.playTap();
        const cam = xb.core.simulator?.getRenderCamera?.() ?? xb.core.camera;
        controller.toggleFollow(cam);
      },
      style: compactIconBtnStyle,
      children: [followIcon],
    });
    controller.bindFollowControl(followBtn, followIcon);
    actions.push(followBtn);
  }

  if (onRecenter) {
    actions.push(
      new xb.UIButton({
        ariaLabel: `Перенести окно ${title} перед собой`,
        onClick: () => {
          soundFX.playTap();
          onRecenter();
        },
        style: compactIconBtnStyle,
        children: [
          new xb.UIIcon({
            icon: 'center_focus_strong',
            pointerEvents: 'none',
            style: {width: 17, height: 17, color: '#ffffff'},
          }),
        ],
      })
    );
  }

  actions.push(
    new xb.UIButton({
      ariaLabel: `Закрыть ${title}`,
      onClick: () => {
        soundFX.playWindowClose();
        onClose();
      },
      style: {
        ...compactIconBtnStyle,
        backgroundColor: 'rgba(244, 63, 94, 0.28)',
        borderColor: 'rgba(244, 63, 94, 0.55)',
      },
      children: [
        new xb.UIIcon({
          icon: 'close',
          pointerEvents: 'none',
          style: {width: 17, height: 17, color: '#ffffff'},
        }),
      ],
    })
  );

  return new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingBottom: 6,
    },
    children: [
      new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        children: [iconBadge, titleText],
      }),
      new xb.UIPanel({
        style: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        },
        children: actions,
      }),
    ],
  });
}

export interface SpatialAppInstance extends xb.Script {
  readonly appId: string;
  recenter(camera: THREE.Camera, slotIndex?: number): void;
  getWindowController?(): SpatialWindowController;
}

export interface SpatialButtonOptions {
  label: string;
  icon?: string;
  iconPosition?: 'left' | 'right';
  ariaLabel?: string;
  disabled?: boolean;
  fontSize?: number;
  fontWeight?: 'normal' | 'medium' | 'bold';
  iconSize?: number;
  style?: xb.UIStyle;
  onClick?: () => void;
}

export interface SpatialButtonHandle {
  button: xb.UIButton;
  setLabel: (label: string) => void;
  setIcon: (icon: string) => void;
}

/**
 * Creates a UIButton whose label renders via `xb.UIText` (AdaptiveText) rather
 * than UIKit's Latin-only MSDF `Text`, ensuring Cyrillic and Unicode scripts
 * display cleanly without missing-glyph boxes.
 */
export function createSpatialButton({
  label,
  icon,
  iconPosition = 'left',
  ariaLabel,
  disabled = false,
  fontSize = 15,
  fontWeight = 'medium',
  iconSize = 20,
  style,
  onClick,
}: SpatialButtonOptions): SpatialButtonHandle {
  const iconEl = icon
    ? new xb.UIIcon({
        icon,
        pointerEvents: 'none',
        style: {width: iconSize, height: iconSize, color: '#ffffff'},
      })
    : null;

  const textEl = new xb.UIText({
    text: label,
    pointerEvents: 'none',
    style: {
      fontSize,
      fontWeight,
      whiteSpace: 'nowrap',
      textAlign: 'center',
    },
  });

  const children: THREE.Object3D[] = [];
  if (iconEl && iconPosition === 'left') children.push(iconEl);
  children.push(textEl);
  if (iconEl && iconPosition === 'right') children.push(iconEl);

  const button = new xb.UIButton({
    ariaLabel: ariaLabel ?? label,
    disabled,
    style: {
      gap: 6,
      ...style,
    },
    children,
    onClick,
  });

  return {
    button,
    setLabel: (nextLabel: string) => {
      textEl.text = nextLabel;
      button.ariaLabel = nextLabel;
    },
    setIcon: (nextIcon: string) => {
      if (iconEl) iconEl.icon = nextIcon;
    },
  };
}
