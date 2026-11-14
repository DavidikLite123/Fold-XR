import * as THREE from 'three';
import * as xb from 'xrblocks';
import {MemoryMatrixLogic} from './MemoryMatrixLogic';
import {
  createSpatialButton,
  createWindowHeader,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
  type SpatialAppInstance,
  type SpatialButtonHandle,
} from '../../os/SpatialWindow';
import {computeWindowArcSlot} from '../../os/SpatialOSState';
import {soundFX} from '../../utils/SoundFX';

const PAD_FREQS = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
const PAD_COLORS = [
  0x38bdf8, 0x818cf8, 0xa855f7,
  0x2dd4bf, 0x34d399, 0xfbbf24,
  0xf472b6, 0xfb7185, 0xf97316,
];

class MatrixPad extends xb.Script {
  readonly index: number;
  private baseColor: number;
  private frameMesh: THREE.Mesh;
  private coreMesh: THREE.Mesh;
  private frameMat: THREE.MeshStandardMaterial;
  private coreMat: THREE.MeshStandardMaterial;
  private glowTimer = 0;
  private onPress: (index: number) => void;

  constructor(index: number, onPress: (index: number) => void) {
    super();
    this.index = index;
    this.onPress = onPress;
    this.baseColor = PAD_COLORS[index % PAD_COLORS.length];

    this.frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.85,
    });
    this.coreMat = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      emissive: this.baseColor,
      emissiveIntensity: 0.18,
      roughness: 0.15,
      metalness: 0.1,
    });

    this.frameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.115, 0.115, 0.022),
      this.frameMat
    );
    this.coreMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.088, 0.032),
      this.coreMat
    );
    this.coreMesh.position.z = 0.008;
    this.add(this.frameMesh, this.coreMesh);
  }

  onObjectSelectStart(event: xb.SelectEvent): void {
    this.onPress(this.index);
    event.stopPropagation();
  }

  onObjectTouchStart(event: xb.SelectEvent): void {
    this.onPress(this.index);
    event.stopPropagation();
  }

  flash(duration = 0.38): void {
    this.glowTimer = duration;
    this.coreMat.emissiveIntensity = 1.4;
    this.scale.setScalar(1.12);
    soundFX.playChime(PAD_FREQS[this.index % PAD_FREQS.length], 'sine', 0.25);
  }

  update(): void {
    if (this.glowTimer <= 0) return;
    this.glowTimer -= xb.getDeltaTime();
    if (this.glowTimer <= 0) {
      this.coreMat.emissiveIntensity = 0.18;
      this.scale.setScalar(1);
    }
  }

  dispose(): void {
    this.frameMesh.geometry.dispose();
    this.coreMesh.geometry.dispose();
    this.frameMat.dispose();
    this.coreMat.dispose();
  }
}

export class MemoryMatrixApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'memory-matrix';
  private logic = new MemoryMatrixLogic();
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private gridGroup = new THREE.Group();
  private pads: MatrixPad[] = [];
  private levelText: xb.UIText;
  private statusText: xb.UIText;
  private startBtn: SpatialButtonHandle;
  private playbackTimers: number[] = [];
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;

    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const pad = new MatrixPad(i, (idx) => this.handlePadPress(idx));
      pad.position.set((col - 1) * 0.135, (1 - row) * 0.135, 0);
      this.gridGroup.add(pad);
      this.pads.push(pad);
    }
    this.add(this.gridGroup);

    this.levelText = new xb.UIText({
      text: 'Уровень: 0  •  Рекорд: 0',
      style: {fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#d8b4fe'},
    });
    this.statusText = new xb.UIText({
      text: 'Запомните последовательность 3D-кристаллов и повторите её!',
      style: {fontSize: 15, opacity: 0.82, textAlign: 'center'},
    });
    this.startBtn = createSpatialButton({
      label: 'Начать игру',
      icon: 'play_arrow',
      fontSize: 16,
      style: {width: '100%', backgroundColor: '#9333ea'},
      onClick: () => {
        soundFX.playTap();
        this.startNewGame();
      },
    });

    this.card = new xb.UICard({
      size: {width: 0.48, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 10, padding: 16},
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card, {
      onScaleChange: (s) => this.gridGroup.scale.setScalar(s),
    });
    this.gridGroup.scale.setScalar(this.windowController.scale);

    const header = createWindowHeader({
      title: 'Матрица 3D',
      icon: 'grid_view',
      accentColor: '#a855f7',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(header, this.levelText, this.statusText, this.startBtn.button);
    this.card.name = 'Memory Matrix window';
    this.add(this.card);
  }

  init(): void {
    this.recenter(xb.core.camera, 1);
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 1): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: slot.distance,
      angleRad: slot.angleRad,
      heightOffset: -0.2,
    });
    placeObjectInFrontOfCamera(this.gridGroup, camera, {
      distance: slot.distance - 0.05,
      angleRad: slot.angleRad,
      heightOffset: 0.19,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  private startNewGame(): void {
    this.clearTimers();
    const seq = this.logic.start();
    this.startBtn.setLabel('Сначала');
    this.refreshStatus();
    this.playSequence(seq);
  }

  private playSequence(sequence: number[]): void {
    this.clearTimers();
    this.statusText.text = 'Смотрите внимательно...';
    sequence.forEach((cellIndex, step) => {
      const t = window.setTimeout(() => {
        this.pads[cellIndex]?.flash(0.36);
      }, 450 + step * 520);
      this.playbackTimers.push(t);
    });
    const endTimer = window.setTimeout(() => {
      this.logic.finishShowing();
      this.statusText.text = 'Ваш ход! Повторите последовательность.';
    }, 450 + sequence.length * 520 + 250);
    this.playbackTimers.push(endTimer);
  }

  private handlePadPress(index: number): void {
    if (this.logic.phase !== 'input') return;
    this.pads[index]?.flash(0.28);
    const res = this.logic.submitCell(index);
    if (res === 'level-complete') {
      this.refreshStatus();
      this.statusText.text = 'Отлично! Следующий уровень...';
      const t = window.setTimeout(() => {
        const nextSeq = this.logic.advanceLevel();
        this.refreshStatus();
        this.playSequence(nextSeq);
      }, 700);
      this.playbackTimers.push(t);
    } else if (res === 'wrong') {
      soundFX.playError();
      this.refreshStatus();
      this.statusText.text = `Ошибка! Вы дошли до уровня ${this.logic.level}.`;
    }
  }

  private refreshStatus(): void {
    this.levelText.text = `Уровень: ${this.logic.level}  •  Рекорд: ${this.logic.bestLevel}`;
  }

  private clearTimers(): void {
    for (const id of this.playbackTimers) {
      window.clearTimeout(id);
    }
    this.playbackTimers = [];
  }

  dispose(): void {
    this.windowController.dispose();
    this.clearTimers();
    for (const p of this.pads) {
      p.dispose();
    }
  }
}
