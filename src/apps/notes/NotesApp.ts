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

const STICKY_COLORS = [
  'rgba(245, 158, 11, 0.88)',
  'rgba(16, 185, 129, 0.88)',
  'rgba(56, 189, 248, 0.88)',
  'rgba(236, 72, 153, 0.88)',
];

export class NotesApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'notes';
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private input: xb.UITextInput;
  private statusText: xb.UIText;
  private stickyCards: xb.UICard[] = [];
  private stickyCount = 0;
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;

    this.input = new xb.UITextInput({
      ariaLabel: 'Текст заметки',
      multiline: true,
      value: 'Идея для Samsung Fold XR:\nРазместить заметки вокруг рабочего стола!',
      placeholder: 'Введите заметку...',
      style: {
        width: '100%',
        height: 140,
        minHeight: 140,
        fontSize: 16,
        borderRadius: 16,
        padding: 12,
      },
    });

    this.statusText = new xb.UIText({
      text: 'Стикеры остаются на своих местах в комнате, даже если отвернуться.',
      style: {fontSize: 13, opacity: 0.78, textAlign: 'center'},
    });

    const spawnStickyBtn = createSpatialButton({
      label: 'Прикрепить стикер в 3D',
      icon: 'add',
      fontSize: 15,
      style: {flexGrow: 1, backgroundColor: '#d97706'},
      onClick: () => {
        soundFX.playWindowOpen();
        this.spawnStickyNote();
      },
    }).button;

    const clearStickersBtn = createSpatialButton({
      label: 'Убрать все',
      icon: 'delete',
      fontSize: 15,
      style: {backgroundColor: 'rgba(255, 255, 255, 0.12)'},
      onClick: () => {
        soundFX.playWindowClose();
        this.clearStickers();
      },
    }).button;

    this.card = new xb.UICard({
      size: {width: 0.52, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 16,
      },
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card);

    const header = createWindowHeader({
      title: 'Заметки',
      icon: 'edit_note',
      accentColor: '#f59e0b',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(
      header,
      this.input,
      new xb.UIPanel({
        style: {width: '100%', flexDirection: 'row', gap: 10},
        children: [spawnStickyBtn, clearStickersBtn],
      }),
      this.statusText
    );
    this.card.name = 'Notes window';
    this.add(this.card);
  }

  init(): void {
    this.recenter(xb.core.camera, 2);
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 2): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: slot.distance,
      angleRad: slot.angleRad,
      heightOffset: slot.heightOffset,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  private spawnStickyNote(): void {
    const text = this.input.value.trim() || 'Пустой стикер';
    const color = STICKY_COLORS[this.stickyCount % STICKY_COLORS.length];
    const index = this.stickyCount++;

    let stickyCard!: xb.UICard;
    const closeBtn = new xb.UIButton({
      ariaLabel: 'Удалить стикер',
      onClick: () => {
        soundFX.playWindowClose();
        stickyCard.removeFromParent();
        this.stickyCards = this.stickyCards.filter((c) => c !== stickyCard);
        this.statusText.text = `Активных стикеров: ${this.stickyCards.length}`;
      },
      style: {
        width: 30,
        height: 30,
        paddingLeft: 0,
        paddingRight: 0,
        borderRadius: 15,
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
      },
      children: [
        new xb.UIIcon({
          icon: 'close',
          pointerEvents: 'none',
          style: {width: 16, height: 16, color: '#ffffff'},
        }),
      ],
    });

    stickyCard = new xb.UICard({
      size: {width: 0.3, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        borderRadius: 20,
        backgroundColor: color,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        borderWidth: 1.5,
      },
      children: [
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          children: [
            new xb.UIText({
              text: `Стикер #${index + 1}`,
              pointerEvents: 'none',
              style: {fontSize: 14, fontWeight: 'bold'},
            }),
            closeBtn,
          ],
        }),
        new xb.UIText({
          text,
          pointerEvents: 'none',
          style: {fontSize: 16, lineHeight: 1.35, whiteSpace: 'pre-line'},
        }),
      ],
    });
    stickyCard.name = `Sticky note ${index + 1}`;
    const angle = ((index % 5) - 2) * 0.24;
    placeObjectInFrontOfCamera(stickyCard, xb.core.camera, {
      distance: 0.92,
      angleRad: angle,
      heightOffset: 0.14 - (index % 2) * 0.18,
    });
    this.add(stickyCard);
    this.stickyCards.push(stickyCard);
    this.statusText.text = `Стикер прикреплён! Всего в комнате: ${this.stickyCards.length}`;
  }

  private clearStickers(): void {
    for (const c of this.stickyCards) {
      c.removeFromParent();
    }
    this.stickyCards = [];
    this.statusText.text = 'Все 3D-стикеры удалены.';
  }

  dispose(): void {
    this.windowController.dispose();
    this.clearStickers();
  }
}
