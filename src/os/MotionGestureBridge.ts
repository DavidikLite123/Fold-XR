import * as THREE from 'three';
import * as xb from 'xrblocks';

const _wristPos = new THREE.Vector3();
const _camInverse = new THREE.Matrix4();

export interface MotionGestureCallbacks {
  onSwipePage: (direction: -1 | 1, sourceLabel: string) => void;
  onSummonLauncher: (sourceLabel: string) => void;
  onTrackingStatus: (status: string) => void;
}

interface HandVelocitySample {
  x: number;
  time: number;
  cooldownUntil: number;
}

/**
 * Bridges WebXR hand tracking, built-in gesture recognition, and optional
 * phone gyroscope look-around (outside WebXR) into high-level Spatial OS actions.
 */
export class MotionGestureBridge extends xb.Script {
  private callbacks: MotionGestureCallbacks;
  private handSamples = new Map<'left' | 'right', HandVelocitySample>();
  private openPalmStartedAt: number | null = null;
  private openPalmTriggered = false;
  private gyroEnabled = false;
  private gyroBaseAlpha: number | null = null;
  private gyroBaseBeta: number | null = null;
  private lastReportedStatus = '';

  private onGestureStart = (event: {
    detail?: {hand: 'left' | 'right'; name: string};
  }) => {
    const detail = event.detail;
    if (!detail) return;
    if (detail.name === 'open-palm') {
      this.openPalmStartedAt = performance.now();
      this.openPalmTriggered = false;
      this.emitStatus(`Ладонь (${detail.hand === 'left' ? 'лев.' : 'прав.'})`);
    } else if (detail.name === 'pinch') {
      this.emitStatus(`Щипок (${detail.hand === 'left' ? 'лев.' : 'прав.'})`);
    } else if (detail.name === 'point') {
      this.emitStatus(`Указка (${detail.hand === 'left' ? 'лев.' : 'прав.'})`);
    } else if (detail.name === 'fist') {
      this.emitStatus(`Захват (${detail.hand === 'left' ? 'лев.' : 'прав.'})`);
    }
  };

  private onGestureEnd = (event: {
    detail?: {hand: 'left' | 'right'; name: string};
  }) => {
    const detail = event.detail;
    if (!detail) return;
    if (detail.name === 'open-palm') {
      this.openPalmStartedAt = null;
      this.openPalmTriggered = false;
    }
    this.emitStatus('Трекинг активен');
  };

  private onDeviceOrientation = (event: DeviceOrientationEvent) => {
    if (!this.gyroEnabled || xb.core.renderer?.xr?.isPresenting) return;
    if (event.alpha === null || event.beta === null) return;
    if (this.gyroBaseAlpha === null || this.gyroBaseBeta === null) {
      this.gyroBaseAlpha = event.alpha;
      this.gyroBaseBeta = event.beta;
      return;
    }
    const cam = xb.core.simulator?.getRenderCamera?.() ?? xb.core.camera;
    if (!cam) return;
    const dYaw = THREE.MathUtils.degToRad(event.alpha - this.gyroBaseAlpha);
    const dPitch = THREE.MathUtils.degToRad(
      THREE.MathUtils.clamp(event.beta - this.gyroBaseBeta, -65, 65)
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.y = dYaw;
    cam.rotation.x = dPitch;
  };

  constructor(callbacks: MotionGestureCallbacks) {
    super();
    this.callbacks = callbacks;
  }

  init(): void {
    const gestures = xb.core.gestureRecognition;
    if (gestures) {
      gestures.addEventListener('gesturestart', this.onGestureStart);
      gestures.addEventListener('gestureend', this.onGestureEnd);
    }
  }

  async togglePhoneGyro(): Promise<boolean> {
    if (this.gyroEnabled) {
      this.gyroEnabled = false;
      this.gyroBaseAlpha = null;
      this.gyroBaseBeta = null;
      window.removeEventListener('deviceorientation', this.onDeviceOrientation);
      this.emitStatus('Гироскоп выкл.');
      return false;
    }

    const DevOrient = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DevOrient?.requestPermission === 'function') {
      try {
        const res = await DevOrient.requestPermission();
        if (res !== 'granted') {
          this.emitStatus('Нет доступа к гироскопу');
          return false;
        }
      } catch {
        this.emitStatus('Гироскоп недоступен');
        return false;
      }
    }

    this.gyroBaseAlpha = null;
    this.gyroBaseBeta = null;
    this.gyroEnabled = true;
    window.addEventListener('deviceorientation', this.onDeviceOrientation);
    this.emitStatus('Гироскоп телефона вкл.');
    return true;
  }

  update(): void {
    const now = performance.now();
    if (
      this.openPalmStartedAt !== null &&
      !this.openPalmTriggered &&
      now - this.openPalmStartedAt >= 550
    ) {
      this.openPalmTriggered = true;
      this.callbacks.onSummonLauncher('Жест ладонью');
    }

    const hands = xb.core.user?.hands;
    const camera = xb.core.camera;
    if (!hands || !camera) return;

    _camInverse.copy(camera.matrixWorld).invert();
    this.trackHandSwipe('left', hands.getWrist(xb.Handedness.LEFT), now);
    this.trackHandSwipe('right', hands.getWrist(xb.Handedness.RIGHT), now);
  }

  private trackHandSwipe(
    side: 'left' | 'right',
    wrist: THREE.Object3D | undefined,
    now: number
  ): void {
    if (!wrist || !wrist.visible) {
      this.handSamples.delete(side);
      return;
    }
    wrist.getWorldPosition(_wristPos);
    if (_wristPos.lengthSq() < 1e-6) return;
    _wristPos.applyMatrix4(_camInverse);

    const prev = this.handSamples.get(side);
    if (!prev) {
      this.handSamples.set(side, {
        x: _wristPos.x,
        time: now,
        cooldownUntil: 0,
      });
      return;
    }

    const dt = (now - prev.time) / 1000;
    if (dt < 0.04) return;
    const vx = (_wristPos.x - prev.x) / dt;
    prev.x = _wristPos.x;
    prev.time = now;

    if (now >= prev.cooldownUntil && Math.abs(vx) > 0.85) {
      prev.cooldownUntil = now + 550;
      const dir: -1 | 1 = vx < 0 ? 1 : -1;
      this.callbacks.onSwipePage(
        dir,
        dir > 0 ? 'Взмах влево ->' : '<- Взмах вправо'
      );
    }
  }

  private emitStatus(status: string): void {
    if (status === this.lastReportedStatus) return;
    this.lastReportedStatus = status;
    this.callbacks.onTrackingStatus(status);
  }

  dispose(): void {
    const gestures = xb.core.gestureRecognition;
    if (gestures) {
      gestures.removeEventListener('gesturestart', this.onGestureStart);
      gestures.removeEventListener('gestureend', this.onGestureEnd);
    }
    window.removeEventListener('deviceorientation', this.onDeviceOrientation);
  }
}
