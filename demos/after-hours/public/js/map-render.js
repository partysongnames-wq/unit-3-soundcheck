// Isometric night-campus renderer (Canvas 2D, all art drawn in code — no image files).
import { NODES, EDGES, CREWS } from './shared/map-data.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const TREES = [[-0.6, 6.8], [0.3, 8.6], [1.2, 9.2], [8.9, 0.9], [9.2, 2.3], [3.6, -0.6], [0.2, 2.9], [4.4, 1.9], [2.2, 5.6], [5.2, 6.2], [9.1, 6.0], [6.0, 8.9], [-1.0, -0.8], [6.3, 2.2], [9.2, 3.6], [1.6, 9.0]];
const LAMPS = [[6.3, 6.6], [7.9, 7.6], [5.0, 4.9], [3.0, 5.6], [5.4, 2.9], [7.8, 6.3], [5.6, 7.6]];
const CREW_OFFSETS = [[-0.26, -0.18], [0.24, -0.2], [-0.2, 0.26], [0.26, 0.22]];

export class CampusRenderer {
  constructor(canvas, { reducedMotion = false, title = false } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion; this.title = title;
    this.state = null; this.disp = { crews: {}, hordes: {} };
    this.queue = []; this.anim = null; this.fx = [];
    this.lastEventSeq = -1; this.powerT = 0; this.dawn = 0; this.bus = null;
    this.onCaption = null; this.onQueueDone = null;
    const r = seeded(7); this.stars = Array.from({ length: 140 }, () => [r(), r() * 0.55, r() * 1.4 + 0.3, r() * TAU]);
    const r2 = seeded(11);
    this.windows = {}; for (const n of Object.values(NODES)) this.windows[n.id] = Array.from({ length: 40 }, () => r2());
    this.fog = Array.from({ length: 7 }, (_, i) => ({ x: r2(), y: 0.35 + r2() * 0.6, s: 0.18 + r2() * 0.22, v: 0.004 + r2() * 0.006, a: 0.05 + r2() * 0.05, i }));
    this.t0 = performance.now(); this.time = 0;
    this.resize();
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas);
    const loop = (t) => { this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this.raf); this._ro.disconnect(); }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, this.canvas.clientWidth); const h = Math.max(10, this.canvas.clientHeight);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.W = w; this.H = h; this.dpr = dpr;
    this.tw = Math.min(w / 10.9, (h - 30) / 5.75) * (this.title && w > 900 ? 0.92 : 1);
    this.th = this.tw * 0.5;
    this.cx = w / 2 + (this.title && w > 900 ? w * 0.14 : 0); this.cy = (h - this.tw * 5.0) / 2 + this.th * 1.3;
  }

  P(gx, gy, z = 0) { return [this.cx + (gx - gy) * this.tw / 2, this.cy + (gx + gy) * this.th / 2 - z * this.tw * 0.55]; }

  stand(id) {
    const n = NODES[id];
    return n.sx !== undefined ? [n.sx, n.sy] : [n.gx, n.gy];
  }

  // ----- state & events -----
  setState(s) {
    const prev = this.state; this.state = s;
    const crews = s.crews || [];
    const m = s.mission;
    // Initialise display positions
    for (const c of crews) if (!this.disp.crews[c.id] || !prev || !prev.mission) this.disp.crews[c.id] = { pos: this.stand(c.node), node: c.node, dir: [1, 0] };
    if (m) {
      const ids = new Set(m.hordes.map((h) => h.id));
      for (const h of m.hordes) if (!this.disp.hordes[h.id]) this.disp.hordes[h.id] = { pos: this.stand(h.node), node: h.node, alpha: 0 };
      for (const k of Object.keys(this.disp.hordes)) if (!ids.has(Number(k))) delete this.disp.hordes[k];
    } else this.disp.hordes = {};
    if (!m) { this.disp.crews = {}; for (const c of crews) this.disp.crews[c.id] = { pos: this.stand(c.node), node: c.node, dir: [1, 0] }; this.powerT = 0; this.dawn = 0; this.bus = null; this.lastEventSeq = -1; this.queue = []; this.anim = null; }
    if (m && s.phase === 'resolve' && m.eventSeq !== this.lastEventSeq) {
      this.lastEventSeq = m.eventSeq;
      this.queue.push(...m.events.map((e) => ({ ...e })));
    } else if (m && s.phase !== 'resolve') {
      // Snap to authoritative positions when not animating (handles reconnects and resets).
      if (!this.anim && !this.queue.length) this.snap();
      this.lastEventSeq = m.eventSeq;
    }
    if (m && m.power && !this.queue.some((e) => e.t === 'power') && !(this.anim && this.anim.e.t === 'power')) this.powerT = Math.max(this.powerT, 1);
    if (s.phase === 'extraction' || s.phase === 'debrief') { if (!this.bus) this.bus = { t: 0 }; }
    else { this.bus = null; this.dawn = 0; }
  }

  snap() {
    const s = this.state; if (!s) return;
    for (const c of s.crews) this.disp.crews[c.id] = { ...(this.disp.crews[c.id] || { dir: [1, 0] }), pos: this.stand(c.node), node: c.node };
    if (s.mission) for (const h of s.mission.hordes) this.disp.hordes[h.id] = { pos: this.stand(h.node), node: h.node, alpha: 1 };
  }

  get busy() { return !!this.anim || this.queue.length > 0; }

  caption(e) {
    const cn = (id) => `Crew ${CREWS[id].name}`;
    const nn = (id) => `the ${NODES[id].short}`;
    switch (e.t) {
      case 'move': return `${cn(e.crew)} moves to ${nn(e.to)}.`;
      case 'collect': return `${cn(e.crew)} finds a fuse in ${nn(e.node)}!`;
      case 'install': return `${cn(e.crew)} installs a fuse (${e.installed} in the generator).`;
      case 'power': return 'POWER RESTORED — the campus lights up and the front gate unlocks!';
      case 'barricade': return `${cn(e.crew)} barricades the path to ${nn(e.b)}.`;
      case 'horde': return `A horde shuffles toward ${nn(e.to)}…`;
      case 'blocked': return 'A horde is stopped by a barricade.';
      case 'cornered': return `${cn(e.crew)} is cornered in ${nn(e.node)}${e.lost ? ' and drops a power cell' : ''}!`;
      case 'repel': return `The horde is pushed back to ${nn(e.to)}.`;
      case 'freed': return e.by === null ? `The horde loses interest. ${cn(e.crew)} slips away.` : (e.by === e.crew ? `${cn(e.crew)} breaks free!` : `${cn(e.by)} rescues ${cn(e.crew)}!`);
      case 'gate': return `${cn(e.crew)} reaches the front gate!`;
      case 'spawn': return `More shadows appear near ${nn(e.node)}.`;
      case 'barricade_gone': return 'A barricade gives way.';
      case 'hold': return `${cn(e.crew)} holds position.`;
      default: return '';
    }
  }

  nextAnim() {
    const e = this.queue.shift();
    if (!e) { this.anim = null; if (this.onQueueDone) this.onQueueDone(); this.snap(); return; }
    const short = { hold: 350, barricade_gone: 450, blocked: 600 };
    let dur = short[e.t] || (e.t === 'power' ? 2200 : 900);
    if (this.reduced) dur = Math.min(dur, 300);
    this.anim = { e, t: 0, dur };
    if (this.onCaption) { const c = this.caption(e); if (c && e.t !== 'hold') this.onCaption(c, e); }
    if (e.t === 'move') { const d = this.disp.crews[e.crew]; if (d) { e.fromPos = d.pos.slice(); e.toPos = this.stand(e.to); d.dir = [e.toPos[0] - e.fromPos[0], e.toPos[1] - e.fromPos[1]]; } }
    if (e.t === 'horde' || e.t === 'repel') { const d = this.disp.hordes[e.h] || (this.disp.hordes[e.h] = { pos: this.stand(e.from), node: e.from, alpha: 1 }); e.fromPos = d.pos.slice(); e.toPos = this.stand(e.to); }
    if (e.t === 'spawn') this.disp.hordes[e.h] = { pos: this.stand(e.node), node: e.node, alpha: 0 };
    if (e.t === 'collect' || e.t === 'install' || e.t === 'cornered' || e.t === 'freed' || e.t === 'barricade' || e.t === 'gate') {
      const id = e.node || (e.crew !== undefined && this.disp.crews[e.crew] ? null : null);
      const pos = e.t === 'barricade' ? this.mid(e.a, e.b) : (this.disp.crews[e.crew] ? this.disp.crews[e.crew].pos : this.stand(id || 'GEN'));
      this.fx.push({ kind: e.t, pos, t: 0, dur: this.reduced ? 400 : 1200, color: e.crew !== undefined ? CREWS[e.crew].color : '#ffd36b' });
    }
  }

  mid(a, b) { const A = this.stand(a); const B = this.stand(b); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; }

  stepAnim(dt) {
    if (!this.anim && this.queue.length) this.nextAnim();
    const a = this.anim; if (!a) return;
    a.t += dt; const k = ease(Math.min(1, a.t / a.dur)); const e = a.e;
    if (e.t === 'move' && e.toPos) { const d = this.disp.crews[e.crew]; d.pos = [lerp(e.fromPos[0], e.toPos[0], k), lerp(e.fromPos[1], e.toPos[1], k)]; if (k >= 1) d.node = e.to; }
    if ((e.t === 'horde' || e.t === 'repel') && e.toPos) { const d = this.disp.hordes[e.h]; d.pos = [lerp(e.fromPos[0], e.toPos[0], k), lerp(e.fromPos[1], e.toPos[1], k)]; d.alpha = 1; }
    if (e.t === 'spawn') this.disp.hordes[e.h].alpha = k;
    if (e.t === 'power') this.powerT = Math.max(this.powerT, k);
    if (a.t >= a.dur) this.nextAnim();
  }

  // ----- frame -----
  frame(now) {
    const dt = Math.min(64, now - (this.last || now)); this.last = now;
    this.time = (now - this.t0) / 1000;
    this.stepAnim(dt);
    for (const f of this.fx) f.t += dt; this.fx = this.fx.filter((f) => f.t < f.dur);
    if (this.bus) { this.bus.t += dt / 1000; this.dawn = Math.min(1, this.bus.t / 9); }
    const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSky(c); this.drawGround(c); this.drawPaths(c); this.drawScene(c); this.drawFx(c); this.drawFog(c); this.drawDawn(c);
  }

  mt(speed = 1) { return this.reduced ? 0 : this.time * speed; }

  drawSky(c) {
    const { W, H } = this; const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#060a1c'); g.addColorStop(0.55, '#0c1536'); g.addColorStop(1, '#0a1026');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const [x, y, s, ph] of this.stars) {
      const a = 0.35 + 0.35 * Math.sin(this.mt(1.3) + ph * 3);
      c.fillStyle = `rgba(220,230,255,${a * (1 - this.dawn)})`; c.fillRect(x * W, y * H, s, s);
    }
    const mx = W * 0.86; const my = H * 0.13; const mr = Math.max(14, this.tw * 0.32);
    const mg = c.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 5); mg.addColorStop(0, 'rgba(180,205,255,0.35)'); mg.addColorStop(1, 'rgba(180,205,255,0)');
    c.fillStyle = mg; c.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    c.fillStyle = '#e8eeff'; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
    c.fillStyle = 'rgba(12,21,54,0.9)'; c.beginPath(); c.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, TAU); c.fill();
  }

  poly(c, pts, fill, stroke) {
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); }
  }

  drawGround(c) {
    const a = this.P(-1.6, -1.6), b = this.P(9.6, -1.6), d = this.P(9.6, 9.6), e = this.P(-1.6, 9.6);
    // road outside the gate
    const r1 = this.P(9.6, 10.6), r2 = this.P(10.6, 9.6), r3 = this.P(10.6, 6.0), r4 = this.P(9.6, 6.0);
    this.poly(c, [this.P(6.0, 9.6), this.P(14, 9.6), this.P(14, 10.9), this.P(6.0, 10.9)], '#141a2c');
    c.strokeStyle = 'rgba(255,230,150,0.25)'; c.setLineDash([this.tw * 0.25, this.tw * 0.25]); c.lineWidth = 2;
    c.beginPath(); c.moveTo(...this.P(6.0, 10.25)); c.lineTo(...this.P(14, 10.25)); c.stroke(); c.setLineDash([]);
    void r1; void r2; void r3; void r4;
    const g = c.createLinearGradient(a[0], a[1], d[0], d[1]);
    g.addColorStop(0, '#0d2328'); g.addColorStop(0.6, '#10302f'); g.addColorStop(1, '#0d2626');
    this.poly(c, [a, b, d, e], g);
    // lawn tiles
    c.strokeStyle = 'rgba(120,200,190,0.05)'; c.lineWidth = 1;
    for (let i = -1; i <= 9; i++) {
      c.beginPath(); c.moveTo(...this.P(i, -1.6)); c.lineTo(...this.P(i, 9.6)); c.stroke();
      c.beginPath(); c.moveTo(...this.P(-1.6, i)); c.lineTo(...this.P(9.6, i)); c.stroke();
    }
    // fence
    c.strokeStyle = 'rgba(160,180,220,0.35)'; c.lineWidth = 1.5;
    const fence = [[-1.6, -1.6], [9.6, -1.6], [9.6, 7.9], null, [7.9, 9.6], [-1.6, 9.6], [-1.6, -1.6]];
    c.beginPath(); let pen = false;
    for (const p of fence) { if (!p) { pen = false; continue; } const q = this.P(p[0], p[1], 0.18); if (pen) c.lineTo(...q); else c.moveTo(...q); pen = true; }
    c.stroke();
    // shadow pools under buildings
    for (const n of Object.values(NODES)) {
      if (!n.w) continue;
      const [x, y] = this.P(n.gx + 0.4, n.gy + 0.4);
      const sg = c.createRadialGradient(x, y, 2, x, y, this.tw * 1.4);
      sg.addColorStop(0, 'rgba(0,0,10,0.45)'); sg.addColorStop(1, 'rgba(0,0,10,0)');
      c.fillStyle = sg; c.beginPath(); c.ellipse(x, y, this.tw * 1.4, this.th * 1.4, 0, 0, TAU); c.fill();
    }
    // flag court paving
    const ct = NODES.COURT;
    this.poly(c, [this.P(ct.gx - 0.8, ct.gy - 0.8), this.P(ct.gx + 0.8, ct.gy - 0.8), this.P(ct.gx + 0.8, ct.gy + 0.8), this.P(ct.gx - 0.8, ct.gy + 0.8)], '#1d2a3a', 'rgba(200,220,255,0.15)');
    // lamp light pools
    const warm = this.powerT;
    for (const [lx, ly] of LAMPS) {
      const [x, y] = this.P(lx, ly);
      const flick = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(this.time * 7 + lx * 3);
      const col = warm > 0.5 ? `rgba(255,190,90,${0.28 * flick})` : `rgba(120,170,255,${0.16 * flick})`;
      const lg = c.createRadialGradient(x, y, 1, x, y, this.tw * 0.9); lg.addColorStop(0, col); lg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = lg; c.beginPath(); c.ellipse(x, y, this.tw * 0.9, this.th * 0.9, 0, 0, TAU); c.fill();
    }
  }

  drawPaths(c) {
    const s = this.state; const powered = s && s.mission && s.mission.power;
    for (const [a, b] of EDGES) {
      const spawn = NODES[a].kind === 'spawn' || NODES[b].kind === 'spawn';
      const A = this.P(...this.stand(a)); const B = this.P(...this.stand(b));
      c.lineCap = 'round';
      if (spawn) {
        c.strokeStyle = 'rgba(70,60,50,0.55)'; c.lineWidth = this.tw * 0.13; c.setLineDash([this.tw * 0.12, this.tw * 0.1]);
        c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke(); c.setLineDash([]);
        continue;
      }
      const locked = (a === 'GATE' || b === 'GATE') && !powered;
      c.strokeStyle = '#1a2235'; c.lineWidth = this.tw * 0.3; c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke();
      c.strokeStyle = locked ? '#2b2d3c' : '#33405e'; c.lineWidth = this.tw * 0.22; c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke();
      c.strokeStyle = 'rgba(190,210,255,0.13)'; c.lineWidth = 1.5; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke(); c.setLineDash([]);
    }
    // spawn markers
    for (const id of ['FIELD', 'BIKES']) {
      const [x, y] = this.P(...this.stand(id));
      c.fillStyle = 'rgba(40,30,40,0.6)'; c.beginPath(); c.ellipse(x, y, this.tw * 0.42, this.th * 0.42, 0, 0, TAU); c.fill();
    }
  }

  drawScene(c) {
    const items = [];
    for (const n of Object.values(NODES)) if (n.w) items.push({ z: n.gx + n.gy, f: () => this.drawBuilding(c, n) });
    for (const [x, y] of TREES) items.push({ z: x + y + 0.2, f: () => this.drawTree(c, x, y) });
    for (const [x, y] of LAMPS) items.push({ z: x + y + 0.05, f: () => this.drawLamp(c, x, y) });
    items.push({ z: NODES.COURT.gx + NODES.COURT.gy, f: () => this.drawFlag(c) });
    items.push({ z: NODES.GATE.gx + NODES.GATE.gy - 0.3, f: () => this.drawGate(c) });
    items.sort((p, q) => p.z - q.z);
    for (const it of items) it.f();
    this.drawBarricades(c);
    this.drawFuses(c);
    this.drawHordes(c);
    this.drawCrews(c);
    if (this.bus) this.drawBus(c);
    // labels on top for legibility
    for (const n of Object.values(NODES)) {
      if (n.kind === 'spawn') continue;
      const top = n.w ? this.P(n.gx - n.w / 2, n.gy - n.d / 2, n.h + 0.75) : this.P(n.gx, n.gy, n.id === 'GATE' ? 1.2 : 0.6);
      if (n.w) { const p = this.P(n.gx, n.gy, n.h + (n.roof === 'thai' ? 1.05 : 0.55)); this.label(c, p[0], p[1], n.short, '#e8eeff'); }
      else if (n.id === 'COURT') this.label(c, top[0], top[1] + this.th * 1.2, n.short, '#e8eeff');
    }
  }

  label(c, x, y, text, color, small = false) {
    const fs = Math.max(11, Math.round(this.tw * (small ? 0.12 : 0.15)));
    c.font = `700 ${fs}px "Segoe UI", Arial, sans-serif`;
    const w = c.measureText(text).width + fs;
    c.fillStyle = small ? 'rgba(10,12,26,0.45)' : 'rgba(8,12,30,0.72)';
    c.beginPath(); c.roundRect(x - w / 2, y - fs * 0.85, w, fs * 1.6, fs * 0.8); c.fill();
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y);
  }

  drawBuilding(c, n) {
    const x0 = n.gx - n.w / 2, x1 = n.gx + n.w / 2, y0 = n.gy - n.d / 2, y1 = n.gy + n.d / 2, h = n.h;
    const P = (x, y, z) => this.P(x, y, z);
    const pw = this.powerT; const isGen = n.kind === 'generator';
    // faces: left (front-left, y = y1) and right (front-right, x = x1)
    const left = [P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)];
    const right = [P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)];
    const top = [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)];
    this.poly(c, left, isGen ? '#2a3348' : '#1e2944');
    this.poly(c, right, isGen ? '#333d55' : '#28355a');
    // cool moon rim on right face top edge
    c.strokeStyle = 'rgba(150,190,255,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(...P(x1, y0, h)); c.lineTo(...P(x1, y1, h)); c.stroke();
    // windows
    const win = this.windows[n.id]; let wi = 0;
    const floors = Math.max(1, Math.round(h / 0.5));
    const drawWins = (along, len, face) => {
      const cols = Math.max(2, Math.floor(len / 0.32));
      for (let f = 0; f < floors; f++) for (let k = 0; k < cols; k++) {
        const r = win[wi++ % win.length];
        const lit = isGen ? pw > 0.2 : (pw > 0 ? r < 0.35 + pw * 0.6 : r < 0.32);
        const u0 = (k + 0.22) / cols, u1 = (k + 0.78) / cols; const z0 = (f + 0.3) / floors * h, z1 = (f + 0.75) / floors * h;
        const pts = face === 'L'
          ? [P(x0 + len * u0, y1, z0), P(x0 + len * u1, y1, z0), P(x0 + len * u1, y1, z1), P(x0 + len * u0, y1, z1)]
          : [P(x1, y0 + len * u0, z0), P(x1, y0 + len * u1, z0), P(x1, y0 + len * u1, z1), P(x1, y0 + len * u0, z1)];
        let fill = '#141c33';
        if (lit) {
          const fl = this.reduced ? 1 : (r > 0.9 ? 0.75 + 0.25 * Math.sin(this.time * 9 + r * 50) : 1);
          fill = pw > 0.5 ? `rgba(255,214,130,${0.95 * fl})` : `rgba(255,190,100,${0.85 * fl})`;
        }
        this.poly(c, pts, fill);
        if (lit) { c.save(); c.shadowColor = 'rgba(255,180,80,0.8)'; c.shadowBlur = 8; this.poly(c, pts, fill); c.restore(); }
      }
      void along;
    };
    drawWins('x', n.w, 'L'); drawWins('y', n.d, 'R');
    if (n.roof === 'thai') {
      // tiered gable roof with raised end ridges (generic Thai-style silhouette, no emblem)
      const rh = 0.75; const ov = 0.12;
      const ridgeA = P(n.gx - n.w / 2 - ov, n.gy, h + rh), ridgeB = P(n.gx + n.w / 2 + ov, n.gy, h + rh);
      const roofL = [P(x0 - ov, y1 + ov, h), P(x1 + ov, y1 + ov, h), ridgeB, ridgeA];
      this.poly(c, [P(x0 - ov, y0 - ov, h), P(x1 + ov, y0 - ov, h), ridgeB, ridgeA], '#3b1f2a');
      this.poly(c, roofL, '#5a2a33');
      this.poly(c, [P(x1 + ov, y0 - ov, h), P(x1 + ov, y1 + ov, h), ridgeB], '#6b3540');
      c.strokeStyle = 'rgba(255,200,140,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(...ridgeA); c.lineTo(...ridgeB); c.stroke();
      // finials
      for (const p of [ridgeA, ridgeB]) { c.strokeStyle = '#c9925a'; c.lineWidth = 2; c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(p[0] + 4, p[1] - 10, p[0] + 9, p[1] - 12); c.stroke(); }
    } else {
      this.poly(c, top, isGen ? '#3d4863' : '#2c3a62');
      const inset = [P(x0 + 0.1, y0 + 0.1, h), P(x1 - 0.1, y0 + 0.1, h), P(x1 - 0.1, y1 - 0.1, h), P(x0 + 0.1, y1 - 0.1, h)];
      this.poly(c, inset, isGen ? '#2f3850' : '#23305a');
    }
    if (isGen) this.drawGenerator(c, n);
  }

  drawGenerator(c, n) {
    const s = this.state; const m = s && s.mission; const needed = m ? m.needed : 4; const inst = m ? m.installed : 0;
    const [x, y] = this.P(n.gx, n.gy, n.h + 0.95);
    const sw = this.tw * 0.16; const tot = needed * sw + (needed - 1) * 4;
    c.fillStyle = 'rgba(8,12,30,0.85)'; c.beginPath(); c.roundRect(x - tot / 2 - 8, y - sw * 0.9, tot + 16, sw * 1.8, 8); c.fill();
    c.strokeStyle = m && m.power ? '#ffd36b' : 'rgba(255,211,107,0.4)'; c.lineWidth = 2; c.stroke();
    for (let i = 0; i < needed; i++) {
      const fx = x - tot / 2 + i * (sw + 4);
      c.fillStyle = i < inst ? '#ffd36b' : '#2a3150';
      if (i < inst) { c.save(); c.shadowColor = '#ffcf5a'; c.shadowBlur = 10; }
      c.beginPath(); c.roundRect(fx, y - sw * 0.55, sw, sw * 1.1, 4); c.fill();
      if (i < inst) c.restore();
    }
    if (this.powerT > 0 && this.powerT < 1) {
      const [gx, gy] = this.P(n.gx, n.gy);
      const R = this.tw * 9 * this.powerT;
      c.strokeStyle = `rgba(255,214,120,${0.6 * (1 - this.powerT)})`; c.lineWidth = 6;
      c.beginPath(); c.ellipse(gx, gy, R, R / 2, 0, 0, TAU); c.stroke();
    }
  }

  drawTree(c, gx, gy) {
    const [x, y] = this.P(gx, gy); const r = this.tw * 0.32;
    c.fillStyle = 'rgba(0,0,10,0.35)'; c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a1e18'; c.fillRect(x - 2, y - r * 1.1, 4, r * 1.1);
    const sway = this.reduced ? 0 : Math.sin(this.time * 0.8 + gx) * 1.5;
    const blobs = [[0, -1.5, 1], [-0.6, -1.2, 0.7], [0.6, -1.25, 0.75], [0.1, -1.9, 0.65]];
    for (const [ox, oy, s] of blobs) { c.fillStyle = '#0f2e2a'; c.beginPath(); c.arc(x + ox * r + sway, y + oy * r, r * 0.75 * s, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(140,190,255,0.12)'; c.beginPath(); c.arc(x + r * 0.35 + sway, y - r * 1.85, r * 0.42, 0, TAU); c.fill();
  }

  drawLamp(c, gx, gy) {
    const [x, y] = this.P(gx, gy); const h = this.tw * 0.55;
    c.strokeStyle = '#4a5577'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
    const warm = this.powerT > 0.5;
    c.fillStyle = warm ? '#ffd38a' : '#a9c8ff';
    c.save(); c.shadowColor = c.fillStyle; c.shadowBlur = 12; c.beginPath(); c.arc(x, y - h, 3.5, 0, TAU); c.fill(); c.restore();
  }

  drawFlag(c) {
    const [x, y] = this.P(NODES.COURT.gx - 0.45, NODES.COURT.gy - 0.45); const h = this.tw * 1.1;
    c.strokeStyle = '#9aa6c8'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
    const wv = this.reduced ? 0 : Math.sin(this.time * 2) * 3;
    c.fillStyle = 'rgba(200,210,235,0.55)';
    c.beginPath(); c.moveTo(x, y - h); c.quadraticCurveTo(x + 14, y - h + wv, x + 26, y - h + 3); c.lineTo(x + 26, y - h + 17); c.quadraticCurveTo(x + 14, y - h + 14 + wv, x, y - h + 14); c.closePath(); c.fill();
  }

  drawGate(c) {
    const g = NODES.GATE; const s = this.state; const open = s && s.mission && s.mission.power;
    const L = this.P(g.gx - 0.85, g.gy + 0.85), R = this.P(g.gx + 0.85, g.gy - 0.85);
    const ph = this.tw * 0.75;
    for (const p of [L, R]) {
      c.fillStyle = '#39456a'; c.fillRect(p[0] - 6, p[1] - ph, 12, ph);
      c.fillStyle = '#4c5a86'; c.fillRect(p[0] - 8, p[1] - ph - 6, 16, 8);
      const col = open ? '#5fe0a0' : '#ff5d6c';
      c.save(); c.shadowColor = col; c.shadowBlur = 14; c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1] - ph - 12, 5, 0, TAU); c.fill(); c.restore();
    }
    // sliding bars
    const k = open ? 0.85 : 0;
    const a0 = [lerp(L[0], R[0], k * 0.5), lerp(L[1], R[1], k * 0.5)];
    const a1 = [lerp(R[0], L[0], k * 0.5), lerp(R[1], L[1], k * 0.5)];
    c.strokeStyle = open ? 'rgba(150,170,210,0.5)' : '#8c97bb'; c.lineWidth = 2;
    const bars = 9;
    for (const [s0, s1] of [[L, a0], [R, a1]]) {
      for (let i = 0; i <= bars; i++) {
        const t = i / bars; const bx = lerp(s0[0], s1[0], t), by = lerp(s0[1], s1[1], t);
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by - ph * 0.7); c.stroke();
      }
      c.beginPath(); c.moveTo(s0[0], s0[1] - ph * 0.7); c.lineTo(s1[0], s1[1] - ph * 0.7); c.stroke();
    }
    if (open) {
      const [x, y] = this.P(g.gx, g.gy);
      const lg = c.createRadialGradient(x, y, 2, x, y, this.tw * 1.3); lg.addColorStop(0, 'rgba(120,255,190,0.28)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = lg; c.beginPath(); c.ellipse(x, y, this.tw * 1.3, this.th * 1.3, 0, 0, TAU); c.fill();
    }
    const [lx, ly] = this.P(g.gx, g.gy, 1.25);
    this.label(c, lx + this.tw * 0.9, ly + this.th * 0.9, open ? 'GATE OPEN' : 'GATE LOCKED', open ? '#7dffb8' : '#ff9aa5');
  }

  drawFuses(c) {
    const s = this.state; if (!s || !s.mission) return;
    for (const [id, k] of Object.entries(s.mission.fuses)) {
      if (k <= 0) continue; const n = NODES[id];
      const bob = this.reduced ? 0 : Math.sin(this.time * 2.2 + n.gx) * 4;
      const [x, y0] = this.P(n.gx + n.w / 2 + 0.05, n.gy - n.d / 2 - 0.05, n.h + 0.35); const y = y0 + bob;
      this.fuseIcon(c, x, y, this.tw * 0.2);
      if (k > 1) { c.font = `800 ${Math.round(this.tw * 0.15)}px Arial`; c.fillStyle = '#ffe9a8'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(`×${k}`, x + this.tw * 0.14, y); }
    }
  }

  fuseIcon(c, x, y, s) {
    c.save(); c.shadowColor = '#ffcf5a'; c.shadowBlur = 16;
    c.fillStyle = '#ffdb7a'; c.beginPath(); c.roundRect(x - s * 0.3, y - s * 0.55, s * 0.6, s * 1.1, s * 0.2); c.fill(); c.restore();
    c.fillStyle = '#b9c3dc'; c.fillRect(x - s * 0.34, y - s * 0.6, s * 0.68, s * 0.16); c.fillRect(x - s * 0.34, y + s * 0.44, s * 0.68, s * 0.16);
    c.strokeStyle = '#7a4b00'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + s * 0.08, y - s * 0.3); c.lineTo(x - s * 0.1, y + 0.02 * s); c.lineTo(x + s * 0.1, y + 0.02 * s); c.lineTo(x - s * 0.08, y + s * 0.3); c.stroke();
  }

  drawBarricades(c) {
    const s = this.state; if (!s || !s.mission) return;
    for (const b of s.mission.barricades) {
      const [x, y] = this.P(...this.mid(b.a, b.b)); const w = this.tw * 0.32;
      c.save(); c.translate(x, y);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(0, 4, w, w * 0.35, 0, 0, TAU); c.fill();
      c.lineWidth = 5; c.strokeStyle = '#8a5a32'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-w, -w * 0.5); c.lineTo(w, w * 0.1); c.stroke();
      c.beginPath(); c.moveTo(-w, w * 0.1); c.lineTo(w, -w * 0.5); c.stroke();
      c.strokeStyle = '#c08a52'; c.lineWidth = 2; c.beginPath(); c.moveTo(-w, -w * 0.5); c.lineTo(w, w * 0.1); c.stroke();
      for (let i = 0; i < b.rounds; i++) { c.fillStyle = '#ffcf8a'; c.beginPath(); c.arc(-6 + i * 6, -w * 0.85, 2.2, 0, TAU); c.fill(); }
      c.restore();
    }
  }

  drawHordes(c) {
    for (const [id, d] of Object.entries(this.disp.hordes)) {
      const [x, y] = this.P(d.pos[0] - 0.32, d.pos[1] - 0.32);
      const a = d.alpha === undefined ? 1 : d.alpha;
      c.save(); c.globalAlpha = a;
      const mg = c.createRadialGradient(x, y, 2, x, y, this.tw * 0.55); mg.addColorStop(0, 'rgba(110,150,120,0.28)'); mg.addColorStop(1, 'rgba(110,150,120,0)');
      c.fillStyle = mg; c.beginPath(); c.ellipse(x, y, this.tw * 0.55, this.th * 0.55, 0, 0, TAU); c.fill();
      const figs = [[-0.22, -0.05], [0.12, -0.12], [0.3, 0.06], [-0.05, 0.1]];
      figs.forEach(([ox, oy], i) => this.zombie(c, x + ox * this.tw, y + oy * this.tw * 0.5, this.tw * 0.36, Number(id) * 3 + i));
      c.restore();
    }
  }

  zombie(c, x, y, s, seed) {
    const t = this.mt(1.6) + seed * 1.7;
    const sway = Math.sin(t) * 0.08; const bob = Math.abs(Math.sin(t)) * s * 0.04;
    c.save(); c.translate(x, y - bob); c.rotate(sway * 0.5);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(0, bob, s * 0.22, s * 0.07, 0, 0, TAU); c.fill();
    c.fillStyle = '#121a1c'; c.strokeStyle = 'rgba(140,190,170,0.55)'; c.lineWidth = 1.2;
    // legs
    c.beginPath(); c.moveTo(-s * 0.08, 0); c.lineTo(-s * 0.05 + Math.sin(t) * s * 0.05, -s * 0.38); c.lineTo(s * 0.06, -s * 0.38); c.lineTo(s * 0.09 - Math.sin(t) * s * 0.05, 0); c.closePath(); c.fill();
    // hunched torso
    c.beginPath(); c.moveTo(-s * 0.12, -s * 0.36); c.quadraticCurveTo(-s * 0.16, -s * 0.72, s * 0.02, -s * 0.8); c.quadraticCurveTo(s * 0.16, -s * 0.7, s * 0.12, -s * 0.36); c.closePath(); c.fill(); c.stroke();
    // reaching arms
    c.lineWidth = s * 0.06; c.strokeStyle = '#121a1c'; c.lineCap = 'round';
    const reach = Math.sin(t * 0.7) * s * 0.03;
    c.beginPath(); c.moveTo(s * 0.06, -s * 0.66); c.lineTo(s * 0.34, -s * 0.6 + reach); c.stroke();
    c.beginPath(); c.moveTo(-s * 0.02, -s * 0.62); c.lineTo(s * 0.3, -s * 0.52 - reach); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(140,190,170,0.45)'; c.beginPath(); c.moveTo(s * 0.06, -s * 0.68); c.lineTo(s * 0.34, -s * 0.62 + reach); c.stroke();
    // head tilted
    c.fillStyle = '#141d1f'; c.beginPath(); c.arc(s * 0.05, -s * 0.9, s * 0.1, 0, TAU); c.fill(); c.strokeStyle = 'rgba(140,190,170,0.55)'; c.stroke();
    c.fillStyle = 'rgba(210,240,200,0.85)'; c.fillRect(s * 0.08, -s * 0.92, 2, 2); c.fillRect(s * 0.12, -s * 0.91, 2, 2);
    c.restore();
  }

  drawCrews(c) {
    const s = this.state; if (!s) return;
    const extracting = this.bus && this.bus.t > 2.5;
    for (const crew of s.crews) {
      if (!crew.active) continue;
      const d = this.disp.crews[crew.id]; if (!d) continue;
      let [gx, gy] = d.pos; const off = CREW_OFFSETS[crew.id];
      gx += off[0]; gy += off[1];
      if (extracting && crew.node === 'GATE') { const k = Math.min(1, (this.bus.t - 2.5) / 2); gx = lerp(gx, 9.4, k); gy = lerp(gy, 10.1, k); if (k >= 1) continue; }
      const [x, y0] = this.P(gx, gy); const bob = this.reduced ? 0 : Math.sin(this.time * 3 + crew.id) * 1.5; const y = y0 - bob;
      const r = this.tw * 0.15; const col = crew.color;
      // flashlight cone
      const dir = d.dir || [1, 0]; const sd = [ (dir[0] - dir[1]) , (dir[0] + dir[1]) * 0.5 ];
      const ang = Math.atan2(sd[1], sd[0]) + (this.reduced ? 0 : Math.sin(this.time * 0.9 + crew.id) * 0.25);
      const cone = c.createRadialGradient(x, y, 2, x, y, this.tw * 0.9);
      cone.addColorStop(0, 'rgba(255,245,200,0.35)'); cone.addColorStop(1, 'rgba(255,245,200,0)');
      c.fillStyle = cone; c.beginPath(); c.moveTo(x, y); c.arc(x, y, this.tw * 0.9, ang - 0.38, ang + 0.38); c.closePath(); c.fill();
      // token
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(x, y0 + r * 0.9, r * 1.1, r * 0.4, 0, 0, TAU); c.fill();
      if (crew.cornered) {
        const p = this.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(this.time * 6);
        c.strokeStyle = `rgba(255,93,108,${0.5 + 0.5 * p})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * (1.5 + p * 0.3), 0, TAU); c.stroke();
      }
      c.save(); c.shadowColor = col; c.shadowBlur = 14;
      c.fillStyle = '#0b1024'; c.beginPath(); c.arc(x, y, r * 1.05, 0, TAU); c.fill(); c.restore();
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
      c.fillStyle = col; c.font = `900 ${Math.round(r * 1.15)}px "Trebuchet MS", Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(CREWS[crew.id].name[0], x, y + 1);
      if (crew.carrying) this.fuseIcon(c, x + r * 1.1, y - r * 1.1, r * 0.9);
    }
  }

  drawBus(c) {
    const t = this.bus.t; const k = Math.min(1, t / 2.4); const kk = ease(k);
    const leave = t > 5.5 ? ease(Math.min(1, (t - 5.5) / 2.5)) : 0;
    const gx = lerp(14, 9.6, kk) - leave * 6; const gy = 10.25;
    const [x, y] = this.P(gx, gy); const L = this.tw * 0.9; const Hh = this.tw * 0.32;
    // headlights
    const hl = c.createRadialGradient(x - L * 0.6, y + 6, 2, x - L * 0.6, y + 6, this.tw * 1.6);
    hl.addColorStop(0, 'rgba(255,245,200,0.45)'); hl.addColorStop(1, 'rgba(255,245,200,0)');
    c.fillStyle = hl; c.beginPath(); c.ellipse(x - L * 1.2, y + 10, this.tw * 1.6, this.th * 0.9, 0, 0, TAU); c.fill();
    c.fillStyle = '#e8b84a'; c.beginPath(); c.roundRect(x - L / 2, y - Hh, L, Hh, 6); c.fill();
    c.fillStyle = '#2a3150'; for (let i = 0; i < 5; i++) c.fillRect(x - L / 2 + 8 + i * (L - 16) / 5, y - Hh + 5, (L - 16) / 5 - 4, Hh * 0.38);
    c.fillStyle = '#ffe9a8'; for (let i = 0; i < 5; i++) if (i % 2 === 0) c.fillRect(x - L / 2 + 8 + i * (L - 16) / 5, y - Hh + 5, (L - 16) / 5 - 4, Hh * 0.38);
    c.fillStyle = '#151a2b'; c.beginPath(); c.arc(x - L * 0.3, y, 6, 0, TAU); c.arc(x + L * 0.3, y, 6, 0, TAU); c.fill();
    c.fillStyle = '#7a5a12'; c.font = `800 ${Math.round(Hh * 0.32)}px Arial`; c.textAlign = 'center'; c.fillText('RESCUE', x, y - Hh * 0.18);
  }

  drawFx(c) {
    for (const f of this.fx) {
      const k = f.t / f.dur; const [x, y] = this.P(...f.pos);
      c.save(); c.globalAlpha = 1 - k;
      if (f.kind === 'cornered') { c.strokeStyle = '#ff5d6c'; c.lineWidth = 4; c.beginPath(); c.ellipse(x, y, this.tw * (0.3 + k), this.th * (0.3 + k), 0, 0, TAU); c.stroke(); }
      else { c.strokeStyle = f.color; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, this.tw * (0.2 + k * 0.8), this.th * (0.2 + k * 0.8), 0, 0, TAU); c.stroke();
        if (f.kind === 'collect' || f.kind === 'install') this.fuseIcon(c, x, y - this.tw * 0.5 * k - 10, this.tw * 0.2); }
      c.restore();
    }
  }

  drawFog(c) {
    if (this.reduced) return;
    const { W, H } = this;
    for (const f of this.fog) {
      const x = ((f.x + this.time * f.v) % 1.4 - 0.2) * W; const y = f.y * H; const r = f.s * W;
      const g = c.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, `rgba(150,170,220,${f.a * (1 - this.dawn)})`); g.addColorStop(1, 'rgba(150,170,220,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * 0.35, 0, 0, TAU); c.fill();
    }
  }

  drawDawn(c) {
    if (!this.dawn) return;
    const g = c.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, `rgba(255,170,120,${0.32 * this.dawn})`); g.addColorStop(0.5, `rgba(255,200,150,${0.12 * this.dawn})`); g.addColorStop(1, 'rgba(255,220,180,0)');
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
  }
}
