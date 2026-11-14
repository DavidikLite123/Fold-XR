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

interface ExhibitSpec {
  id: string;
  title: string;
  description: string;
  build: () => {group: THREE.Group; animate?: (dt: number) => void; dispose: () => void};
}

function buildOrrery(): {
  group: THREE.Group;
  animate: (dt: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const disposables: Array<{dispose: () => void}> = [];

  const sunGeo = new THREE.SphereGeometry(0.068, 24, 20);
  const sunMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.1,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  group.add(sun);
  disposables.push(sunGeo, sunMat);

  const ringGeo = new THREE.TorusGeometry(0.14, 0.0025, 8, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.7,
    metalness: 0.3,
  });
  const orbit1 = new THREE.Mesh(ringGeo, ringMat);
  orbit1.rotation.x = Math.PI / 2;
  group.add(orbit1);

  const ringGeo2 = new THREE.TorusGeometry(0.21, 0.0025, 8, 56);
  const orbit2 = new THREE.Mesh(ringGeo2, ringMat);
  orbit2.rotation.x = Math.PI / 2;
  group.add(orbit2);
  disposables.push(ringGeo, ringGeo2, ringMat);

  const p1Pivot = new THREE.Group();
  const p1Geo = new THREE.SphereGeometry(0.022, 18, 16);
  const p1Mat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.4,
    metalness: 0.2,
  });
  const p1 = new THREE.Mesh(p1Geo, p1Mat);
  p1.position.x = 0.14;
  p1Pivot.add(p1);
  group.add(p1Pivot);
  disposables.push(p1Geo, p1Mat);

  const p2Pivot = new THREE.Group();
  const p2Geo = new THREE.SphereGeometry(0.03, 18, 16);
  const p2Mat = new THREE.MeshStandardMaterial({
    color: 0xe879f9,
    roughness: 0.5,
    metalness: 0.15,
  });
  const p2 = new THREE.Mesh(p2Geo, p2Mat);
  p2.position.x = 0.21;
  const satRingGeo = new THREE.RingGeometry(0.038, 0.052, 24);
  const satRingMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  const satRing = new THREE.Mesh(satRingGeo, satRingMat);
  satRing.rotation.x = Math.PI / 2.4;
  p2.add(satRing);
  p2Pivot.add(p2);
  group.add(p2Pivot);
  disposables.push(p2Geo, p2Mat, satRingGeo, satRingMat);

  return {
    group,
    animate: (dt: number) => {
      sun.rotation.y += dt * 0.4;
      p1Pivot.rotation.y += dt * 1.4;
      p2Pivot.rotation.y += dt * 0.85;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

function buildSatellite(): {
  group: THREE.Group;
  animate: (dt: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const disposables: Array<{dispose: () => void}> = [];

  const bodyGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.11, 8);
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.28,
    metalness: 0.9,
  });
  const body = new THREE.Mesh(bodyGeo, goldMat);
  group.add(body);

  const wingGeo = new THREE.BoxGeometry(0.18, 0.005, 0.075);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.15,
    metalness: 0.65,
  });
  const leftWing = new THREE.Mesh(wingGeo, panelMat);
  leftWing.position.x = -0.155;
  const rightWing = new THREE.Mesh(wingGeo, panelMat);
  rightWing.position.x = 0.155;
  group.add(leftWing, rightWing);

  const dishGeo = new THREE.ConeGeometry(0.048, 0.032, 20, 1, true);
  const silverMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.35,
    metalness: 0.85,
    side: THREE.DoubleSide,
  });
  const dish = new THREE.Mesh(dishGeo, silverMat);
  dish.position.y = 0.08;
  dish.rotation.x = Math.PI;
  group.add(dish);

  const strutGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.035, 8);
  const strut = new THREE.Mesh(strutGeo, silverMat);
  strut.position.y = 0.065;
  group.add(strut);

  disposables.push(bodyGeo, goldMat, wingGeo, panelMat, dishGeo, silverMat, strutGeo);
  return {
    group,
    animate: (dt: number) => {
      group.rotation.y += dt * 0.45;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

function buildCrystalArtifact(): {
  group: THREE.Group;
  animate: (dt: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const disposables: Array<{dispose: () => void}> = [];

  const crystalGeo = new THREE.OctahedronGeometry(0.085, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x818cf8,
    emissive: 0x4f46e5,
    emissiveIntensity: 0.55,
    roughness: 0.12,
    metalness: 0.25,
  });
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  group.add(crystal);

  const ringGeo1 = new THREE.TorusGeometry(0.135, 0.008, 12, 36);
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.22,
    metalness: 0.92,
  });
  const g1 = new THREE.Mesh(ringGeo1, metalMat);

  const ringGeo2 = new THREE.TorusGeometry(0.165, 0.006, 12, 40);
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.6,
  });
  const g2 = new THREE.Mesh(ringGeo2, accentMat);
  g2.rotation.x = Math.PI / 3;
  group.add(g1, g2);

  disposables.push(crystalGeo, crystalMat, ringGeo1, metalMat, ringGeo2, accentMat);
  return {
    group,
    animate: (dt: number) => {
      crystal.rotation.y += dt * 0.9;
      g1.rotation.x += dt * 0.6;
      g2.rotation.y -= dt * 0.7;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

const EXHIBITS: readonly ExhibitSpec[] = [
  {
    id: 'orrery',
    title: 'Солнечная система',
    description: 'Вращайте орбитальную модель пальцем или рукой в 3D.',
    build: buildOrrery,
  },
  {
    id: 'satellite',
    title: 'Орбитальный спутник',
    description: 'Многокомпонентная PBR-модель с солнечными батареями.',
    build: buildSatellite,
  },
  {
    id: 'crystal',
    title: 'Кристалл Гироскопа',
    description: 'Кинетическая скульптура из титана и светящегося кварца.',
    build: buildCrystalArtifact,
  },
];

export class GalleryApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'gallery';
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private modelViewer: xb.ModelViewer;
  private exhibitIndex = 0;
  private currentAnimate?: (dt: number) => void;
  private currentDispose?: () => void;
  private titleText: xb.UIText;
  private descText: xb.UIText;
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;

    this.modelViewer = new xb.ModelViewer({
      origin: 'center',
      manipulation: {
        actions: {
          rotate: {axis: 'y'},
          scale: {minScale: 0.65, maxScale: 1.8},
        },
        handle: {action: 'rotate'},
      },
    });
    this.add(this.modelViewer);

    this.titleText = new xb.UIText({
      text: EXHIBITS[0].title,
      style: {fontSize: 22, fontWeight: 'bold', textAlign: 'center'},
    });
    this.descText = new xb.UIText({
      text: EXHIBITS[0].description,
      style: {fontSize: 15, opacity: 0.78, textAlign: 'center'},
    });

    const controls = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 10},
      children: [
        createSpatialButton({
          label: 'Назад',
          icon: 'chevron_left',
          fontSize: 15,
          style: {flexGrow: 1},
          onClick: () => {
            soundFX.playSwipe(-1);
            this.showExhibit(this.exhibitIndex - 1);
          },
        }).button,
        createSpatialButton({
          label: 'Далее',
          icon: 'chevron_right',
          iconPosition: 'right',
          fontSize: 15,
          style: {flexGrow: 1},
          onClick: () => {
            soundFX.playSwipe(1);
            this.showExhibit(this.exhibitIndex + 1);
          },
        }).button,
      ],
    });

    this.card = new xb.UICard({
      size: {width: 0.48, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 10, padding: 16},
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card, {
      onScaleChange: (s) => this.modelViewer.scale.setScalar(s),
    });
    this.modelViewer.scale.setScalar(this.windowController.scale);

    const header = createWindowHeader({
      title: '3D-Галерея',
      icon: 'view_in_ar',
      accentColor: '#6366f1',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(header, this.titleText, this.descText, controls);
    this.card.name = '3D Gallery window';
    this.add(this.card);
  }

  init(): void {
    this.recenter(xb.core.camera, 2);
    this.showExhibit(0);
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 2): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: slot.distance,
      angleRad: slot.angleRad,
      heightOffset: -0.22,
    });
    placeObjectInFrontOfCamera(this.modelViewer, camera, {
      distance: slot.distance - 0.05,
      angleRad: slot.angleRad,
      heightOffset: 0.14,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  private showExhibit(index: number): void {
    this.currentDispose?.();
    this.exhibitIndex = (index + EXHIBITS.length) % EXHIBITS.length;
    const spec = EXHIBITS[this.exhibitIndex];
    const built = spec.build();
    this.currentAnimate = built.animate;
    this.currentDispose = built.dispose;
    this.modelViewer.setContent(built.group);
    this.titleText.text = spec.title;
    this.descText.text = spec.description;
  }

  update(): void {
    const dt = xb.getDeltaTime();
    this.currentAnimate?.(dt);
  }

  dispose(): void {
    this.windowController.dispose();
    this.currentDispose?.();
    this.currentDispose = undefined;
  }
}
