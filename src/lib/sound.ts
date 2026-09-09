/**
 * 顶级程序化音效（Web Audio API，无需外部文件）
 * 赌场质感：发牌、下注、弃牌、看牌、比牌、胜利、按钮
 */

type Tone = { freq: number; dur: number; type?: OscillatorType; gain?: number; delay?: number };

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master = 0.35;
  private enabled = true;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  isEnabled() {
    return this.enabled;
  }

  setVolume(v: number) {
    this.master = Math.max(0, Math.min(1, v));
  }

  private tone(opts: Tone) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    const vol = (opts.gain ?? 0.2) * this.master;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  private noise(dur: number, gain = 0.08, delay = 0) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    const vol = gain * this.master;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.01);
  }

  /** 按钮点击 */
  click() {
    this.tone({ freq: 880, dur: 0.04, type: 'triangle', gain: 0.12 });
    this.tone({ freq: 1320, dur: 0.03, type: 'sine', gain: 0.06, delay: 0.02 });
  }

  /** 发牌 / 翻牌 */
  deal(i = 0) {
    this.noise(0.045, 0.1, i * 0.07);
    this.tone({ freq: 420 + i * 40, dur: 0.06, type: 'triangle', gain: 0.08, delay: i * 0.07 });
  }

  /** 筹码落下 */
  chip() {
    this.tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.06 });
    this.tone({ freq: 780, dur: 0.08, type: 'triangle', gain: 0.09, delay: 0.03 });
    this.noise(0.03, 0.05, 0.02);
  }

  /** 看牌：翻牌感 */
  look() {
    this.noise(0.05, 0.1, 0);
    this.tone({ freq: 480, dur: 0.07, type: 'triangle', gain: 0.1 });
    this.tone({ freq: 720, dur: 0.09, type: 'sine', gain: 0.12, delay: 0.05 });
    this.tone({ freq: 960, dur: 0.11, type: 'sine', gain: 0.08, delay: 0.1 });
  }

  /** 弃牌 */
  fold() {
    this.tone({ freq: 300, dur: 0.12, type: 'sawtooth', gain: 0.07 });
    this.tone({ freq: 180, dur: 0.18, type: 'triangle', gain: 0.09, delay: 0.05 });
  }

  /** 加注 */
  raise() {
    this.chip();
    this.tone({ freq: 660, dur: 0.1, type: 'square', gain: 0.08, delay: 0.05 });
    this.tone({ freq: 990, dur: 0.12, type: 'sine', gain: 0.1, delay: 0.1 });
  }

  /** 比牌紧张感 */
  compare() {
    this.tone({ freq: 220, dur: 0.15, type: 'sawtooth', gain: 0.1 });
    this.tone({ freq: 330, dur: 0.15, type: 'sawtooth', gain: 0.08, delay: 0.12 });
    this.tone({ freq: 440, dur: 0.2, type: 'triangle', gain: 0.12, delay: 0.24 });
  }

  /** 胜利 */
  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.22, type: 'sine', gain: 0.14, delay: i * 0.1 });
      this.tone({ freq: f * 2, dur: 0.15, type: 'triangle', gain: 0.05, delay: i * 0.1 + 0.04 });
    });
  }

  /** 失败 / 出局 */
  lose() {
    this.tone({ freq: 400, dur: 0.15, type: 'sine', gain: 0.1 });
    this.tone({ freq: 300, dur: 0.2, type: 'sine', gain: 0.1, delay: 0.12 });
    this.tone({ freq: 200, dur: 0.28, type: 'triangle', gain: 0.12, delay: 0.28 });
  }

  /** 轮到你 */
  yourTurn() {
    this.tone({ freq: 880, dur: 0.08, type: 'sine', gain: 0.1 });
    this.tone({ freq: 1100, dur: 0.1, type: 'sine', gain: 0.08, delay: 0.1 });
  }

  /** 开局 */
  start() {
    [392, 494, 587].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.15, type: 'triangle', gain: 0.12, delay: i * 0.09 }),
    );
    setTimeout(() => {
      this.deal(0);
      this.deal(1);
      this.deal(2);
    }, 280);
  }
}

export const sound = new SoundEngine();
