// Synthesised sound effects and a bouncy spooky-fun music loop (WebAudio, no audio files).
export class Sound {
  constructor({ music = false } = {}) { this.ctx = null; this.sfxOn = true; this.musicOn = music; this.timer = null; this.step = 0; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
      return true;
    } catch { return false; }
  }
  tone(freq, dur, { type = 'square', vol = 0.12, at = 0, slide = 0, bus } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  play(name) {
    if (!this.sfxOn || !this.ensure()) return;
    const n = (s) => 440 * 2 ** (s / 12);
    switch (name) {
      case 'correct': [0, 4, 7, 12].forEach((s, i) => this.tone(n(s + 3), 0.16, { at: i * 0.07, vol: 0.1 })); break;
      case 'wrong': this.tone(n(-5), 0.25, { type: 'triangle', vol: 0.12, slide: 0.7 }); break;
      case 'open': this.tone(n(5), 0.08, { vol: 0.08 }); this.tone(n(10), 0.1, { at: 0.06, vol: 0.08 }); break;
      case 'loot': [7, 11, 14, 19].forEach((s, i) => this.tone(n(s), 0.12, { type: 'triangle', at: i * 0.05, vol: 0.1 })); break;
      case 'deliver': [0, 4, 7, 12, 16].forEach((s, i) => this.tone(n(s), 0.2, { at: i * 0.06, vol: 0.1 })); break;
      case 'tag': this.tone(300, 0.35, { type: 'sine', vol: 0.18, slide: 0.35 }); this.tone(600, 0.25, { type: 'sine', vol: 0.08, at: 0.05, slide: 2 }); break;
      case 'cure': this.tone(n(12), 0.2, { type: 'sine', vol: 0.1, slide: 1.5 }); break;
      case 'event': [0, 3, 0, 3].forEach((s, i) => this.tone(n(s - 2), 0.14, { type: 'sawtooth', at: i * 0.15, vol: 0.06 })); break;
      case 'tick': this.tone(n(12), 0.05, { vol: 0.06 }); break;
      case 'go': this.tone(n(12), 0.35, { vol: 0.12 }); this.tone(n(19), 0.35, { vol: 0.08 }); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => this.tone(n(s), 0.22, { at: i * 0.11, vol: 0.1 })); break;
      case 'pop': this.tone(n(17), 0.06, { type: 'sine', vol: 0.1 }); break;
      default: break;
    }
  }
  setMusic(on) {
    this.musicOn = on;
    if (!on) { clearInterval(this.timer); this.timer = null; return; }
    if (!this.ensure() || this.timer) return;
    // 8-step loop at ~126 bpm: minor-key bass + bouncy arpeggio (cheerful-spooky)
    const bass = [-21, -21, -16, -16, -19, -19, -14, -17];
    const arp = [3, 7, 10, 15, 3, 7, 12, 10, 2, 5, 9, 14, 0, 3, 7, 12];
    const n = (s) => 440 * 2 ** (s / 12);
    const beat = 60 / 126 / 2; let next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (next < this.ctx.currentTime + 0.25) {
        const i = this.step++; const at = next - this.ctx.currentTime;
        if (i % 2 === 0) this.tone(n(bass[(i >> 2) % 8]), beat * 1.6, { type: 'triangle', vol: 0.22, at, bus: this.musicBus });
        this.tone(n(arp[i % 16] + ((i >> 4) % 2 ? 0 : -12) + 12), beat * 0.8, { type: 'square', vol: 0.05, at, bus: this.musicBus });
        if (i % 4 === 2) this.tone(2000, 0.03, { type: 'square', vol: 0.025, at, bus: this.musicBus });
        next += beat;
      }
    }, 60);
  }
}
