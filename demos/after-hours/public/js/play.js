import { api, h, LETTERS, store, reducedMotion } from './net.js';
import { connect } from './rt.js';
import { WorldView } from './render.js';
import { drawAvatar, drawZombie } from './art.js';
import { AVATAR, AVATAR_KEYS, LABELS, NAMES, EMOTES, EMOTE_ICON, randomAvatar, cleanAvatar } from './shared/avatar.js';
import { CREWS, LOCKERS, SPEED, INTERACT_DIST, GENERATOR, move, dist, path as findPath, lockerStand } from './shared/world.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const ID_KEY = 'afterhours.nc.player.v1';
const AV_KEY = 'afterhours.nc.avatar.v1';
const reduced = reducedMotion();
const sound = new Sound();
let me = null; let link = null; let view = null; let snap = null; let roster = new Map();
let avatar = cleanAvatar(store(AV_KEY) || randomAvatar());
let local = null; let input = { x: 0, y: 0 }; let keys = new Set(); let lastSent = 0; let lastSentPos = null;
let question = null; let phase = 'lobby'; let paused = false; let myFlags = 0; let myFuses = 0; let nearLocker = null; let myScore = 0; let myEnergy = 100; let myHappy = 40;
let settings = { teams: 4, goal: 0 }; let auto = null; let tickStarted = false;
const cooldown = new Map();
let userTapped = false; // browsers only allow vibration after the user has touched the page
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { userTapped = true; }, { capture: true, once: false });

