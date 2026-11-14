import * as THREE from 'three';
import * as xb from 'xrblocks';
import {OrbitalShooterLogic} from './OrbitalShooterLogic';
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

const _laserStart = new THREE.Vector3();
const _laserEnd = new THREE.Vector3();
const _laserDir = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);

class DroneTarget extends xb.Script {
  readonly targetId: number;
  private coreMesh: THREE.Mesh;
  private ringA: THREE.Mesh;
  private ringB: THREE.Mesh;
  private sensorCap: THREE.Mesh;
  private coreMat: THREE.MeshStandardMaterial;
  private ringAMat: THREE.MeshStandardMaterial;
  private ringBMat: THREE.MeshStandardMaterial;
  private onHit: (targetId: number, event: xb.SelectEvent) => void;

  constructor(
    targetId: number,
    radius: number,
    isElite: boolean,
    onHit: (targetId: number, event: xb.SelectEvent) => void
  ) {
    super();
    this.targetId = targetId;
    this.onHit = onHit;

    const accent = isElite ? 0xf59e0b : 0xf43f5e;
    this.coreMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.25,
    });
    this.ringAMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.3,
      metalness: 0.88,
    });
    this.ringBMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.4,
    });

    this.coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius * 0.62, 1),
      this.coreMat
    );
    this.ringA = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.92, radius * 0.1, 10, 28),
      this.ringAMat
    );
    this.ringB = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.78, radius * 0.07, 8, 24),
      this.ringBMat
    );
    this.ringB.rotation.x = Math.PI / 2;

    this.sensorCap = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.28, radius * 0.42, 12),
      this.ringAMat
    );
    this.sensorCap.position.y = radius * 0.72;

    this.add(this.coreMesh, this.ringA, this.ringB, this.sensorCap);
  }

  onObjectSelectStart(event: xb.SelectEvent): void {
    this.onHit(this.targetId, event);
    event.stopPropagation();
  }

  onObjectTouchStart(event: xb.SelectEvent): void {
    this.onHit(this.targetId, event);
    event.stopPropagation();
  }

  setDamagedVisual(): void {
    this.coreMat.color.setHex(0x38bdf8);
    this.coreMat.emissive.setHex(0x0ea5e9);
  }

  animate(dt: number): void {
    this.ringA.rotation.y += dt * 2.1;
    this.ringA.rotation.x += dt * 0.7;
    this.ringB.rotation.z -= dt * 2.6;
    this.coreMesh.rotation.y -= dt * 1.3;
  }

  dispose(): void {
    this.coreMesh.geometry.dispose();
    this.ringA.geometry.dispose();
    this.ringB.geometry.dispose();
    this.sensorCap.geometry.dispose();
    this.coreMat.dispose();
    this.ringAMat.dispose();
    this.ringBMat.dispose();
  }
}

interface ExplosionFlash {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

export class CosmicBlasterApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'cosmic-blaster';
  private logic = new OrbitalShooterLogic();
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private arenaRoot = new THREE.Group();
  private droneMap = new Map<number, DroneTarget>();
  private flashes: ExplosionFlash[] = [];
  private laserBeam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private laserLife = 0;

  private scoreText: xb.UIText;
  private metaText: xb.UIText;
  private statusText: xb.UIText;
  private startBtn: SpatialButtonHandle;
  private elapsed = 0;
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;
    this.add(this.arenaRoot);

