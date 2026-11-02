// Optional, quiet synthesised soundscape (WebAudio). Off by default. No sudden loud sounds.
export class Sound {
  constructor() { this.on = false; this.ctx = null; this.master = null; this.drone = null; }
  toggle() { this.on ? this.disable() : this.enable(); return this.on; }
  enable() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.0; this.master.connect(this.ctx.destination);
      this.master.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 1.5);
      const o1 = this.ctx.createOscillator(); const o2 = this.ctx.createOscillator(); const f = this.ctx.createBiquadFilter();
      o1.type = 'sawtooth'; o1.frequency.value = 55; o2.type = 'sine'; o2.frequency.value = 82.4;
      f.type = 'lowpass'; f.frequency.value = 260;
      const g = this.ctx.createGain(); g.gain.value = 0.25;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 90; lfo.connect(lg); lg.connect(f.frequency);
      o1.start(); o2.start(); lfo.start();
      this.drone = [o1, o2, lfo]; this.on = true;
    } catch { this.on = false; }
  }
  disable() {
    if (this.drone) this.drone.forEach((o) => { try { o.stop(); } catch { /* noop */ } });
    this.drone = null; this.on = false;
  }
  blip(kind = 'tick') {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    const map = { tick: [660, 0.05, 0.12], good: [880, 0.08, 0.35], power: [220, 0.1, 1.6], warn: [196, 0.06, 0.5], reveal: [523, 0.07, 0.4] };
    const [freq, vol, dur] = map[kind] || map.tick;
    o.type = kind === 'power' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(freq, t);
    if (kind === 'power') o.frequency.exponentialRampToValueAtTime(880, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
}
