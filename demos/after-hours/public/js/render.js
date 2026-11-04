// World view: camera, cached static map chunks, interpolated players/zombies, effects and event overlays.
import { W, H, LOCKERS, GENERATOR, CREWS, LAMPS, ROOM_OF, ZONES } from './shared/world.js';
import { EMOTE_ICON } from './shared/avatar.js';
import { renderStatic, drawLocker, drawGenerator, drawFuse, drawAvatar, drawZombie, outlinedText, star, rr, INK, TAU } from './art.js';

const CH = 7; // chunk size in tiles
const lerp = (a, b, k) => a + (b - a) * k;

export class WorldView {
  constructor(canvas, { mode = 'phone', reduced = false } = {}) {
    this.cv = canvas; this.c = canvas.getContext('2d'); this.mode = mode; this.reduced = reduced;
    this.roster = new Map(); this.snaps = []; this.me = null; this.local = null;
    this.chunks = new Map(); this.chunkS = 0; this.parts = []; this.texts = []; this.rings = [];
    this.genFlash = 0; this.shake = 0; this.event = null; this.phase = 'lobby'; this.myCooldown = new Map();
    this.cam = { x: 24, y: 13 }; this.t0 = performance.now(); this.t = 0; this.lastFrame = performance.now();
    this.overlay = document.createElement('canvas');
    // one soft warm glow sprite, reused for every lamp (cheap on phones)
    this.glow = document.createElement('canvas'); this.glow.width = this.glow.height = 128;
    { const g = this.glow.getContext('2d'); const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64); rg.addColorStop(0, 'rgba(255,190,110,0.30)'); rg.addColorStop(0.5, 'rgba(255,160,90,0.10)'); rg.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); }
    this.resize(); this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas);
    const loop = (now) => { this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  destroy() { cancelAnimationFrame(this.raf); this._ro.disconnect(); }
  resize() {
    const dpr = Math.min(this.mode === 'phone' ? 2.5 : 2, window.devicePixelRatio || 1);
    const w = Math.max(10, this.cv.clientWidth), h = Math.max(10, this.cv.clientHeight);
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dpr = dpr; this.w = w; this.h = h;
    if (this.mode === 'phone') this.S = Math.round(Math.max(34, Math.min(w / 8.2, h / 12)));
    else this.S = Math.min(w / W, h / H);
    this.overlay.width = this.cv.width; this.overlay.height = this.cv.height;
  }
  setVocab(list) { this.vocab = (list || []).map((v) => v.word).filter(Boolean); }
  setRoster(list) { this.roster = new Map(list.map((p) => [p.n, p])); }
  setMe(n) { this.me = n; }
  setLocal(x, y, dir, moving) { this.local = { x, y, dir, moving }; }
  push(s) {
    s._at = performance.now(); this.snaps.push(s); if (this.snaps.length > 4) this.snaps.shift();
    this.phase = s.ph; this.event = s.ev ? s.ev[0] : null; this.nightLeft = s.nt || 0;
  }
  latest() { return this.snaps[this.snaps.length - 1]; }

  // ---------------- effects ----------------
  posOf(n) { const p = this.interp().players.get(n); return p ? [p.x, p.y] : null; }
  fx(m) {
    const pos = m.n !== undefined ? this.posOf(m.n) : null;
    const crewCol = m.crew !== undefined ? CREWS[m.crew].color : '#ffd23f';
    const label = { fuse: '+1 FUSE!', gold: 'GOLDEN FUSE!', boots: 'SPEED BOOTS!', shield: 'SHIELD!', zap: 'ZAP!' };
    if (m.k === 'loot' && pos) { this.burst(pos[0], pos[1] - 1, 14, ['#ffd23f', '#ffffff', '#ff9ccc'], 'spark'); this.text(pos[0], pos[1] - 1.6, label[m.item] || 'LOOT!', '#ffd23f'); }
    if (m.k === 'deliver') { this.burst(GENERATOR.x, GENERATOR.y - 0.6, 40, [crewCol, '#ffd23f', '#ffffff', '#ff5fa2', '#2ec4ff'], 'confetti'); this.text(GENERATOR.x, GENERATOR.y - 2, `+${m.pts}`, crewCol, 1.6); this.genFlash = 1; if (m.n === this.me) this.shake = 6; }
    if (m.k === 'tag' && pos) { this.burst(pos[0], pos[1] - 0.5, 18, ['#8fd16a', '#b6e897', '#6fb34c'], 'puff'); this.text(pos[0], pos[1] - 1.7, 'BOING!', '#8fd16a'); if (m.n === this.me) this.shake = 10; }
    if (m.k === 'cure' && pos) { this.burst(pos[0], pos[1] - 0.6, 14, ['#ffffff', '#7fe0ff', '#ffd23f'], 'spark'); this.text(pos[0], pos[1] - 1.7, 'HUMAN AGAIN!', '#7fe0ff'); }
    if (m.k === 'block' && pos) { this.rings.push({ x: pos[0], y: pos[1] - 0.5, life: 1, col: '#7fe0ff', max: 1.4 }); this.text(pos[0], pos[1] - 1.7, 'BLOCKED!', '#7fe0ff'); }
    if (m.k === 'zap') { this.rings.push({ x: m.x, y: m.y - 0.4, life: 1, col: '#ffe14d', max: 6 }); }
    if (m.k === 'pickup' && pos) { this.text(pos[0], pos[1] - 1.6, '+FUSE', '#ffd23f'); }
    if (m.k === 'snack' && pos) { this.burst(pos[0], pos[1] - 0.8, 12, ['#ffd23f', '#ff9f1c', '#ffffff'], 'spark'); this.text(pos[0], pos[1] - 1.7, 'YUM! 🍜', '#ff9f1c'); }
    if (m.k === 'pe' && pos) { this.burst(pos[0], pos[1] - 0.6, 12, ['#7fe0ff', '#ffffff'], 'spark'); this.text(pos[0], pos[1] - 1.7, 'PE BOOTS! 👟', '#7fe0ff'); }
    if (m.k === 'sing' && pos) { this.burst(pos[0], pos[1] - 1, 8, ['#ff5fa2', '#ffd23f', '#2ec4ff'], 'spark'); this.text(pos[0], pos[1] - 1.8, `♪ +${m.pts}`, crewCol); }
  }
  burst(x, y, n, cols, kind) {
    if (this.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (kind === 'confetti' ? 3 : 1.8) * (0.4 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'confetti' ? 3 : 1), life: 1, decay: 0.6 + Math.random() * 0.6, col: cols[i % cols.length], kind, rot: Math.random() * 6, size: 0.08 + Math.random() * 0.08 });
    }
  }
  text(x, y, s, col, big = 1) { this.texts.push({ x, y, s, col, life: 1, big }); }

  // ---------------- interpolation ----------------
  interp() {
    const out = { players: new Map(), zombies: [], fuses: [] };
    const n = this.snaps.length; if (!n) return out;
    const rt = performance.now() - 110;
    let a = this.snaps[n - 1], b = a, k = 1;
    for (let i = n - 1; i > 0; i--) { if (this.snaps[i - 1]._at <= rt) { a = this.snaps[i - 1]; b = this.snaps[i]; k = Math.min(1, Math.max(0, (rt - a._at) / Math.max(1, b._at - a._at))); break; } }
    if (n === 1 || this.snaps[0]._at > rt) { a = b = this.snaps[0]; k = 1; }
    const am = new Map(a.p.map((p) => [p[0], p]));
    for (const p of b.p) {
      const q = am.get(p[0]) || p;
      out.players.set(p[0], { n: p[0], x: lerp(q[1], p[1], k) / 100, y: lerp(q[2], p[2], k) / 100, f: p[3], fuses: p[4], em: p[5], score: p[6] || 0, energy: p[7] ?? 100, happy: p[8] ?? 40 });
    }
    out.zombies = b.z.map((z, i) => { const q = a.z[i] || z; return { x: lerp(q[0], z[0], k) / 100, y: lerp(q[1], z[1], k) / 100, f: z[2], i }; });
    out.fuses = b.f.map((f) => ({ id: f[0], x: f[1] / 100, y: f[2] / 100, v: f[3] }));
    return out;
  }

  // ---------------- static map chunks ----------------
  chunk(cx, cy, S) {
    const key = `${cx},${cy}`; let ch = this.chunks.get(key);
    if (ch) return ch;
    const px = S * this.dpr; const cv = document.createElement('canvas'); cv.width = Math.ceil(CH * px); cv.height = Math.ceil(CH * px);
    const c = cv.getContext('2d'); c.scale(this.dpr, this.dpr); c.translate(-cx * CH * S, -cy * CH * S);
    c.save(); c.beginPath(); c.rect(cx * CH * S, cy * CH * S, CH * S, CH * S); c.clip();
    renderStatic(c, S, Math.max(0, cx * CH - 1), Math.max(0, cy * CH - 1), Math.min(W - 1, cx * CH + CH), Math.min(H - 1, cy * CH + CH));
    c.restore();
    this.chunks.set(key, cv); return cv;
  }

  // ---------------- frame ----------------
  frame(now) {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000); this.lastFrame = now; this.t = (now - this.t0) / 1000;
    const c = this.c; const S = this.S; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (S !== this.chunkS) { this.chunks.clear(); this.chunkS = S; }
    const st = this.interp();
    if (this.me !== null && this.local) { const mp = st.players.get(this.me); if (mp) { mp.x = this.local.x; mp.y = this.local.y; } }
    // camera
    let ox, oy;
    if (this.mode === 'phone') {
      const target = this.local || st.players.get(this.me) || { x: 24, y: 13 };
      const k = this.reduced ? 1 : Math.min(1, dt * 8);
      this.cam.x += (target.x - this.cam.x) * k; this.cam.y += (target.y - 0.4 - this.cam.y) * k;
      const vw = this.w / S, vh = this.h / S;
      const cx = Math.max(vw / 2, Math.min(W - vw / 2, this.cam.x)), cy = Math.max(vh / 2 - 1, Math.min(H - vh / 2 + 0.5, this.cam.y));
      ox = this.w / 2 - cx * S; oy = this.h / 2 - cy * S;
    } else { ox = (this.w - W * S) / 2; oy = (this.h - H * S) / 2; }
    if (this.shake > 0 && !this.reduced) { ox += (Math.random() - 0.5) * this.shake; oy += (Math.random() - 0.5) * this.shake; this.shake *= 0.85; if (this.shake < 0.3) this.shake = 0; }
    c.fillStyle = '#5bbf55'; c.fillRect(0, 0, this.w, this.h);
    c.save(); c.translate(Math.round(ox), Math.round(oy));
    // static chunks in view
    const x0 = Math.max(0, Math.floor(-ox / S / CH)), x1 = Math.min(Math.ceil(W / CH) - 1, Math.floor((this.w - ox) / S / CH));
    const y0 = Math.max(0, Math.floor(-oy / S / CH)), y1 = Math.min(Math.ceil(H / CH) - 1, Math.floor((this.h - oy) / S / CH));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) c.drawImage(this.chunk(cx, cy, S), cx * CH * S, cy * CH * S, CH * S, CH * S);
    // entities, y-sorted
    const ents = [];
    const latest = this.latest(); const playing = this.phase === 'play' || this.phase === 'countdown';
    const golden = this.event === 'golden';
    for (const l of LOCKERS) {
      let state = playing ? (golden ? 'golden' : 'ready') : 'sleep';
      if (this.mode === 'phone' && playing && (this.myCooldown.get(l.id) || 0) > performance.now()) state = 'cooldown';
      ents.push({ y: l.ty + 1, draw: () => drawLocker(c, l.x * S, l.y * S, S, state, this.t) });
    }
    const total = latest ? latest.sc.reduce((a, b) => a + b, 0) : 0;
    this.genFlash = Math.max(0, this.genFlash - dt * 1.5);
    ents.push({ y: GENERATOR.y + 1, draw: () => drawGenerator(c, S, this.t, total, this.genFlash) });
    for (const f of st.fuses) ents.push({ y: f.y, draw: () => drawFuse(c, f.x * S, f.y * S - S * 0.3, S * 0.9, f.v, this.t) });
    const party = this.event === 'party';
    for (const z of st.zombies) ents.push({ y: z.y, draw: () => drawZombie(c, z.x * S, z.y * S + S * 0.25, S, { t: this.reduced ? 0 : this.t, seed: z.i, dir: z.f & 4 ? -1 : 1, chasing: z.f & 1, stun: z.f & 2, party, scale: this.mode === 'phone' ? 1 : 1.25 }) });
    const sc = this.mode === 'phone' ? 1 : 1.3; const showNames = this.mode !== 'title';
    for (const p of st.players.values()) {
      const r = this.roster.get(p.n); if (!r) continue;
      const me = p.n === this.me; const moving = me && this.local ? this.local.moving : !!(p.f & 1); const dir = me && this.local ? this.local.dir : (p.f & 2 ? -1 : 1);
      const blink = ((this.t * 1000 + p.n * 1371) % 3900) < 130;
      const inv = p.f & 64; const alpha = inv && !this.reduced ? (Math.sin(this.t * 25) > 0 ? 1 : 0.45) : 1;
      ents.push({ y: p.y, me, draw: () => {
        if (me) { c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3; c.beginPath(); c.ellipse(p.x * S, p.y * S + S * 0.28, S * 0.38, S * 0.13, 0, 0, TAU); c.stroke(); }
        const headTop = drawAvatar(c, p.x * S, p.y * S + S * 0.28, S, { avatar: r.avatar, t: this.reduced ? 0 : this.t, moving: !this.reduced && moving, dir, zombie: p.f & 4, shield: p.f & 8, boots: p.f & 16, thinking: p.f & 32, blink, fuses: p.fuses, gold: p.f & 128, emote: p.em || null, alpha, name: showNames ? r.name : null, crewColor: CREWS[r.crew].color, scale: sc, seed: p.n, me });
        if (p.em) this.emoteBubble(c, p.x * S, headTop - S * 0.25, S * sc, p.em);
        else if (p.f & 256) { const zt = this.t * 1.5; c.globalAlpha = 0.9; outlinedText(c, 'z', p.x * S + S * 0.35, headTop - S * (0.1 + (zt % 1) * 0.3), S * 0.28, '#b9a7ff'); outlinedText(c, 'Z', p.x * S + S * 0.55, headTop - S * (0.35 + ((zt + 0.5) % 1) * 0.3), S * 0.36, '#b9a7ff'); c.globalAlpha = 1; }
      } });
    }
    for (const [lx, ly] of LAMPS) ents.push({ y: ly, draw: () => this.lamp(c, lx * S, ly * S, S) });
    ents.sort((a, b) => a.y - b.y || (a.me ? 1 : 0) - (b.me ? 1 : 0));
    for (const e of ents) e.draw();
    this.karaoke(c, S, st);
    // dusk: a soft violet tint with warm pools of light (stays bright and readable)
    c.fillStyle = 'rgba(88,52,160,0.15)'; c.fillRect(-ox, -oy, this.w, this.h);
    c.globalCompositeOperation = 'lighter';
    const gr = S * 3.2;
    for (const [lx, ly] of LAMPS) c.drawImage(this.glow, lx * S - gr, ly * S - S * 0.9 - gr, gr * 2, gr * 2);
    c.drawImage(this.glow, GENERATOR.x * S - gr * 1.3, GENERATOR.y * S - S * 0.6 - gr * 1.3, gr * 2.6, gr * 2.6);
    c.globalCompositeOperation = 'source-over';
    // particles & texts
    for (const q of this.parts) { q.life -= dt * q.decay; q.vy += 6 * dt * (q.kind === 'confetti' ? 0.8 : 0.3); q.x += q.vx * dt; q.y += q.vy * dt; q.rot += dt * 8;
      c.save(); c.globalAlpha = Math.max(0, q.life); c.fillStyle = q.col; c.translate(q.x * S, q.y * S); c.rotate(q.rot);
      if (q.kind === 'confetti') c.fillRect(-q.size * S, -q.size * S * 0.5, q.size * S * 2, q.size * S);
      else if (q.kind === 'spark') star(c, 0, 0, q.size * S * 1.3);
      else { c.beginPath(); c.arc(0, 0, q.size * S * 1.6, 0, TAU); c.fill(); }
      c.restore(); }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const r of this.rings) { r.life -= dt * 1.6; c.globalAlpha = Math.max(0, r.life); c.strokeStyle = r.col; c.lineWidth = S * 0.12; c.beginPath(); c.arc(r.x * S, r.y * S, S * r.max * (1 - r.life * 0.8), 0, TAU); c.stroke(); c.globalAlpha = 1; }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const tx of this.texts) { tx.life -= dt * 0.7; tx.y -= dt * 0.8; c.globalAlpha = Math.min(1, tx.life * 2); const pop = 1 + Math.max(0, tx.life - 0.85) * 3; outlinedText(c, tx.s, tx.x * S, tx.y * S, S * 0.42 * tx.big * pop * (this.mode === 'phone' ? 1 : 1.4), tx.col); c.globalAlpha = 1; }
    this.texts = this.texts.filter((tx) => tx.life > 0);
    this.zoneHighlight(c, S);
    c.restore();
    this.zoneArrow(ox, oy);
    // event overlays
    // night: fade in/out over ~2.5 s
    const NIGHT = 30000; const nl = this.nightLeft || 0;
    const target = nl > 0 ? Math.max(0, Math.min(1, Math.min(NIGHT - nl, nl) / 2500)) : 0;
    this.nightA = (this.nightA || 0) + (target - (this.nightA || 0)) * (this.reduced ? 1 : Math.min(1, dt * 4));
    if (this.nightA > 0.01) this.nightOverlay(st, ox, oy, this.nightA);
    else if (this.event === 'lights') this.lightsOut(st, ox, oy);
    if (this.event === 'party' && !this.reduced) this.disco();
  }

  // Karaoke room: lyric screen scrolling the pack's key words, coloured spotlights, music notes over singers
  karaoke(c, S, st) {
    const t = this.reduced ? 0 : this.t;
    const words = this.vocab && this.vocab.length ? this.vocab : ['la', 'la', 'la', 'sing!'];
    const i = Math.floor(t / 1.2) % words.length;
    const SY = 16.2; // karaoke screen on the bottom wall
    c.save(); c.beginPath(); c.roundRect(37.07 * S, SY * S, 1.86 * S, 0.65 * S, S * 0.08); c.clip();
    c.fillStyle = '#151032'; c.fillRect(37.07 * S, SY * S, 1.86 * S, 0.65 * S);
    const f = Math.max(8, S * 0.28); c.font = `900 ${f}px "Trebuchet MS", Arial`; c.textBaseline = 'middle'; c.textAlign = 'center';
    const prog = (t / 1.2) % 1; const word = `♪ ${words[i]} ♪`; const wW = c.measureText(word).width;
    c.fillStyle = '#ffffff'; c.fillText(word, 38 * S, (SY + 0.33) * S);
    c.save(); c.beginPath(); c.rect(38 * S - wW / 2, SY * S, wW * prog, 0.65 * S); c.clip(); c.fillStyle = '#ff5fa2'; c.fillText(word, 38 * S, (SY + 0.33) * S); c.restore();
    c.restore();
    if (!this.reduced) {
      c.globalCompositeOperation = 'lighter';
      const cols = ['rgba(255,95,162,0.22)', 'rgba(46,196,255,0.22)', 'rgba(255,210,63,0.20)'];
      cols.forEach((col, k) => {
        const sx = (36.6 + k * 1.4) * S, sy = 15.8 * S; const tx = (37.5 + Math.sin(t * (0.8 + k * 0.3) + k * 2) * 1.6) * S, ty = (8 + Math.cos(t * (0.6 + k * 0.2) + k) * 5) * S;
        c.fillStyle = col; c.beginPath(); c.moveTo(sx, sy); c.lineTo(tx - S * 1.1, ty); c.lineTo(tx + S * 1.1, ty); c.closePath(); c.fill();
        c.beginPath(); c.ellipse(tx, ty, S * 1.1, S * 0.45, 0, 0, TAU); c.fill();
      });
      c.globalCompositeOperation = 'source-over';
    }
    for (const p of st.players.values()) {
      const row = ROOM_OF[Math.floor(p.y)]; if (!row || row[Math.floor(p.x)] !== 'AV') continue;
      const ph = (t * 0.8 + p.n * 0.37) % 1; c.globalAlpha = 1 - ph;
      outlinedText(c, ph < 0.5 ? '♪' : '♫', p.x * S + Math.sin(ph * 6 + p.n) * S * 0.3, (p.y - 1.4 - ph * 0.8) * S, S * 0.4, ['#ff5fa2', '#ffd23f', '#2ec4ff'][p.n % 3]);
      c.globalAlpha = 1;
    }
  }

  // Timetable event: make the room glow with a big bouncing icon so everyone can find it
  zoneHighlight(c, S) {
    const z = this.event && ZONES[this.event]; if (!z) return;
    const t = this.reduced ? 0 : this.t; const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (const r of z.rects) {
      c.save();
      c.fillStyle = `rgba(255,230,120,${0.10 + 0.08 * pulse})`; c.fillRect(r.x0 * S, r.y0 * S, (r.x1 - r.x0) * S, (r.y1 - r.y0) * S);
      c.strokeStyle = `rgba(255,210,63,${0.7 + 0.3 * pulse})`; c.lineWidth = Math.max(3, S * 0.12); c.setLineDash([S * 0.4, S * 0.25]); c.lineDashOffset = -t * S;
      c.beginPath(); c.roundRect(r.x0 * S, r.y0 * S, (r.x1 - r.x0) * S, (r.y1 - r.y0) * S, S * 0.3); c.stroke(); c.setLineDash([]);
      const cx = (r.x0 + r.x1) / 2 * S, cy = r.y0 * S + S * 0.9 + Math.sin(t * 3) * S * 0.15;
      c.beginPath(); c.arc(cx, cy, S * (this.mode === 'phone' ? 0.5 : 0.75), 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = INK; c.lineWidth = Math.max(2, S * 0.06); c.stroke();
      c.font = `${S * (this.mode === 'phone' ? 0.55 : 0.85)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(z.icon, cx, cy + S * 0.04);
      c.restore();
    }
  }
  // Phone: arrow at the screen edge pointing to the event room when it's off-screen
  zoneArrow(ox, oy) {
    if (this.mode !== 'phone') return;
    const z = this.event && ZONES[this.event]; if (!z) return;
    const S = this.S; const me = this.local; if (!me) return;
    let best = null; for (const r of z.rects) { const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2; const d = Math.hypot(cx - me.x, cy - me.y); if (!best || d < best.d) best = { cx, cy, d, r }; }
    const sx = ox + best.cx * S, sy = oy + best.cy * S; const m = 46;
    if (sx > m && sx < this.w - m && sy > 120 && sy < this.h - 120) return;
    const c = this.c; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cx = this.w / 2, cy = this.h / 2; const ang = Math.atan2(sy - cy, sx - cx);
    const ex = Math.max(m, Math.min(this.w - m, cx + Math.cos(ang) * this.w)), ey = Math.max(215, Math.min(this.h - 170, cy + Math.sin(ang) * this.h));
    const bob = this.reduced ? 0 : Math.sin(this.t * 6) * 4;
    c.save(); c.translate(ex + Math.cos(ang) * bob, ey + Math.sin(ang) * bob);
    c.beginPath(); c.arc(0, 0, 26, 0, TAU); c.fillStyle = '#ffd23f'; c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
    c.font = '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(z.icon, 0, 1);
    c.rotate(ang); c.beginPath(); c.moveTo(30, -10); c.lineTo(44, 0); c.lineTo(30, 10); c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); c.stroke();
    c.restore();
  }

  lamp(c, x, y, S) {
    c.fillStyle = 'rgba(30,20,60,0.25)'; c.beginPath(); c.ellipse(x, y, S * 0.18, S * 0.07, 0, 0, TAU); c.fill();
    c.fillStyle = '#4a3f78'; c.fillRect(x - S * 0.04, y - S * 1.1, S * 0.08, S * 1.1);
    rr(c, x - S * 0.16, y - S * 1.32, S * 0.32, S * 0.26, S * 0.08); c.fillStyle = '#ffe9a8'; c.fill(); c.strokeStyle = INK; c.lineWidth = Math.max(1, S * 0.04); c.stroke();
  }

  emoteBubble(c, x, y, k, e) {
    const r = k * 0.32; c.beginPath(); c.arc(x, y - r, r, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = INK; c.lineWidth = Math.max(1, k * 0.04); c.stroke();
    c.beginPath(); c.moveTo(x - r * 0.3, y - r * 0.15); c.lineTo(x, y + r * 0.4); c.lineTo(x + r * 0.3, y - r * 0.15); c.fill();
    c.font = `${r * 1.15}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(EMOTE_ICON[e] || '❔', x, y - r * 0.95);
  }

  nightOverlay(st, ox, oy, a) {
    const o = this.overlay.getContext('2d'); const S = this.S;
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, this.w, this.h); o.fillStyle = `rgba(8,10,38,${0.8 * a})`; o.fillRect(0, 0, this.w, this.h);
    o.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, k = 1) => { const g = o.createRadialGradient(x, y, r * 0.15, x, y, r); g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = g; o.beginPath(); o.arc(x, y, r, 0, TAU); o.fill(); };
    for (const p of st.players.values()) hole(ox + p.x * S, oy + (p.y - 0.3) * S, S * (p.n === this.me ? 3.3 : 2.0));
    for (const [lx, ly] of LAMPS) hole(ox + lx * S, oy + (ly - 0.5) * S, S * 2.2, 0.85);
    for (const l of LOCKERS) hole(ox + l.x * S, oy + (l.y - 0.6) * S, S * 1.0, 0.8);
    hole(ox + GENERATOR.x * S, oy + GENERATOR.y * S, S * 2.4);
    o.globalCompositeOperation = 'source-over';
    // a few stars and the moon (projector only, where there's space)
    this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.drawImage(this.overlay, 0, 0);
    const c = this.c; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // glowing zombie eyes in the dark
    const k = S * (this.mode === 'phone' ? 1 : 1.25);
    c.globalAlpha = a;
    for (const z of st.zombies) {
      const dir = z.f & 4 ? -1 : 1; const ex = ox + z.x * S, ey = oy + z.y * S + S * 0.25 - k * 0.58;
      for (const [dx, r] of [[0.07, 0.06], [0.2, 0.045]]) {
        const g = c.createRadialGradient(ex + dir * dx * k, ey, 0, ex + dir * dx * k, ey, r * k * 3);
        g.addColorStop(0, 'rgba(210,255,120,1)'); g.addColorStop(0.35, 'rgba(180,255,90,0.6)'); g.addColorStop(1, 'rgba(180,255,90,0)');
        c.fillStyle = g; c.beginPath(); c.arc(ex + dir * dx * k, ey, r * k * 3, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  lightsOut(st, ox, oy) {
    const o = this.overlay.getContext('2d'); const S = this.S;
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, this.w, this.h); o.fillStyle = 'rgba(12,8,40,0.86)'; o.fillRect(0, 0, this.w, this.h);
    o.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => { const g = o.createRadialGradient(x, y, r * 0.2, x, y, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = g; o.beginPath(); o.arc(x, y, r, 0, TAU); o.fill(); };
    for (const p of st.players.values()) hole(ox + p.x * S, oy + p.y * S, S * (p.n === this.me ? 3.2 : 1.9));
    hole(ox + GENERATOR.x * S, oy + GENERATOR.y * S, S * 2.2);
    o.globalCompositeOperation = 'source-over';
    this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.drawImage(this.overlay, 0, 0);
  }
  disco() {
    const c = this.c; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalCompositeOperation = 'lighter';
    const cols = ['rgba(255,95,162,0.16)', 'rgba(46,196,255,0.16)', 'rgba(255,210,63,0.16)'];
    cols.forEach((col, i) => { const x = this.w * (0.5 + 0.4 * Math.sin(this.t * (0.9 + i * 0.3) + i * 2)); const y = this.h * (0.5 + 0.35 * Math.cos(this.t * (1.1 + i * 0.2) + i)); const g = c.createRadialGradient(x, y, 5, x, y, this.w * 0.35); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, this.w, this.h); });
    c.globalCompositeOperation = 'source-over';
  }
}

export { rr };