// ---------------------------------------------------------------- join
const params = new URLSearchParams(location.search);
const roomParam = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
$('roomIn').value = roomParam;
const A1 = ['Sparkly', 'Sleepy', 'Lucky', 'Cosmic', 'Bubbly', 'Sunny', 'Mystic', 'Turbo', 'Fluffy', 'Neon'];
const A2 = ['Mochi', 'Panda', 'Comet', 'Lotus', 'Boba', 'Kitty', 'Mango', 'Pixel', 'Bunny', 'Star'];
const randName = () => `${A1[Math.floor(Math.random() * A1.length)]} ${A2[Math.floor(Math.random() * A2.length)]}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 16);
$('nameIn').value = randName();
$('diceBtn').onclick = () => { $('nameIn').value = randName(); sound.play('pop'); };

// little animated art on the join card
(() => {
  const cv = $('joinArt'); const c = cv.getContext('2d'); const avs = [randomAvatar(), randomAvatar(), randomAvatar()];
  const loop = (now) => {
    if ($('joinView').classList.contains('hidden')) return;
    const t = now / 1000; c.clearRect(0, 0, 300, 150);
    c.fillStyle = '#e9e2ff'; c.beginPath(); c.roundRect(0, 100, 300, 50, 16); c.fill();
    avs.forEach((a, i) => drawAvatar(c, 70 + i * 70, 128, 70, { avatar: a, t: reduced ? 0 : t, moving: !reduced, dir: 1, seed: i, blink: ((t * 1000 + i * 900) % 3500) < 120 }));
    drawZombie(c, 260 + (reduced ? 0 : Math.sin(t) * 6), 130, 62, { t: reduced ? 0 : t, seed: 2, dir: -1 });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();

let pendingCode = null;
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault(); $('joinErr').textContent = '';
  const code = $('roomIn').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) { $('joinErr').textContent = 'The game code has 5 letters/numbers — look at the big screen!'; return; }
  pendingCode = code; sound.ensure(); sound.play('pop');
  doJoin({ callsign: $('nameIn').value, avatar }, code, true).catch((err) => { $('joinErr').textContent = err.message; });
});

// ---------------------------------------------------------------- avatar creator
let tab = 'hair';
const TAB_ORDER = ['hair', 'hairColor', 'skin', 'outfit', 'outfitColor', 'acc', 'face'];
function showAvatarCreator() {
  $('joinView').classList.add('hidden'); $('avatarView').classList.remove('hidden');
  drawTabs(); drawChoices(); animatePreview();
}
function drawTabs() {
  $('tabs').replaceChildren(...TAB_ORDER.map((k) => h('button', { role: 'tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; drawTabs(); drawChoices(); sound.play('tick'); }, text: LABELS[k] })));
}
function drawChoices() {
  const box = $('choices'); box.replaceChildren();
  AVATAR[tab].forEach((v, i) => {
    let inner;
    if (tab.endsWith('olor') || tab === 'skin') inner = h('span', { class: 'swatch', style: { background: v } });
    else {
      inner = h('canvas', { width: 108, height: 108 });
      const c = inner.getContext('2d'); const a = { ...avatar, [tab]: i };
      c.save(); c.translate(0, 0);
      drawAvatar(c, 54, tab === 'outfit' ? 100 : 150, tab === 'outfit' ? 80 : 120, { avatar: a, t: 0, dir: 1 });
      c.restore();
    }
    box.append(h('button', { class: i === avatar[tab] ? 'sel' : '', 'aria-label': (NAMES[tab] && NAMES[tab][i]) || `${LABELS[tab]} ${i + 1}`, title: (NAMES[tab] && NAMES[tab][i]) || '', onclick: () => { avatar[tab] = i; store(AV_KEY, avatar); drawChoices(); sound.play('pop'); } }, inner));
  });
}
function animatePreview() {
  const cv = $('avatarPreview'); const dpr = Math.min(3, window.devicePixelRatio || 1); cv.width = 260 * dpr; cv.height = 220 * dpr; const c = cv.getContext('2d');
  const loop = (now) => {
    if ($('avatarView').classList.contains('hidden')) return;
    const t = now / 1000; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, 260, 220);
    drawAvatar(c, 130, 200, 150, { avatar, t: reduced ? 0 : t, moving: false, dir: Math.sin(t * 0.7) > -0.6 ? 1 : -1, blink: (t * 1000 % 3600) < 120, emote: Math.floor(t / 4) % 3 === 2 ? 'dance' : null });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
$('randAvatar').onclick = () => { avatar = randomAvatar(); store(AV_KEY, avatar); drawChoices(); sound.play('loot'); };
function finishAvatar() { store(AV_KEY, avatar); if (link) link.send({ t: 'avatar', a: avatar }); showGame(); }
$('avatarDone').onclick = finishAvatar;

async function doJoin(body, code, creator = false) {
  const r = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body });
  me = { code, playerId: r.playerId, secret: r.secret, num: r.num, callsign: r.callsign, crew: r.crew };
  if (!creator) { avatar = cleanAvatar(r.avatar); store(AV_KEY, avatar); }
  store(ID_KEY, me);
  ensureLink();
  if (creator) showAvatarCreator(); else showGame();
}

const saved = store(ID_KEY);
if (saved && saved.playerId && (!roomParam || saved.code === roomParam)) {
  doJoin({ playerId: saved.playerId, secret: saved.secret }, saved.code).catch(() => { store(ID_KEY, null); $('roomIn').value = roomParam || saved.code; });
}

// ---------------------------------------------------------------- game
function ensureLink() {
  history.replaceState(null, '', `play.html?room=${me.code}`);
  if (!view) { view = new WorldView($('world'), { mode: 'phone', reduced }); view.myCooldown = cooldown; }
  view.setMe(me.num);
  if (link) link.close();
  link = connect({ hello: () => ({ t: 'hello', code: me.code, role: 'player', playerId: me.playerId, secret: me.secret }), onMessage, onStatus });
  if (!tickStarted) { tickStarted = true; requestAnimationFrame(tick); }
}
function showGame() {
  $('joinView').classList.add('hidden'); $('avatarView').classList.add('hidden'); $('gameView').classList.remove('hidden');
  view.resize();
}
const inCreator = () => !$('avatarView').classList.contains('hidden');

function onStatus(s, m) {
  const b = $('conn');
  if (s === 'ok') { b.classList.add('hidden'); return; }
  if (s === 'fatal') { store(ID_KEY, null); b.textContent = m.message; b.classList.remove('hidden'); showOverlay(h('div', { class: 'ocard' }, h('h2', { text: 'Oops!' }), h('p', { text: m.message }), h('a', { class: 'btn primary big', href: `play.html?room=${me.code}`, text: 'Join again' })), true); return; }
  b.textContent = s === 'connecting' ? 'Connecting…' : 'Reconnecting… keep this page open'; b.classList.remove('hidden');
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome': if (view && m.vocab) view.setVocab(m.vocab);
      if (m.you) { local = local && phase !== 'lobby' ? local : { x: m.you.x, y: m.you.y, dir: 1, moving: false }; me.crew = m.you.crew; }
      if (m.settings) settings = m.settings;
      setPhase(m.phase, m.paused); if (m.results) showResults(m.results, null);
      break;
    case 'roster': { roster = new Map(m.list.map((p) => [p.n, p])); view.setRoster(m.list); const mine = roster.get(me.num); if (mine) me.crew = mine.crew; break; }
    case 'mode': settings = m.settings; updateHud(); break;
    case 'sleepy': toast('💤 You\'re out of power! Answer a locker question to wake up.'); break;
    case 's': {
      snap = m; view.push(m);
      if (m.ph !== phase || !!m.pa !== paused) setPhase(m.ph, !!m.pa);
      const mp = m.p.find((p) => p[0] === me.num);
      if (mp) { myFlags = mp[3]; myFuses = mp[4]; myScore = mp[6] || 0; myEnergy = mp[7] ?? 100; myHappy = mp[8] ?? 40; if (!local) local = { x: mp[1] / 100, y: mp[2] / 100, dir: 1, moving: false }; }
      if (m.md !== undefined) { settings.teams = m.md; settings.goal = m.gl; }
      updateHud();
      break;
    }
    case 'corr': if (local) { local.x = m.x; local.y = m.y; } break;
    case 'q': openQuestion(m); break;
    case 'res': showResult(m); break;
    case 'qclose': closeQuestion(); toast('Locker timed out — try again!'); break;
    case 'fx':
      view.fx(m);
      if (m.n === me.num) { if (m.k === 'tag') { sound.play('tag'); if (userTapped && navigator.vibrate) navigator.vibrate(180); toast('You got tagged! Tag someone from another crew to turn back!'); } if (m.k === 'cure') sound.play('cure'); if (m.k === 'pickup') sound.play('loot'); if (m.k === 'deliver') { sound.play('deliver'); toast(`+${m.pts} for your crew!`); } if (m.k === 'block') toast('Your shield blocked a tag!'); if (m.k === 'snack') { sound.play('loot'); toast('🍜 Yum! Full power + a speed boost!'); } if (m.k === 'pe') { sound.play('loot'); toast('🏃 PE done! Speed boots for 10 seconds!'); } if (m.k === 'sing') sound.play('sing'); }
      if (m.k === 'overtime') banner('FINAL MINUTE! DOUBLE POINTS!');
      break;
    case 'event':
      if (m.kind) { sound.play('bell'); banner({ lunch: '🍜 LUNCH TIME!', karaoke: '🎤 KARAOKE HOUR!', garden: '🌸 QUIET TIME IN THE GARDEN', pe: '🏃 PE LESSON!', quiz: '📚 POP QUIZ!', lights: 'LIGHTS OUT! 🔦', party: 'ZOMBIE DANCE PARTY! 🪩', golden: 'GOLDEN LOCKERS! ✨', rain: 'FUSE RAIN! ⚡' }[m.kind] || 'SURPRISE!'); const hint = { lunch: 'Run to the CANTEEN for a snack: full power + speed!', karaoke: 'Stand on the STAGE in the Karaoke room to sing points for your crew!', garden: 'Zombies can\'t enter the GARDEN. Relax and recharge there!', pe: 'Run into the GYM for free speed boots!', quiz: 'Lockers in the English and Thai rooms give DOUBLE fuses!' }[m.kind]; if (hint) setTimeout(() => toast(hint + ' Follow the yellow arrow!'), 700); }
      break;
    case 'feed': if (m.kind === 'event' || m.kind === 'big') break; if (m.crew === me.crew) toast(m.text); break;
    case 'night':
      if (m.stage === 'warn') { toast('🌙 Night is coming… stay near your crew!'); sound.play('owl'); }
      if (m.stage === 'start') { banner('NIGHT FALLS 🌙'); sound.play('owl'); setTimeout(() => toast('Zombies are faster at night — but correct answers give a BONUS fuse!'), 900); }
      if (m.stage === 'end') { banner('☀️ GOOD MORNING!'); sound.play('go'); }
      break;
    case 'results': showResults(m.results, null); break;
    case 'mystats': showResults(null, m); break;
    case 'err':
      if (m.about === 'open') { toast(m.message); if (m.code === 'cooldown' && nearLocker !== null) cooldown.set(nearLocker, performance.now() + 4000); }
      else if (m.about === 'answer') { closeQuestion(); toast(m.message); }
      break;
    default: break;
  }
}

function setPhase(p, pa) {
  const prev = phase; phase = p; paused = pa;
  if ((p === 'countdown' || p === 'play') && inCreator()) { finishAvatar(); toast('The game is starting! You can change your look after the game.'); }
  if (p === 'countdown' && prev !== 'countdown') countdown();
  if (p === 'play' && prev === 'countdown') { sound.play('go'); banner('GO! Find the glowing lockers ❓'); }
  if (p === 'lobby') { resultsShown = null; closeQuestion(); showOverlay(h('div', { class: 'lobby-tip' }, 'Waiting for your teacher… run around and try emotes! 😊'), false); }
  else if (p === 'play' && !pa && prev !== 'play') hideOverlay();
  if (pa) showOverlay(h('div', { class: 'ocard' }, h('h2', { text: '⏸ Paused' }), h('p', { text: 'Look at the big screen.' })), true);
  else if (prev === p && !pa && p !== 'results' && p !== 'lobby') hideOverlay();
  if (p !== 'play') closeQuestion();
}

function countdown() {
  let n = 3;
  const show = () => { showOverlay(h('div', { class: 'count', text: n > 0 ? String(n) : 'GO!' }), false); sound.play(n > 0 ? 'tick' : 'go'); };
  show(); const iv = setInterval(() => { n--; if (n < 0 || phase !== 'countdown') { clearInterval(iv); if (phase !== 'results') hideOverlay(); return; } show(); }, 1000);
}

function showOverlay(el, block) { const o = $('overlay'); o.replaceChildren(el); o.className = `overlay${block ? ' block' : ''}`; }
function hideOverlay() { $('overlay').className = 'overlay hidden'; $('overlay').replaceChildren(); }
let bannerTimer = null;
function banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.add('hidden'), 2600); }
function toast(text) { const t = h('div', { class: 'toast', text }); $('toasts').prepend(t); while ($('toasts').children.length > 2) $('toasts').lastChild.remove(); setTimeout(() => t.remove(), 3200); }

function fmt(ms) { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function updateHud() {
  if (!snap) return;
  const crew = CREWS[me.crew]; const solo = settings.teams === 0; const goal = settings.goal ? `/${settings.goal}` : '';
  let mine, place;
  if (solo) { mine = myScore; place = 1 + snap.p.filter((p) => (p[6] || 0) > myScore).length; }
  else { const scores = snap.sc; mine = scores[me.crew]; place = 1 + scores.filter((s, i) => s > mine && [...roster.values()].some((p) => p.crew === i)).length; }
  const hc = $('hudCrew'); hc.replaceChildren(h('span', { class: 'dot', style: { background: crew.color } }), h('span', { text: solo ? 'You' : crew.name }), h('span', { class: 'place', text: phase === 'play' ? `#${place}` : '' }), h('span', { class: 'score', text: `⚡${mine}${goal}` }));
  const en = $('energy'); const pct = Math.max(0, Math.min(100, myEnergy));
  en.classList.toggle('hidden', phase !== 'play'); en.classList.toggle('low', pct < 25);
  $('energyFill').style.width = `${pct}%`; const hp = Math.round(myHappy); $('happyTxt').textContent = `${hp >= 70 ? '😄' : hp >= 35 ? '🙂' : '😐'} ${hp}`; $('happyTxt').classList.toggle('glow', hp >= 70); $('energyTxt').textContent = pct <= 0 ? '💤 Answer to wake up!' : pct < 25 ? '⚡ Power low — answer a question!' : '⚡ Power';
  const tm = $('hudTimer'); tm.textContent = snap.ph === 'play' ? (snap.nt ? '🌙 ' : '') + fmt(snap.tl) : snap.ph === 'lobby' ? 'LOBBY' : snap.ph === 'results' ? 'DONE' : '…'; tm.classList.toggle('ot', !!snap.ot);
  const items = [];
  if (myFuses) items.push(`⚡×${myFuses}${myFlags & 128 ? ' ✨' : ''} → Generator`);
  if (myFlags & 8) items.push('🛡️ Shield'); if (myFlags & 16) items.push('👟 Speed'); if (myFlags & 4) items.push(settings.teams === 0 ? '🧟 Tag another player!' : '🧟 Tag another crew!');
  $('hudItems').replaceChildren(...items.map((t) => h('span', { text: t })));
}