    const beamGeo = new THREE.CylinderGeometry(0.005, 0.008, 1, 8);
    beamGeo.translate(0, 0.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    this.laserBeam = new THREE.Mesh(beamGeo, beamMat);
    this.laserBeam.visible = false;
    this.laserBeam.xb = {pointerEvents: 'none'};
    this.add(this.laserBeam);

    this.scoreText = new xb.UIText({
      text: 'Счёт: 0',
      style: {fontSize: 28, fontWeight: 'bold', color: '#fda4af'},
    });
    this.metaText = new xb.UIText({
      text: 'Волна 1 • Комбо x1 • Время: 45с',
      style: {fontSize: 16, opacity: 0.85},
    });
    this.statusText = new xb.UIText({
      text: 'Нажмите «Старт» и сбивайте 3D-дронов в воздухе вокруг вас!',
      style: {fontSize: 15, opacity: 0.78, textAlign: 'center'},
    });

    this.startBtn = createSpatialButton({
      label: 'Старт игры',
      icon: 'play_arrow',
      fontSize: 16,
      style: {flexGrow: 1, backgroundColor: '#e11d48'},
      onClick: () => {
        soundFX.playWindowOpen();
        this.startNewGame();
      },
    });

    this.card = new xb.UICard({
      size: {width: 0.52, height: 'auto'},
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
      title: 'Космо-Шутер',
      icon: 'rocket_launch',
      accentColor: '#f43f5e',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(
      header,
      new xb.UIPanel({
        style: {
          width: '100%',
          padding: 12,
          borderRadius: 16,
          backgroundColor: 'rgba(15, 10, 24, 0.55)',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        },
        children: [this.scoreText, this.metaText],
      }),
      this.statusText,
      this.startBtn.button
    );
    this.card.name = 'Cosmic Blaster HUD';
    this.add(this.card);
  }

  init(): void {
    this.recenter(xb.core.camera, 0);
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 0): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: 1.08,
      angleRad: slot.angleRad,
      heightOffset: -0.22,
    });
    placeObjectInFrontOfCamera(this.arenaRoot, camera, {
      distance: 0,
      angleRad: 0,
      heightOffset: -1.45,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  private startNewGame(): void {
    placeObjectInFrontOfCamera(this.arenaRoot, xb.core.camera, {
      distance: 0,
      angleRad: 0,
      heightOffset: -1.45,
    });
    this.clearDrones();
    this.logic.startGame();
    this.syncDrones();
    this.startBtn.setLabel('Перезапуск');
    this.statusText.text = 'Огонь! Нажмите или щипните по летающим дронам!';
    this.refreshHud();
  }

  private syncDrones(): void {
    for (const target of this.logic.targets) {
      if (!target.alive) {
        const existing = this.droneMap.get(target.id);
        if (existing) {
          existing.removeFromParent();
          existing.dispose();
          this.droneMap.delete(target.id);
        }
        continue;
      }
      if (!this.droneMap.has(target.id)) {
        const drone = new DroneTarget(
          target.id,
          target.radius,
          target.hp > 1,
          (id, evt) => this.handleDroneHit(id, evt)
        );
        drone.name = `Drone ${target.id}`;
        this.arenaRoot.add(drone);
        this.droneMap.set(target.id, drone);
      }
      const drone = this.droneMap.get(target.id)!;
      drone.position.set(target.x, target.y, target.z);
    }
  }

  private handleDroneHit(targetId: number, event: xb.SelectEvent): void {
    if (!this.logic.running) return;
    const drone = this.droneMap.get(targetId);
    if (!drone) return;

    drone.getWorldPosition(_laserEnd);
    const controller = event.source?.controller;
    if (controller) {
      controller.getWorldPosition(_laserStart);
    } else {
      xb.core.camera.getWorldPosition(_laserStart);
      _laserStart.y -= 0.15;
    }
    this.fireLaser(_laserStart, _laserEnd);

    const res = this.logic.hitTarget(targetId);
    if (res.destroyed) {
      soundFX.playExplosion();
      this.spawnFlash(_laserEnd);
      drone.removeFromParent();
      drone.dispose();
      this.droneMap.delete(targetId);
      this.statusText.text = `+${res.awarded} очков! Комбо x${this.logic.combo}`;
    } else {
      soundFX.playLaser();
      drone.setDamagedVisual();
      this.statusText.text = `Броня пробита! +${res.awarded}`;
    }
    this.refreshHud();
  }

  private fireLaser(start: THREE.Vector3, end: THREE.Vector3): void {
    _laserDir.subVectors(end, start);
    const dist = _laserDir.length();
    if (dist < 0.01) return;
    this.laserBeam.position.copy(start);
    this.laserBeam.scale.set(1, dist, 1);
    _laserDir.normalize();
    this.laserBeam.quaternion.setFromUnitVectors(_upAxis, _laserDir);
    this.laserBeam.visible = true;
    this.laserLife = 0.14;
  }

  private spawnFlash(worldPos: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.16, 20), mat);
    mesh.position.copy(worldPos);
    mesh.lookAt(xb.core.camera.position);
    mesh.xb = {pointerEvents: 'none'};
    this.add(mesh);
    this.flashes.push({mesh, age: 0});
  }

  update(): void {
    const dt = Math.min(xb.getDeltaTime(), 0.05);
    this.elapsed += dt;

    if (this.laserLife > 0) {
      this.laserLife -= dt;
      if (this.laserLife <= 0) this.laserBeam.visible = false;
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      const p = f.age / 0.28;
      if (p >= 1) {
        f.mesh.removeFromParent();
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
      } else {
        f.mesh.scale.setScalar(1 + p * 1.8);
        f.mesh.material.opacity = 1 - p;
      }
    }

    if (!this.logic.running) return;
    const {waveCleared} = this.logic.step(dt, this.elapsed);
    if (waveCleared) {
      soundFX.playWindowOpen();
      this.statusText.text = `Волна ${this.logic.wave}! +6 сек бонус`;
    }
    this.syncDrones();
    for (const drone of this.droneMap.values()) {
      drone.animate(dt);
    }
    this.refreshHud();

    if (this.logic.gameOver) {
      this.clearDrones();
      this.statusText.text = `Время вышло! Рекорд: ${this.logic.highScore}`;
      this.startBtn.setLabel('Играть снова');
    }
  }

  private refreshHud(): void {
    this.scoreText.text = `Счёт: ${this.logic.score}  (Рекорд: ${this.logic.highScore})`;
    this.metaText.text = `Волна ${this.logic.wave} • Комбо x${this.logic.combo} • ${Math.ceil(this.logic.timeRemaining)}с`;
  }

  private clearDrones(): void {
    for (const drone of this.droneMap.values()) {
      drone.removeFromParent();
      drone.dispose();
    }
    this.droneMap.clear();
  }

  dispose(): void {
    this.windowController.dispose();
    this.clearDrones();
    for (const f of this.flashes) {
      f.mesh.removeFromParent();
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
    }
    this.flashes = [];
    this.laserBeam.geometry.dispose();
    this.laserBeam.material.dispose();
  }
}
