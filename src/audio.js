// Tiny procedural audio engine. Everything is synthesized at runtime.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOn = false;
    this.sirenOn = false;
    this.nextNote = 0;
    this.step = 0;
    this.musicOn = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.85;
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.24;
    this.music.connect(this.master);

    // Shared delay for the music arpeggio.
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.31;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.28;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.music);

    // Noise buffer shared by effects.
    const len = Math.floor(ctx.sampleRate * 1.2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this._buildEngine();
    this._buildSiren();
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 620;
    this.engFilter.Q.value = 2.5;
    this.engGain.connect(this.engFilter);
    this.engFilter.connect(this.sfx);

    this.engOscA = ctx.createOscillator();
    this.engOscA.type = 'sawtooth';
    this.engOscA.frequency.value = 55;
    this.engOscB = ctx.createOscillator();
    this.engOscB.type = 'square';
    this.engOscB.frequency.value = 27.5;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.45;
    this.engOscA.connect(this.engGain);
    this.engOscB.connect(bGain);
    bGain.connect(this.engGain);
    this.engOscA.start();
    this.engOscB.start();

    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    const tireFilter = ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 1400;
    tireFilter.Q.value = 1.4;
    this.tireGain.connect(tireFilter);
    tireFilter.connect(this.sfx);
    this.tireNoise = ctx.createBufferSource();
    this.tireNoise.buffer = this.noiseBuf;
    this.tireNoise.loop = true;
    this.tireNoise.connect(this.tireGain);
    this.tireNoise.start();
  }

  _buildSiren() {
    const ctx = this.ctx;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    this.sirenGain.connect(filter);
    filter.connect(this.sfx);
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  updateEngine(speedKmh, throttle, braking) {
    if (!this.ctx) return;
    const on = this.engineOn;
    const t = this.ctx.currentTime;
    const rpm = Math.min(1, Math.abs(speedKmh) / 240);
    const freq = 46 + rpm * 105 + Math.max(0, throttle) * 22;
    this.engGain.gain.setTargetAtTime(on ? 0.075 + Math.abs(throttle) * 0.055 : 0, t, 0.08);
    this.engOscA.frequency.setTargetAtTime(freq, t, 0.06);
    this.engOscB.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(360 + rpm * 900 + Math.abs(throttle) * 320, t, 0.09);
    const skid = on && braking && Math.abs(speedKmh) > 55 ? Math.min(0.05, Math.abs(speedKmh) / 9000) : 0;
    this.tireGain.gain.setTargetAtTime(skid, t, 0.12);
  }

  updateSiren(on, time) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.15);
    if (on) {
      const wail = Math.sin(time * 5.2) > 0 ? 880 : 640;
      this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
    }
  }

  gunshot() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3600, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + 0.18);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.35, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og); og.connect(this.sfx);
    osc.start(t); osc.stop(t + 0.13);
  }

  explosion() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + 1.0);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(og); og.connect(this.sfx);
    osc.start(t); osc.stop(t + 0.8);
  }

  thud() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g); g.connect(this.sfx);
    osc.start(t); osc.stop(t + 0.19);
  }

  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g); g.connect(this.sfx);
    osc.start(t); osc.stop(t + 0.17);
  }

  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    [660, 880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.24);
      osc.connect(g); g.connect(this.sfx);
      osc.start(t + i * 0.07); osc.stop(t + i * 0.07 + 0.26);
    });
  }

  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 340;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g); g.connect(this.sfx);
    osc.start(t); osc.stop(t + 0.34);
  }

  // Ambient synthwave loop, scheduled ahead of the audio clock.
  updateMusic() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const ctx = this.ctx;
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime + 0.05;
    const stepDur = 0.245;
    const chords = [
      { bass: 55.0, arp: [220.0, 261.63, 329.63, 440.0, 329.63, 261.63, 440.0, 523.25] },
      { bass: 43.65, arp: [174.61, 220.0, 261.63, 349.23, 261.63, 220.0, 349.23, 440.0] },
      { bass: 65.41, arp: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 523.25, 659.25] },
      { bass: 49.0, arp: [196.0, 246.94, 293.66, 392.0, 293.66, 246.94, 392.0, 493.88] },
    ];
    while (this.nextNote < ctx.currentTime + 0.15) {
      const bar = Math.floor(this.step / 8) % 4;
      const beat = this.step % 8;
      const t = this.nextNote;
      const chord = chords[bar];

      if (beat === 0) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = chord.bass;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 260;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 7.6);
        osc.connect(f); f.connect(g); g.connect(this.music);
        osc.start(t); osc.stop(t + stepDur * 7.8);
      }

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = chord.arp[beat];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(g);
      g.connect(this.music);
      g.connect(this.delay);
      osc.start(t); osc.stop(t + 0.22);

      this.nextNote += stepDur;
      this.step++;
    }
  }
}
