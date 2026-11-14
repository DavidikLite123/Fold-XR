import * as THREE from 'three';
import * as xb from 'xrblocks';
import {CalculatorLogic} from './CalculatorLogic';
import {
  createSpatialButton,
  createWindowHeader,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
  type SpatialAppInstance,
} from '../../os/SpatialWindow';
import {computeWindowArcSlot} from '../../os/SpatialOSState';
import {soundFX} from '../../utils/SoundFX';

const KEYPAD_ROWS: ReadonlyArray<
  ReadonlyArray<{label: string; action: 'digit' | 'op' | 'clear' | 'back' | 'eq'; bg?: string}>
> = [
  [
    {label: 'C', action: 'clear', bg: 'rgba(244, 63, 94, 0.32)'},
    {label: '(', action: 'digit'},
    {label: ')', action: 'digit'},
    {label: '/', action: 'op', bg: 'rgba(16, 185, 129, 0.32)'},
  ],
  [
    {label: '7', action: 'digit'},
    {label: '8', action: 'digit'},
    {label: '9', action: 'digit'},
    {label: '*', action: 'op', bg: 'rgba(16, 185, 129, 0.32)'},
  ],
  [
    {label: '4', action: 'digit'},
    {label: '5', action: 'digit'},
    {label: '6', action: 'digit'},
    {label: '-', action: 'op', bg: 'rgba(16, 185, 129, 0.32)'},
  ],
  [
    {label: '1', action: 'digit'},
    {label: '2', action: 'digit'},
    {label: '3', action: 'digit'},
    {label: '+', action: 'op', bg: 'rgba(16, 185, 129, 0.32)'},
  ],
  [
    {label: '0', action: 'digit'},
    {label: '.', action: 'digit'},
    {label: '⌫', action: 'back'},
    {label: '=', action: 'eq', bg: '#10b981'},
  ],
];

export class CalculatorApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'calculator';
  private logic = new CalculatorLogic();
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private previewText: xb.UIText;
  private displayText: xb.UIText;
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;

    this.previewText = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        fontSize: 16,
        textAlign: 'right',
        opacity: 0.68,
        minHeight: 22,
      },
    });
    this.displayText = new xb.UIText({
      text: '0',
      style: {
        width: '100%',
        fontSize: 34,
        fontWeight: 'bold',
        textAlign: 'right',
      },
    });

    const displayPanel = new xb.UIPanel({
      style: {
        width: '100%',
        padding: 14,
        borderRadius: 18,
        backgroundColor: 'rgba(8, 13, 24, 0.65)',
        flexDirection: 'column',
        gap: 4,
      },
      children: [this.previewText, this.displayText],
    });

    const rows = KEYPAD_ROWS.map(
      (row) =>
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            gap: 8,
          },
          children: row.map(
            (key) =>
              createSpatialButton({
                label: key.label,
                ariaLabel: `Клавиша ${key.label}`,
                fontSize: 20,
                fontWeight: 'bold',
                style: {
                  flexGrow: 1,
                  height: 48,
                  borderRadius: 16,
                  paddingLeft: 6,
                  paddingRight: 6,
                  ...(key.bg ? {backgroundColor: key.bg} : {}),
                },
                onClick: () => {
                  soundFX.playTap();
                  this.handleKey(key.label, key.action);
                },
              }).button
          ),
        })
    );

    this.card = new xb.UICard({
      size: {width: 0.46, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 16,
      },
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card);

    const header = createWindowHeader({
      title: 'Калькулятор',
      icon: 'calculate',
      accentColor: '#10b981',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(header, displayPanel, ...rows);
    this.card.name = 'Calculator window';
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
      heightOffset: slot.heightOffset,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  dispose(): void {
    this.windowController.dispose();
  }

  private handleKey(
    label: string,
    action: 'digit' | 'op' | 'clear' | 'back' | 'eq'
  ): void {
    if (action === 'digit') {
      this.logic.inputDigit(label);
    } else if (action === 'op') {
      this.logic.inputOperator(label as '+' | '-' | '*' | '/');
    } else if (action === 'clear') {
      this.logic.clear();
    } else if (action === 'back') {
      this.logic.backspace();
    } else if (action === 'eq') {
      this.logic.evaluate();
    }
    this.displayText.text = this.logic.expression;
    this.previewText.text = this.logic.resultPreview;
  }
}