// ---------------------------------------------------------------- movement & input
function canMove() { return local && !question && !paused && (phase === 'lobby' || phase === 'play'); }
let lastFrame = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  if (local) {
    let ix = input.x, iy = input.y;
    if (auto && (keys.size || Math.hypot(input.x, input.y) > 0.1 || question || phase !== 'play')) stopAuto();
    if (auto) { const st = autoStep(); if (st) { ix = st[0]; iy = st[1]; } }
    if (keys.size) { ix = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0); iy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0); const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; } }
    const moving = canMove() && Math.hypot(ix, iy) > 0.1;
    if (moving) {
      const sp = myFlags & 4 ? SPEED.zombified : myFlags & 16 ? SPEED.boots : myFlags & 256 ? SPEED.sleepy : SPEED.player;
      [local.x, local.y] = move(local.x, local.y, ix * sp * dt, iy * sp * dt);
      if (Math.abs(ix) > 0.15) local.dir = ix > 0 ? 1 : -1;
    }
    local.moving = moving;
    view.setLocal(local.x, local.y, local.dir, moving);
    if (now - lastSent > 66 && (!lastSentPos || moving !== lastSentPos.m || dist(local.x, local.y, lastSentPos.x, lastSentPos.y) > 0.01 || now - lastSent > 1000)) {
      if (link && link.send({ t: 'pos', x: +local.x.toFixed(3), y: +local.y.toFixed(3), d: local.dir, m: moving })) { lastSent = now; lastSentPos = { x: local.x, y: local.y, m: moving }; }
    }
    // proximity prompt
    nearLocker = null;
    if (phase === 'play' && !question && !(myFlags & 4)) {
      let best = INTERACT_DIST;
      for (const l of LOCKERS) { const d = dist(local.x, local.y, l.x, l.y); if (d < best && (cooldown.get(l.id) || 0) < now) { best = d; nearLocker = l.id; } }
    }
    $('actBtn').classList.toggle('hidden', nearLocker === null);
    if (nearLocker !== null && auto && auto.kind === 'locker') stopAuto();
    $('autoBtn').classList.toggle('hidden', phase !== 'play' || !!question || nearLocker !== null || !!(myFlags & 4));
    $('autoBtn').textContent = auto ? '✋ Stop' : myFuses ? '🧭 To generator' : '🧭 Find a locker';
    const hint = $('hint');
    if (phase === 'play' && !question && myFlags & 4) { hint.textContent = '🧟 You\'re a zombie! Tag a player from another crew'; hint.classList.remove('hidden'); }
    else if (phase === 'play' && !question && nearLocker === null && !myFuses) { hint.textContent = 'Find a glowing ❓ locker'; hint.classList.remove('hidden'); }
    else if (phase === 'play' && myFuses && !question) { hint.textContent = '⚡ Take your fuses to the GENERATOR!'; hint.classList.remove('hidden'); }
    else hint.classList.add('hidden');
  }
  requestAnimationFrame(tick);
}
// Auto-walk: helps students who find steering hard. Walks to the nearest ready locker (or the generator with fuses).
function startAuto() {
  if (!local) return;
  let goal = null; let kind = 'locker';
  if (myFuses) { goal = [GENERATOR.x, GENERATOR.y + 1.4]; kind = 'gen'; }
  else {
    const now = performance.now(); let best = null;
    for (const l of LOCKERS) { if ((cooldown.get(l.id) || 0) > now) continue; const st = lockerStand(l); const p = st && findPath(local.x, local.y, st[0], st[1]); if (p && (!best || p.length < best.p.length)) best = { p, st }; }
    if (best) goal = best.st;
  }
  if (!goal) return;
  const p = findPath(local.x, local.y, goal[0], goal[1]) || [];
  auto = { kind, pts: [...p.map(([x, y]) => [x + 0.5, y + 0.5]), goal] }; sound.play('pop');
}
function stopAuto() { auto = null; }
function autoStep() {
  while (auto && auto.pts.length && dist(local.x, local.y, auto.pts[0][0], auto.pts[0][1]) < 0.15) auto.pts.shift();
  if (!auto || !auto.pts.length) { stopAuto(); return null; }
  const [tx, ty] = auto.pts[0]; const d = dist(local.x, local.y, tx, ty) || 1; return [(tx - local.x) / d, (ty - local.y) / d];
}
$('autoBtn').addEventListener('click', () => { if (auto) stopAuto(); else startAuto(); });

