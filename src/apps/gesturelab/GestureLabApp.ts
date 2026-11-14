import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  createSpatialButton,
  createWindowHeader,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
  type SpatialAppInstance,
  type SpatialButtonHandle,
} from '../../os/SpatialWindow';
import {computeWindowArcSlot, WINDOW_SCALE_STEP} from '../../os/SpatialOSState';
import {soundFX} from '../../utils/SoundFX';

export interface GestureLabCallbacks {
  onToggleGyro: () => Promise<boolean>;
  onAdjustGlobalScale: (delta: number) => number;
  getGlobalScale: () => number;
  getTrackingStatus: () => string;
}

export class GestureLabApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'gesture-lab';
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private statusText: xb.UIText;
  private scaleText: xb.UIText;
  private gyroBtn: SpatialButtonHandle;
  private callbacks: GestureLabCallbacks;
  private onCloseCallback: () => void;

  constructor(callbacks: GestureLabCallbacks, onClose: () => void) {
    super();
    this.callbacks = callbacks;
    this.onCloseCallback = onClose;

    this.statusText = new xb.UIText({
      text: `Статус: ${callbacks.getTrackingStatus()}`,
      style: {
        width: '100%',
        fontSize: 16,
        fontWeight: 'bold',
        color: '#5eead4',
        textAlign: 'center',
      },
    });

    this.scaleText = new xb.UIText({
      text: `Размер интерфейса: ${Math.round(callbacks.getGlobalScale() * 100)}%`,
      style: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#e2e8f0',
        textAlign: 'center',
      },
    });

    const guide = new xb.UIText({
      text:
        '• Свайп пальцем: проведите по сетке меню влево/вправо для смены страниц.\n' +
        '• Кнопки − / + в заголовке: быстро уменьшают или увеличивают любое окно.\n' +
        '• Кнопка замка / цели в заголовке: включает режим «За мной» — окно будет плавно следовать за вами.\n' +
        '• Перетаскивание: потяните за рамку окна — без режима «За мной» оно останется на месте в комнате.',
      style: {
        width: '100%',
        fontSize: 14,
        lineHeight: 1.4,
        whiteSpace: 'pre-line',
        opacity: 0.9,
      },
    });

    const smallerBtn = createSpatialButton({
      label: 'Меньше',
      icon: 'remove',
      fontSize: 14,
      style: {flexGrow: 1},
      onClick: () => {
        soundFX.playTap();
        const next = this.callbacks.onAdjustGlobalScale(-WINDOW_SCALE_STEP);
        this.scaleText.text = `Размер интерфейса: ${Math.round(next * 100)}%`;
      },
    }).button;

    const largerBtn = createSpatialButton({
      label: 'Больше',
      icon: 'add',
      fontSize: 14,
      style: {flexGrow: 1},
      onClick: () => {
        soundFX.playTap();
        const next = this.callbacks.onAdjustGlobalScale(WINDOW_SCALE_STEP);
        this.scaleText.text = `Размер интерфейса: ${Math.round(next * 100)}%`;
      },
    }).button;

    this.gyroBtn = createSpatialButton({
      label: 'Гироскоп телефона',
      icon: 'screen_rotation',
      fontSize: 14,
      style: {width: '100%'},
      onClick: async () => {
        soundFX.playTap();
        const enabled = await this.callbacks.onToggleGyro();
        this.gyroBtn.setLabel(enabled ? 'Гироскоп: ВКЛ' : 'Гироскоп телефона');
        this.statusText.text = `Статус: ${this.callbacks.getTrackingStatus()}`;
      },
    });

    this.card = new xb.UICard({
      size: {width: 0.58, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 10, padding: 16},
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card);

    const header = createWindowHeader({
      title: 'Экран и Жесты',
      icon: 'tune',
      accentColor: '#14b8a6',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(
      header,
      this.statusText,
      this.scaleText,
      new xb.UIPanel({
        style: {width: '100%', flexDirection: 'row', gap: 8},
        children: [smallerBtn, largerBtn],
      }),
      new xb.UIPanel({
        style: {
          width: '100%',
          padding: 12,
          borderRadius: 16,
          backgroundColor: 'rgba(10, 20, 30, 0.55)',
        },
        children: [guide],
      }),
      this.gyroBtn.button
    );
    this.card.name = 'Gesture Lab window';
    this.add(this.card);
  }

  init(): void {
    this.recenter(xb.core.camera, 5);
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 5): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: slot.distance,
      angleRad: slot.angleRad,
      heightOffset: slot.heightOffset,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  update(): void {
    const next = `Статус: ${this.callbacks.getTrackingStatus()}`;
    if (this.statusText.text !== next) {
      this.statusText.text = next;
    }
  }

  dispose(): void {
    this.windowController.dispose();
  }
}
