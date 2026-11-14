export interface OrbitalTargetState {
  id: number;
  x: number;
  y: number;
  z: number;
  baseY: number;
  orbitAngle: number;
  orbitSpeed: number;
  bobPhase: number;
  radius: number;
  points: number;
  hp: number;
  alive: boolean;
}

export class OrbitalShooterLogic {
  score = 0;
  highScore = 0;
  combo = 1;
  wave = 1;
  timeRemaining = 45;
  running = false;
  gameOver = false;
  targets: OrbitalTargetState[] = [];
  private nextTargetId = 1;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  startGame(): void {
    this.score = 0;
    this.combo = 1;
    this.wave = 1;
    this.timeRemaining = 45;
    this.running = true;
    this.gameOver = false;
    this.targets = [];
    this.spawnWave(4);
  }

  stopGame(): void {
    this.running = false;
  }

  spawnWave(count = 4 + Math.min(4, this.wave - 1)): void {
    for (let i = 0; i < count; i++) {
      this.targets.push(this.createTarget(i, count));
    }
  }

  private createTarget(index: number, total: number): OrbitalTargetState {
    const spread = Math.PI * 0.9;
    const baseAngle =
      total > 1 ? -spread / 2 + (index / (total - 1)) * spread : 0;
    const jitter = (this.rng() - 0.5) * 0.25;
    const angle = baseAngle + jitter;
    const dist = 1.65 + this.rng() * 0.85;
    const y = 1.2 + (this.rng() - 0.35) * 0.7;
    const isElite = this.wave >= 2 && this.rng() > 0.72;
    return {
      id: this.nextTargetId++,
      x: Math.sin(angle) * dist,
      y,
      z: -Math.cos(angle) * dist,
      baseY: y,
      orbitAngle: angle,
      orbitSpeed: (this.rng() > 0.5 ? 1 : -1) * (0.18 + this.rng() * 0.22),
      bobPhase: this.rng() * Math.PI * 2,
      radius: isElite ? 0.11 : 0.14,
      points: isElite ? 250 : 100,
      hp: isElite ? 2 : 1,
      alive: true,
    };
  }

  step(dt: number, elapsedSeconds: number): {waveCleared: boolean} {
    if (!this.running) return {waveCleared: false};
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    if (this.timeRemaining <= 0) {
      this.running = false;
      this.gameOver = true;
      this.highScore = Math.max(this.highScore, this.score);
      return {waveCleared: false};
    }

    for (const target of this.targets) {
      if (!target.alive) continue;
      target.orbitAngle += target.orbitSpeed * dt;
      if (target.orbitAngle > 1.15 || target.orbitAngle < -1.15) {
        target.orbitSpeed *= -1;
      }
      const dist = Math.hypot(target.x, target.z) || 1.9;
      target.x = Math.sin(target.orbitAngle) * dist;
      target.z = -Math.cos(target.orbitAngle) * dist;
      target.y = target.baseY + Math.sin(elapsedSeconds * 2.1 + target.bobPhase) * 0.1;
    }

    const aliveCount = this.targets.filter((t) => t.alive).length;
    if (aliveCount === 0) {
      this.wave++;
      this.timeRemaining = Math.min(60, this.timeRemaining + 6);
      this.spawnWave();
      return {waveCleared: true};
    }
    return {waveCleared: false};
  }

  hitTarget(targetId: number): {destroyed: boolean; awarded: number} {
    if (!this.running) return {destroyed: false, awarded: 0};
    const target = this.targets.find((t) => t.id === targetId && t.alive);
    if (!target) return {destroyed: false, awarded: 0};

    target.hp -= 1;
    if (target.hp <= 0) {
      target.alive = false;
      const awarded = target.points * this.combo;
      this.score += awarded;
      this.highScore = Math.max(this.highScore, this.score);
      this.combo = Math.min(8, this.combo + 1);
      return {destroyed: true, awarded};
    }

    const chipPoints = 40 * this.combo;
    this.score += chipPoints;
    this.highScore = Math.max(this.highScore, this.score);
    return {destroyed: false, awarded: chipPoints};
  }

  registerMiss(): void {
    if (!this.running) return;
    this.combo = 1;
  }
}