function openNear() { if (nearLocker === null || question) return; sound.ensure(); link.send({ t: 'open', l: nearLocker }); sound.play('open'); }
$('actBtn').addEventListener('click', openNear);

// virtual joystick (touch anywhere in the lower part of the screen)
const zone = $('joyZone'); const base = $('joyBase'); const knob = $('joyKnob'); let joyId = null; let jx = 0, jy = 0;
zone.addEventListener('pointerdown', (e) => {
  if (joyId !== null) return; joyId = e.pointerId; zone.setPointerCapture(e.pointerId); sound.ensure();
  jx = e.clientX; jy = e.clientY; base.style.left = `${jx}px`; base.style.top = `${jy - zone.getBoundingClientRect().top}px`; base.classList.remove('hidden');
  $('emoteWheel').classList.add('hidden');
});
zone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyId) return;
  let dx = e.clientX - jx, dy = e.clientY - jy; const l = Math.hypot(dx, dy); const max = 50;
  if (l > max) { dx = dx / l * max; dy = dy / l * max; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  const m = Math.min(1, l / max); input = l > 6 ? { x: dx / (Math.hypot(dx, dy) || 1) * m, y: dy / (Math.hypot(dx, dy) || 1) * m } : { x: 0, y: 0 };
});
const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; input = { x: 0, y: 0 }; base.classList.add('hidden'); knob.style.transform = ''; };
zone.addEventListener('pointerup', endJoy); zone.addEventListener('pointercancel', endJoy);
const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input')) return;
  if (KEYMAP[e.key]) { keys.add(KEYMAP[e.key]); e.preventDefault(); }
  if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && !question) { e.preventDefault(); openNear(); }
  if (question && question.stage === 'ask' && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) - 1);
});
document.addEventListener('keyup', (e) => { if (KEYMAP[e.key]) keys.delete(KEYMAP[e.key]); });
window.addEventListener('blur', () => keys.clear());

