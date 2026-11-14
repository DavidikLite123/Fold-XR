export type MemoryPhase = 'idle' | 'showing' | 'input' | 'gameover';

export class MemoryMatrixLogic {
  readonly gridSize = 9;
  sequence: number[] = [];
  inputIndex = 0;
  level = 0;
  bestLevel = 0;
  phase: MemoryPhase = 'idle';
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  start(): number[] {
    this.sequence = [];
    this.level = 0;
    this.inputIndex = 0;
    return this.advanceLevel();
  }

  advanceLevel(): number[] {
    this.level += 1;
    this.bestLevel = Math.max(this.bestLevel, this.level - 1);
    const nextCell = Math.floor(this.rng() * this.gridSize);
    this.sequence.push(nextCell);
    this.inputIndex = 0;
    this.phase = 'showing';
    return [...this.sequence];
  }

  finishShowing(): void {
    if (this.phase === 'showing') {
      this.phase = 'input';
      this.inputIndex = 0;
    }
  }

  submitCell(index: number): 'correct' | 'level-complete' | 'wrong' | 'ignored' {
    if (this.phase !== 'input') return 'ignored';
    if (this.sequence[this.inputIndex] === index) {
      this.inputIndex += 1;
      if (this.inputIndex >= this.sequence.length) {
        this.bestLevel = Math.max(this.bestLevel, this.level);
        return 'level-complete';
      }
      return 'correct';
    }
    this.phase = 'gameover';
    return 'wrong';
  }
}
