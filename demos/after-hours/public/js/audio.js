// Sound: the teacher's own music track (audio/day.mp3, optional audio/night.mp3) plus soft synthesized effects.
// If no track is found, a small built-in loop is used instead.
export class Sound {
  constructor({ music = false } = {}) {
    this.ctx = null; this.sfxOn = true; this.musicOn = music; this.night = false;
    this.tracks = {}; this.src = null; this.timer = null; this.step = 0; this.available = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
      this.comp = this.ctx.createDynamicsCompressor(); this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
      // music chain: source -> lowpass (night) -> musicGain -> master
      this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 18000;
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.0;
      this.filter.connect(this.musicGain); this.musicGain.connect(this.master);
      // a short soft echo for effects
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      const d = this.ctx.createDelay(); d.delayTime.value = 0.13; const fb = this.ctx.createGain(); fb.gain.value = 0.22; const wet = this.ctx.createGain(); wet.gain.value = 0.25;
      this.sfxBus.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(this.master);
      return true;
    } catch { return false; }
  }

  // ---------------- effects ----------------
  note(freq, at, dur, { type = 'sine', vol = 0.1, slide = 0, attack = 0.008 } = {}) {
    const t = this.ctx.currentTime + at; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  bellTone(freq, at, dur, vol) { // warm bell: fundamental + soft inharmonic partials
    for (const [m, v] of [[1, 1], [2.01, 0.35], [3.02, 0.15], [4.2, 0.08]]) this.note(freq * m, at, dur * (1.1 - m * 0.12), { vol: vol * v, attack: 0.004 });
  }
  play(name) {
    if (!this.sfxOn || !this.ensure()) return;
    const n = (s) => 440 * 2 ** (s / 12);
    switch (name) {
      case 'correct': this.bellTone(n(7), 0, 0.5, 0.09); this.bellTone(n(14), 0.09, 0.7, 0.08); break;
      case 'wrong': this.note(n(-8), 0, 0.22, { type: 'triangle', vol: 0.09, slide: 0.8 }); this.note(n(-13), 0.12, 0.3, { type: 'triangle', vol: 0.08, slide: 0.85 }); break;
      case 'open': this.note(n(9), 0, 0.09, { type: 'triangle', vol: 0.07 }); this.note(n(16), 0.05, 0.12, { type: 'triangle', vol: 0.06 }); break;
      case 'loot': [16, 19, 23, 28].forEach((s, i) => this.note(n(s), i * 0.045, 0.18, { vol: 0.05 })); break;
      case 'deliver': this.note(n(-5), 0, 0.5, { type: 'triangle', vol: 0.07, slide: 2 }); [4, 7, 11, 16].forEach((s, i) => this.bellTone(n(s), 0.18 + i * 0.07, 0.6, 0.05)); break;
      case 'tag': this.note(n(2), 0, 0.42, { vol: 0.12, slide: 0.45 }); this.note(n(14), 0.04, 0.3, { vol: 0.04, slide: 0.5 }); break;
      case 'cure': [12, 16, 19].forEach((s, i) => this.note(n(s), i * 0.06, 0.25, { vol: 0.06 })); break;
      case 'event': [0, 4, 7].forEach((s, i) => this.note(n(s), i * 0.1, 0.25, { type: 'triangle', vol: 0.06 })); break;
      case 'bell': this.bellTone(n(4), 0, 1.0, 0.11); this.bellTone(n(0), 0.45, 1.2, 0.11); break; // school bell ding-dong
      case 'sing': [12, 16, 19, 24].forEach((s, i) => this.note(n(s), i * 0.08, 0.16, { type: 'triangle', vol: 0.045 })); break;
      case 'tick': this.note(n(12), 0, 0.06, { type: 'triangle', vol: 0.06 }); break;
      case 'go': this.bellTone(n(12), 0, 0.6, 0.1); break;
      case 'win': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.bellTone(n(s), i * 0.1, 0.7, 0.06)); break;
      case 'owl': this.note(n(-2), 0, 0.34, { vol: 0.1, slide: 0.92, attack: 0.05 }); this.note(n(-5), 0.42, 0.55, { vol: 0.1, slide: 0.9, attack: 0.05 }); break;
      case 'pop': this.note(n(19), 0, 0.07, { vol: 0.07 }); break;
      default: break;
    }
  }

  // ---------------- music ----------------
  async load(kind) {
    if (this.tracks[kind] !== undefined) return this.tracks[kind];
    this.tracks[kind] = null;
    if (this.available && !this.available.includes(kind)) return null; // only ask for files the server has
    try {
      const r = await fetch(`audio/${kind}.mp3`, { cache: 'force-cache' });
      if (!r.ok) return null;
      this.tracks[kind] = await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch { this.tracks[kind] = null; }
    return this.tracks[kind];
  }
  async setMusic(on) {
    this.musicOn = on;
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    if (!on) { this.musicGain.gain.cancelScheduledValues(t); this.musicGain.gain.linearRampToValueAtTime(0, t + 0.4); clearInterval(this.timer); this.timer = null; return; }
    await this.startTrack();
  }
  async startTrack() {
    const want = this.night && (await this.load('night')) ? 'night' : 'day';
    const buf = await this.load(want);
    if (!this.musicOn) return;
    const t = this.ctx.currentTime;
    if (!buf) { this.startSynth(); this.musicGain.gain.linearRampToValueAtTime(0.5, t + 1); return; }
    if (this.src && this.srcKind === want) { this.applyNight(); this.musicGain.gain.linearRampToValueAtTime(this.night ? 0.32 : 0.45, t + 1); return; }
    const old = this.src;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(this.filter); src.start();
    this.src = src; this.srcKind = want;
    if (old) setTimeout(() => { try { old.stop(); } catch { /* already stopped */ } }, 900);
    this.applyNight();
    this.musicGain.gain.cancelScheduledValues(t); this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t); this.musicGain.gain.linearRampToValueAtTime(this.night ? 0.32 : 0.45, t + 1.2);
  }
  // Night without a night track: the day song goes slower, softer and muffled.
  applyNight() {
    const t = this.ctx.currentTime; const muffle = this.night && this.srcKind !== 'night';
    this.filter.frequency.cancelScheduledValues(t); this.filter.frequency.setValueAtTime(this.filter.frequency.value, t);
    this.filter.frequency.exponentialRampToValueAtTime(muffle ? 700 : 18000, t + 1.5);
    if (this.src) this.src.playbackRate.setTargetAtTime(muffle ? 0.88 : 1, t, 0.6);
  }
  setNight(on) { this.night = on; if (this.ctx && this.musicOn) this.startTrack(); }

  // fallback loop when no mp3 is present
  startSynth() {
    if (this.timer) return;
    const bass = [-21, -21, -16, -16, -19, -19, -14, -17]; const arp = [3, 7, 10, 15, 3, 7, 12, 10, 2, 5, 9, 14, 0, 3, 7, 12];
    const n = (s) => 440 * 2 ** (s / 12); const beat = 60 / 120 / 2; let next = this.ctx.currentTime + 0.1;
    const tone = (f, at, dur, type, vol) => { const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); const t0 = this.ctx.currentTime + at; o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(this.filter); o.start(t0); o.stop(t0 + dur + 0.05); };
    this.timer = setInterval(() => {
      while (next < this.ctx.currentTime + 0.25) {
        const i = this.step++; const at = next - this.ctx.currentTime;
        if (i % 2 === 0) tone(n(bass[(i >> 2) % 8]), at, beat * 1.6, 'triangle', 0.18);
        tone(n(arp[i % 16] + (this.night ? -12 : 0)), at, beat * 0.9, 'triangle', 0.05);
        next += beat;
      }
    }, 60);
  }
}