// emotes
$('emoteWheel').replaceChildren(...EMOTES.map((em) => h('button', { 'aria-label': em, onclick: () => { link.send({ t: 'emote', e: em }); $('emoteWheel').classList.add('hidden'); sound.play('pop'); }, text: EMOTE_ICON[em] })));
$('emoteBtn').onclick = () => $('emoteWheel').classList.toggle('hidden');
$('sndBtn').onclick = () => { sound.sfxOn = !sound.sfxOn; $('sndBtn').textContent = sound.sfxOn ? '🔊' : '🔇'; };

// ---------------------------------------------------------------- questions
function openQuestion(m) {
  input = { x: 0, y: 0 }; keys.clear();
  question = { nonce: m.nonce, locker: m.locker, q: m.question, stage: 'ask', golden: m.golden };
  const q = m.question; const kids = [];
  kids.push(h('div', { class: 'qtop' }, h('span', { class: `qtag${m.golden ? ' gold' : ''}`, text: m.golden ? '✨ GOLDEN LOCKER — double loot!' : '❓ Locker question' }), h('button', { class: 'btn qclose', 'aria-label': 'Close question', onclick: () => { link.send({ t: 'cancel' }); cooldown.set(m.locker, performance.now() + 2500); closeQuestion(); } , text: '✕' })));
  if (q.passage) kids.push(h('div', { class: 'passage', text: q.passage }));
  kids.push(h('div', { class: 'prompt', text: q.prompt }));
  if (q.image) kids.push(h('img', { class: 'qimg', src: q.image, alt: 'Question picture' }));
  kids.push(h('div', { class: 'answers' }, q.options.map((o, i) => h('button', { class: `ans a${i}`, onclick: () => answer(i), 'aria-label': `${LETTERS[i]}: ${o}` }, h('span', { class: 'L', text: LETTERS[i] }), h('span', { text: o })))));
  const modal = $('qModal'); modal.replaceChildren(h('div', { class: 'qcard' }, kids)); modal.classList.remove('hidden');
}
function answer(i) {
  if (!question || question.stage !== 'ask') return;
  question.stage = 'wait'; question.choice = i;
  document.querySelectorAll('.ans').forEach((b, k) => { b.disabled = true; if (k === i) b.classList.add('picked'); });
  link.send({ t: 'answer', nonce: question.nonce, c: i });
}
const LOOT = { fuse: ['⚡', 'Fuse!', 'Carry it to the Generator for your crew.'], gold: ['🌟', 'GOLDEN fuse!', 'Worth double at the Generator!'], boots: ['👟', 'Speed boots!', 'Run super fast for 8 seconds.'], shield: ['🛡️', 'Shield!', 'Blocks the next zombie tag.'], zap: ['💥', 'Zombie zap!', 'Nearby zombies are dizzy for 5 seconds.'] };
function showResult(m) {
  if (!question) return;
  question.stage = 'result'; cooldown.set(question.locker, performance.now() + 9000);
  sound.play(m.correct ? 'correct' : 'wrong'); if (m.correct) setTimeout(() => sound.play('loot'), 250);
  const q = question.q; const kids = [];
  kids.push(h('div', { class: `verdict ${m.correct ? 'ok' : 'no'}`, text: m.correct ? (m.streak >= 3 ? `CORRECT! 🔥 ×${m.streak}` : 'CORRECT! ✨') : 'Not quite!' }));
  if (m.correct && m.loot) {
    const [ic, name, desc] = LOOT[m.loot.item] || ['🎁', 'Loot!', ''];
    kids.push(h('div', { class: 'loot' }, h('span', { class: 'ic', text: ic }), h('div', {}, h('b', { text: name + (m.loot.golden ? ' (double!)' : '') }), desc, m.loot.combo ? h('div', { text: '🔥 Combo bonus: +1 extra fuse!' }) : null, m.loot.moon ? h('div', { text: '🌙 Night bonus: +1 extra fuse!' }) : null)));
  }
  kids.push(h('div', { class: 'answers' }, q.options.map((o, i) => h('button', { class: `ans a${i}${i === m.correctIndex ? ' right' : ''}${i === m.choice ? ' picked' : ''}`, disabled: true }, h('span', { class: 'L', text: i === m.correctIndex ? '✓' : LETTERS[i] }), h('span', { text: o })))));
  kids.push(h('div', { class: 'why' }, h('b', { text: m.correct ? 'Why: ' : `The answer is ${LETTERS[m.correctIndex]}. Why: ` }), m.explanation));
  const btn = h('button', { class: 'btn primary big', disabled: true, onclick: closeQuestion, text: 'Keep going →' });
  kids.push(btn);
  $('qModal').replaceChildren(h('div', { class: 'qcard' }, kids));
  setTimeout(() => { btn.disabled = false; }, m.correct ? 900 : 1800);
}
function closeQuestion() { question = null; $('qModal').classList.add('hidden'); $('qModal').replaceChildren(); }

