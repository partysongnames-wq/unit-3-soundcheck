// SIGNAL RUNNER — waiting-time mini-game. Pick up the word that matches the clue; dodge the shufflers.
// Local arcade score only. It never sends anything to the server and gives no mission advantage.
const BEST_KEY = 'afterhours.runner.best';
const TAU = Math.PI * 2;

export function createRunner(canvas, { vocab = [], color = '#ffb547', reduced = false } = {}) {
  const c = canvas.getContext('2d');
  const W = 360, H = 300; const VX = W / 2, VY = 62;
  let words = vocab.filter((v) => v && v.word && v.clue);
  if (words.length < 3) words = [{ word: 'collect', clue: 'to gather things together' }, { word: 'publish', clue: 'to print a text for the public' }, { word: 'scary', clue: 'making you feel afraid' }];
  let st = null; let raf = 0; let running = false; let lastT = 0;
  let best = 0; try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { best = 0; }

  function newState() {
    return { lane: 1, px: 1, score: 0, streak: 0, lives: 3, speed: 0.26, objs: [], clue: null, answer: null, wave: 0, t: 0, flash: null, over: false, msg: '', spawnIn: 0.4 };
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function spawnWave() {
    const pool = shuffle(words.slice()); const target = pool[0];
    const lanes = shuffle([0, 1, 2]);
    st.clue = target.clue; st.answer = target.word; st.wave++;
    for (let i = 0; i < 3; i++) st.objs.push({ kind: 'word', lane: lanes[i], z: 1, word: pool[i].word, ok: i === 0 });
    // shufflers come after the words, in one or two lanes
    const zl = shuffle([0, 1, 2]).slice(0, st.wave > 3 ? 2 : 1);
    for (const l of zl) st.objs.push({ kind: 'zombie', lane: l, z: 1.55 + Math.random() * 0.2 });
  }

  function proj(lane, z) {
    const k = Math.max(0, Math.min(1, 1 - z)); const persp = 0.3 + 0.7 * k;
    return { x: VX + (lane - 1) * 118 * persp, y: VY + (H - 40 - VY) * Math.pow(k, 1.4), s: persp };
  }

  function step(dt) {
    if (st.over) return;
    st.t += dt; st.speed = Math.min(0.55, 0.26 + st.wave * 0.012);
    st.px += (st.lane - st.px) * Math.min(1, dt * 14);
    if (!st.objs.length) { st.spawnIn -= dt; if (st.spawnIn <= 0) { spawnWave(); st.spawnIn = 0.5; } }
    for (const o of st.objs) {
      o.z -= st.speed * dt;
      if (!o.done && o.z <= 0.04) {
        o.done = true;
        if (o.lane === st.lane) {
          if (o.kind === 'word') {
            if (o.ok) { st.streak++; const pts = 10 * Math.min(3, 1 + Math.floor(st.streak / 3)); st.score += pts; st.flash = { t: 0.6, col: '#5fe0a0', text: `+${pts} ${o.word}` }; }
            else { st.streak = 0; st.flash = { t: 0.8, col: '#ff9aa5', text: `"${o.word}" ≠ clue — it was "${st.answer}"` }; }
          } else {
            st.lives--; st.streak = 0; st.flash = { t: 0.8, col: '#ff5d6c', text: 'Shuffler! −1 battery' };
            if (st.lives <= 0) gameOver();
          }
        } else if (o.kind === 'word' && o.ok) { st.streak = 0; st.flash = { t: 0.8, col: '#ffc86b', text: `Missed: "${st.answer}"` }; }
      }
    }
    st.objs = st.objs.filter((o) => o.z > -0.1);
    if (st.flash) { st.flash.t -= dt; if (st.flash.t <= 0) st.flash = null; }
  }

  function gameOver() {
    st.over = true; running = false;
    if (st.score > best) { best = st.score; try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* storage blocked */ } }
    st.msg = 'Batteries empty';
    draw(); emit();
  }

  function drawCorridor(t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05081a'); g.addColorStop(1, '#121a3a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // floor trapezoid
    c.fillStyle = '#141c36'; c.beginPath(); c.moveTo(VX - 30, VY); c.lineTo(VX + 30, VY); c.lineTo(W + 60, H); c.lineTo(-60, H); c.closePath(); c.fill();
    // lockers on walls
    for (let i = 0; i < 9; i++) {
      const z = 1 - ((i / 9 + (reduced ? 0 : t * 0.08)) % 1); const k = 1 - z; const s = 0.18 + 0.82 * k * k; const y = VY + (H - 40 - VY) * k * k;
      const x = 30 + 150 * s; const hh = 120 * s;
      c.fillStyle = `rgba(60,80,140,${0.15 + 0.35 * s})`;
      c.fillRect(VX - x - 16 * s, y - hh, 14 * s, hh); c.fillRect(VX + x + 2 * s, y - hh, 14 * s, hh);
    }
    // lane lines
    c.strokeStyle = 'rgba(160,190,255,0.18)'; c.lineWidth = 2;
    for (const l of [-0.5, 0.5]) { c.beginPath(); c.moveTo(VX + l * 20, VY); c.lineTo(VX + l * 230, H); c.stroke(); }
    // ceiling light
    const fl = reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 11) * Math.sin(t * 3.7);
    const lg = c.createRadialGradient(VX, VY - 20, 2, VX, VY - 20, 120); lg.addColorStop(0, `rgba(170,200,255,${0.25 * fl})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lg; c.fillRect(0, 0, W, H * 0.6);
  }

  function drawZombie(x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#0c1214'; c.strokeStyle = 'rgba(140,190,170,0.6)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-18, 0); c.lineTo(-12, -40); c.quadraticCurveTo(-16, -78, 2, -86); c.quadraticCurveTo(20, -76, 14, -40); c.lineTo(18, 0); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(2, -96, 11, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = '#0c1214'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(6, -70); c.lineTo(34, -64); c.stroke();
    c.fillStyle = 'rgba(210,240,200,0.9)'; c.fillRect(-2, -99, 3, 3); c.fillRect(5, -99, 3, 3);
    c.restore();
  }

  function draw() {
    const t = st ? st.t : 0;
    drawCorridor(t);
    if (!st) return;
    const objs = st.objs.slice().sort((a, b) => b.z - a.z);
    for (const o of objs) {
      if (o.z > 0.8) continue;
      const p = proj(o.lane, Math.max(0, o.z));
      c.globalAlpha = Math.min(1, (0.8 - o.z) / 0.15);
      if (o.kind === 'word') {
        const fs = Math.max(8, 22 * p.s); c.font = `800 ${fs}px "Segoe UI", Arial`;
        const w = c.measureText(o.word).width + 18 * p.s; const hgt = fs * 1.7;
        c.save(); c.shadowColor = '#ffc86b'; c.shadowBlur = 14 * p.s;
        c.fillStyle = '#2a2208'; c.beginPath(); c.roundRect(p.x - w / 2, p.y - hgt, w, hgt, 8 * p.s); c.fill(); c.restore();
        c.strokeStyle = '#ffc86b'; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#ffe9b8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.word, p.x, p.y - hgt / 2);
      } else drawZombie(p.x, p.y, p.s * 0.95);
      c.globalAlpha = 1;
    }
    // player
    const pp = proj(st.px, 0); const py = H - 30;
    const cone = c.createRadialGradient(pp.x, py, 4, pp.x, py, 170); cone.addColorStop(0, 'rgba(255,245,200,0.32)'); cone.addColorStop(1, 'rgba(255,245,200,0)');
    c.fillStyle = cone; c.beginPath(); c.moveTo(pp.x, py); c.arc(pp.x, py, 170, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35); c.closePath(); c.fill();
    c.fillStyle = '#0b1024'; c.beginPath(); c.arc(pp.x, py, 16, 0, TAU); c.fill(); c.strokeStyle = color; c.lineWidth = 4; c.stroke();
    // HUD: clue
    c.fillStyle = 'rgba(5,8,22,0.85)'; c.fillRect(0, 0, W, 44);
    c.fillStyle = '#a8b3d6'; c.font = '700 11px "Segoe UI", Arial'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('FIND THE WORD:', 10, 5);
    c.fillStyle = '#eef2ff'; c.font = '800 15px "Segoe UI", Arial'; c.fillText(fit(st.clue || 'Get ready…', W - 20, 15), 10, 21);
    c.textAlign = 'right'; c.fillStyle = '#ffc86b'; c.font = '800 12px "Segoe UI", Arial'; c.fillText(`${st.score} pts · best ${best}`, W - 10, 5);
    for (let i = 0; i < 3; i++) { c.fillStyle = i < st.lives ? '#ffd36b' : '#2a3150'; c.fillRect(W - 14 - i * 12, 50, 8, 14); }
    if (st.flash) { c.globalAlpha = Math.min(1, st.flash.t * 2); c.fillStyle = st.flash.col; c.font = '800 15px "Segoe UI", Arial'; c.textAlign = 'center'; c.fillText(fit(st.flash.text, W - 20, 15), W / 2, H * 0.42); c.globalAlpha = 1; }
    if (st.over) {
      c.fillStyle = 'rgba(5,8,22,0.8)'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffc86b'; c.textAlign = 'center'; c.font = '900 24px "Segoe UI", Arial'; c.fillText(st.msg, W / 2, H / 2 - 30);
      c.fillStyle = '#eef2ff'; c.font = '700 16px "Segoe UI", Arial'; c.fillText(`Score ${st.score} · Best ${best}`, W / 2, H / 2 + 4);
      c.fillStyle = '#a8b3d6'; c.font = '600 13px "Segoe UI", Arial'; c.fillText('Tap Play to restart', W / 2, H / 2 + 30);
    }
  }
  function fit(text, max, fs) {
    c.font = `800 ${fs}px "Segoe UI", Arial`;
    if (c.measureText(text).width <= max) return text;
    let s = text; while (s.length > 4 && c.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    step(dt); draw();
    if (running) raf = requestAnimationFrame(loop);
  }

  let listener = null;
  function emit() { if (listener) listener(api); }

  const api = {
    get running() { return running; },
    get score() { return st ? st.score : 0; },
    get best() { return best; },
    get over() { return !!(st && st.over); },
    start() { if (running) return; if (!st || st.over) st = newState(); running = true; lastT = performance.now(); raf = requestAnimationFrame(loop); emit(); },
    pause() { running = false; cancelAnimationFrame(raf); emit(); },
    left() { if (st && running) st.lane = Math.max(0, st.lane - 1); },
    right() { if (st && running) st.lane = Math.min(2, st.lane + 1); },
    onChange(fn) { listener = fn; },
    draw() { if (!st) st = newState(); draw(); }
  };
  canvas.width = W; canvas.height = H;
  // touch: tap left/right half, or swipe
  let sx = null;
  canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  canvas.addEventListener('pointerup', (e) => {
    const r = canvas.getBoundingClientRect(); const dx = sx === null ? 0 : e.clientX - sx; sx = null;
    if (!running) return;
    if (Math.abs(dx) > 24) { if (dx < 0) api.left(); else api.right(); return; }
    if (e.clientX - r.left < r.width / 2) api.left(); else api.right();
  });
  return api;
}
