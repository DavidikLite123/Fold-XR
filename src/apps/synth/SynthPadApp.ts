import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  createSpatialButton,
  createWindowHeader,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
  type SpatialAppInstance,
} from '../../os/SpatialWindow';
import {computeWindowArcSlot} from '../../os/SpatialOSState';
import {soundFX} from '../../utils/SoundFX';

const NOTES: ReadonlyArray<{label: string; freq: number; color: string}> = [
  {label: 'До (C4)', freq: 261.63, color: '#ec4899'},
  {label: 'Ре (D4)', freq: 293.66, color: '#f43f5e'},
  {label: 'Ми (E4)', freq: 329.63, color: '#f59e0b'},
  {label: 'Фа (F4)', freq: 349.23, color: '#10b981'},
  {label: 'Соль (G4)', freq: 392.0, color: '#06b6d4'},
  {label: 'Ля (A4)', freq: 440.0, color: '#3b82f6'},
  {label: 'Си (B4)', freq: 493.88, color: '#6366f1'},
  {label: 'До (C5)', freq: 523.25, color: '#a855f7'},
];

const WAVES: ReadonlyArray<{id: OscillatorType; label: string}> = [
  {id: 'sine', label: 'Мягкий'},
  {id: 'triangle', label: 'Кристалл'},
  {id: 'sawtooth', label: 'Синт-бас'},
];

export class SynthPadApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'synth-pad';
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private waveIndex = 1;
  private waveLabel: xb.UIText;
  private lastNoteText: xb.UIText;
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;

    this.waveLabel = new xb.UIText({
      text: `Тембр: ${WAVES[this.waveIndex].label}`,
      style: {fontSize: 16, fontWeight: 'bold'},
    });
    this.lastNoteText = new xb.UIText({
      text: 'Нажимайте на пэды для игры',
      style: {fontSize: 15, opacity: 0.78},
    });

    const waveBtn = createSpatialButton({
      label: 'Сменить тембр',
      icon: 'tune',
      fontSize: 14,
      onClick: () => {
        this.waveIndex = (this.waveIndex + 1) % WAVES.length;
        const w = WAVES[this.waveIndex];
        this.waveLabel.text = `Тембр: ${w.label}`;
        soundFX.playChime(440, w.id, 0.2);
      },
    }).button;

    const row1 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 10},
      children: NOTES.slice(0, 4).map((n) => this.createPad(n)),
    });
    const row2 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 10},
      children: NOTES.slice(4, 8).map((n) => this.createPad(n)),
    });

    this.card = new xb.UICard({
      size: {width: 0.6, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 10, padding: 16},
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card);

    const header = createWindowHeader({
      title: 'Синтезатор',
      icon: 'music_note',
      accentColor: '#ec4899',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(
      header,
      new xb.UIPanel({
        style: {
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        children: [this.waveLabel, waveBtn],
      }),
      row1,
      row2,
      this.lastNoteText
    );
    this.card.name = 'Synth Pad window';
    this.add(this.card);
  }

  private createPad(note: {label: string; freq: number; color: string}): xb.UIButton {
    return createSpatialButton({
      label: note.label,
      fontSize: 15,
      fontWeight: 'bold',
      style: {
        flexGrow: 1,
        height: 68,
        borderRadius: 18,
        paddingLeft: 8,
        paddingRight: 8,
        backgroundColor: note.color,
      },
      onClick: () => {
        const wave = WAVES[this.waveIndex].id;
        soundFX.playChime(note.freq, wave, 0.38);
        this.lastNoteText.text = `Нота: ${note.label} (${Math.round(note.freq)} Гц)`;
      },
    }).button;
  }

  init(): void {
    this.recenter(xb.core.camera, 4);
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 4): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: slot.distance,
      angleRad: slot.angleRad,
      heightOffset: slot.heightOffset,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  dispose(): void {
    this.windowController.dispose();
  }
}