// ---------------------------------------------------------------- results
let resultsShown = null;
function showResults(results, mine) {
  resultsShown = resultsShown || {};
  if (results) resultsShown.results = results; if (mine) resultsShown.mine = mine;
  const r = resultsShown.results; const s = resultsShown.mine;
  const kids = [];
  if (r && r.mode === 0) {
    const place = s ? s.place : null; const medal = place ? ['🥇', '🥈', '🥉'][place - 1] || '🏅' : '🏅';
    kids.push(h('div', { style: { fontSize: '3.4em' }, text: medal }), h('h2', { text: place ? `You came #${place} of ${s.of}!` : 'Game over!' }), h('p', { text: `${s ? s.score : 0} power · Class got ${Math.round(r.accuracy * 100)}% right` }));
    if (place === 1) sound.play('win');
  } else if (r) {
    const my = r.crews.find((c) => c.crew === me.crew);
    const medal = my ? ['🥇', '🥈', '🥉', '🏅'][Math.min(3, my.place - 1)] : '🏅';
    kids.push(h('div', { style: { fontSize: '3.4em' }, text: medal }), h('h2', { text: my ? `Crew ${CREWS[me.crew].name}: #${my.place}` : 'Game over!' }), h('p', { text: `${my ? my.score : 0} power for your crew · Class got ${Math.round(r.accuracy * 100)}% right` }));
    if (my && my.place === 1) sound.play('win');
  }
  if (s) {
    if (s.accuracy !== null) kids.push(h('div', { class: 'acc-big' }, h('b', { text: `${Math.round(s.accuracy * 100)}%` }), ' of your answers were correct'));
    kids.push(h('div', { class: 'stats' },
      h('div', {}, h('b', { text: `${s.stats.correct}/${s.stats.answered}` }), 'correct'),
      h('div', {}, h('b', { text: String(s.stats.delivered) }), 'power delivered'),
      h('div', {}, h('b', { text: String(s.stats.bestStreak) }), 'best streak'),
      h('div', {}, h('b', { text: String(s.stats.cures) }), 'tags passed')));
    kids.push(h('div', { class: 'badges' }, s.badges.map((b) => h('span', { class: 'badge', text: `${b.icon} ${b.name}` }))));
  }
  kids.push(h('p', { text: 'Look at the big screen! 👀' }));
  kids.push(h('button', { class: 'btn', onclick: () => { $('gameView').classList.add('hidden'); $('avatarView').classList.remove('hidden'); drawTabs(); drawChoices(); animatePreview(); }, text: '👗 Change my look' }));
  showOverlay(h('div', { class: 'ocard' }, kids), true);
}

// Read-only hook used by the automated browser test (no game effect).
window.__ah = { get local() { return local && { x: local.x, y: local.y }; }, get phase() { return phase; }, get near() { return nearLocker; }, get question() { return question && question.stage; }, get flags() { return myFlags; } };
