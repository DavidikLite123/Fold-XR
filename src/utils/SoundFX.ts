/**
 * Procedural Web Audio synthesizer for Spatial OS UI feedback, games, and Synth Pad.
 * Zero external audio assets (zero 404 risk).
 */
class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext?: typeof AudioContext})
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTap(): void {
    this.playTone(620, 880, 0.055, 'sine', 0.07);
  }

  playSwipe(direction: -1 | 1): void {
    const start = direction > 0 ? 340 : 520;
    const end = direction > 0 ? 560 : 300;
    this.playTone(start, end, 0.11, 'triangle', 0.08);
  }

  playWindowOpen(): void {
    this.playTone(420, 740, 0.14, 'sine', 0.08);
  }

  playWindowClose(): void {
    this.playTone(540, 280, 0.12, 'sine', 0.07);
  }

  playLaser(): void {
    this.playTone(960, 240, 0.14, 'sawtooth', 0.06);
  }

  playExplosion(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.24);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playChime(freq: number, wave: OscillatorType = 'triangle', duration = 0.28): void {
    this.playTone(freq, freq * 1.005, duration, wave, 0.11);
  }

  playError(): void {
    this.playTone(220, 140, 0.2, 'sawtooth', 0.09);
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      now + duration
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }
}

export const soundFX = new SpatialAudioEngine();
