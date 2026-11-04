import { api, h, qrSvg, reducedMotion, LETTERS, store } from './net.js';
import { connect } from './rt.js';
import { WorldView } from './render.js';
import { startAttract } from './attract.js';
import { drawAvatar, star } from './art.js';
import { loadStore } from './packstore.js';
import { validatePack } from './shared/packs.js';
import { CREWS } from './shared/world.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const HOST_KEY = 'afterhours.nc.host.v1';
const reduced = reducedMotion();
const sound = new Sound({ music: true });
let room = null; let link = null; let view = null; let snap = null; let roster = []; let stats = null; let phase = 'lobby'; let paused = false; let results = null;
let settings = { teams: 4, goal: 0, minutes: 8 };

// ---------------- setup ----------------
const attract = startAttract($('setupMap'), { reduced });
const packStore = loadStore();
for (const p of packStore.packs) { const v = validatePack(p); $('packSelect').append(h('option', { value: p.id, text: `${p.title} — ${p.questions.length} questions${v.ok ? '' : ' (needs fixing)'}` })); }
$('packSelect').value = packStore.selectedId;
const showPackInfo = () => { const p = packStore.packs.find((x) => x.id === $('packSelect').value); const v = p ? validatePack(p) : { ok: false, errors: [] }; $('packInfo').textContent = v.ok ? (p.description || '') : `This pack has problems: ${v.errors.slice(0, 2).join(' ')} Fix it in the editor.`; };
$('packSelect').onchange = showPackInfo; showPackInfo();
api('/api/info').then((info) => {
  if (!$('joinBase').value) $('joinBase').value = info.joinBaseUrl || location.origin;
  $('lanHint').textContent = info.lanAddresses.length ? `This computer: ${info.lanAddresses.join(', ')}. Phones must be on the same Wi-Fi ("localhost" won't work on phones).` : 'No network address found — phones can\'t reach "localhost". Join the classroom Wi-Fi or set JOIN_BASE_URL.';
}).catch(() => { $('joinBase').value = location.origin; });
const saved = store(HOST_KEY);
if (saved && saved.code) {
  api(`/api/rooms/${saved.code}/check`, { headers: { 'X-Host-Token': saved.token } }).then((r) => {
    const box = $('resumeBox'); box.classList.remove('hidden');
    box.append(h('span', { text: `Game ${saved.code} is still open (${r.phase}).` }), h('button', { class: 'btn primary', onclick: () => enterGame(saved), text: 'Resume' }));
  }).catch(() => store(HOST_KEY, null));
}
async function create(demo) {
  $('setupErr').textContent = '';
  const p = packStore.packs.find((x) => x.id === $('packSelect').value); const v = validatePack(p);
  if (!v.ok) { $('setupErr').textContent = `Pack problems: ${v.errors.slice(0, 3).join(' ')}`; return; }
  const joinBase = ($('joinBase').value || location.origin).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(joinBase)) { $('setupErr').textContent = 'Join address must start with http://'; return; }
  try {
    sound.ensure();
    const r = await api('/api/rooms', { method: 'POST', body: { pack: v.pack, demo, demoBots: 14, settings: { minutes: Number($('minutes').value), teams: Number($('teams').value), goal: Number($('goal').value) } } });
    const info = { code: r.code, token: r.hostToken, view: r.viewToken, joinBase }; store(HOST_KEY, info); enterGame(info);
  } catch (e) { $('setupErr').textContent = e.message; }
}
$('createBtn').onclick = () => create(false);
$('demoBtn').onclick = () => create(true);

// ---------------- game ----------------
function enterGame(info) {
  room = { ...info, joinBase: info.joinBase || location.origin };
  attract.stop(); $('setup').classList.add('hidden'); $('game').classList.remove('hidden');
  view = new WorldView($('map'), { mode: 'host', reduced });
  $('codeMini').textContent = room.code;
  link = connect({ hello: () => ({ t: 'hello', code: room.code, role: 'host', token: room.token }), onMessage, onStatus });
  sound.ensure(); sound.setMusic(true);
}
function onStatus(s, m) {
  const b = $('conn');
  if (s === 'ok') { b.classList.add('hidden'); return; }
  if (s === 'fatal') { store(HOST_KEY, null); b.textContent = `Game unavailable: ${m.message}`; b.classList.remove('hidden'); return; }
  b.textContent = 'Reconnecting to the game server…'; b.classList.remove('hidden');
}
const feedItems = [];
function onMessage(m) {
  switch (m.t) {
    case 'welcome': if (view && m.vocab) view.setVocab(m.vocab); if (m.settings) settings = m.settings; setPhase(m.phase, m.paused); $('demoTag').classList.toggle('hidden', !m.demo); if (m.results) { results = m.results; } break;
    case 'roster': roster = m.list; view.setRoster(m.list); if (phase === 'lobby') renderLobby(); break;
    case 's': snap = m; view.push(m); if (m.ph !== phase || !!m.pa !== paused) setPhase(m.ph, !!m.pa); renderTop(); renderBoard(); break;
    case 'stats': stats = m; settings = m.settings; renderStats(); if (phase === 'lobby') renderLobby(); break;
    case 'mode': settings = m.settings; renderLobby(); break;
    case 'fx': view.fx(m); if (m.k === 'deliver') sound.play('deliver'); if (m.k === 'tag') sound.play('tag'); if (m.k === 'overtime') { banner('FINAL MINUTE — DOUBLE POINTS!'); sound.play('event'); } break;
    case 'event': if (m.kind) { sound.play('event'); banner({ lights: 'LIGHTS OUT! 🔦', party: 'ZOMBIE DANCE PARTY! 🪩', golden: 'GOLDEN LOCKERS! ✨', rain: 'FUSE RAIN! ⚡' }[m.kind]); } break;
    case 'feed': feedItems.unshift(m); feedItems.length = Math.min(feedItems.length, 7); renderFeed(); break;
    case 'results': results = m.results; if (phase === 'results') renderResults(); break;
    default: break;
  }
}
function setPhase(p, pa) {
  const prev = phase; phase = p; paused = pa;
  if (p !== prev || pa) modalReturn = null;
  $('cStart').classList.toggle('hidden', p !== 'lobby');
  $('cPause').disabled = !(p === 'play' || p === 'countdown'); $('cPause').textContent = pa ? '▶ Resume' : '⏸ Pause';
  $('cAdd').disabled = p !== 'play'; $('cEnd').disabled = !(p === 'play' || p === 'countdown');
  if (p === 'lobby') renderLobby();
  else if (p === 'countdown' && prev !== 'countdown') countdown();
  else if (p === 'results') { sound.play('win'); renderResults(); }
  else if (pa) overlay(h('div', { class: 'paused', text: '⏸ PAUSED' }), true);
  else if (p === 'play') { if (prev === 'countdown' || prev === 'play' || prev === 'lobby') clearOverlay(); }
}
async function act(a, body = {}) {
  if (a === 'reset' && !confirm('Reset to the lobby? Scores are cleared; players stay connected.')) return;
  if (a === 'end' && !confirm('End the game now and show the results?')) return;
  try { await api(`/api/rooms/${room.code}/host/${a}`, { method: 'POST', headers: { 'X-Host-Token': room.token }, body }); }
  catch (e) { banner(e.message); }
}
$('cStart').onclick = () => { sound.ensure(); act('start'); };
$('cPause').onclick = () => act(paused ? 'resume' : 'pause');
$('cAdd').onclick = () => act('addtime');
$('cEnd').onclick = () => act('end');
$('cReset').onclick = () => act('reset');
$('cMusic').onclick = () => { const on = !sound.musicOn; sound.setMusic(on); $('cMusic').setAttribute('aria-pressed', String(on)); };
$('cSfx').onclick = () => { sound.sfxOn = !sound.sfxOn; $('cSfx').setAttribute('aria-pressed', String(sound.sfxOn)); };
$('cFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
document.addEventListener('keydown', (e) => { if (e.key === 'p' || e.key === 'P') $('cPause').click(); if (e.key === 'Escape') closeModal(); });
let modalReturn = null;
function closeModal() { if (modalReturn) { const f = modalReturn; modalReturn = null; f(); } }
function modal(card) { const prev = [...$('overlay').childNodes]; const cls = $('overlay').className; overlay(h('div', { class: 'modal-card' }, card, h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: closeModal, text: 'Close' }))), true); modalReturn = () => { $('overlay').replaceChildren(...prev); $('overlay').className = cls; if (phase === 'lobby') renderLobby(); }; }
$('cHow').onclick = () => modal(h('div', {},
  h('h2', { text: 'How to play' }),
  h('ol', {},
    h('li', { text: 'Move with the joystick (touch the bottom of the screen and drag). 🧭 walks you to a locker.' }),
    h('li', { text: 'At a glowing ❓ locker tap OPEN and answer. Correct = loot: fuses, speed boots, shields, zaps.' }),
    h('li', { text: 'Wrong? Read the WHY — that question comes back later.' }),
    h('li', { text: 'Carry fuses to the GENERATOR in the middle. That scores!' }),
    h('li', { text: 'Your ⚡ power meter drains. Answer questions to keep it full, or you get sleepy and slow.' }),
    h('li', { text: settings.teams === 0 ? 'Tagged by a zombie? You drop your fuses. Tag another player to turn back!' : 'Tagged by a zombie? You drop your fuses. Tag someone from another crew to turn back!' }),
    h('li', { text: 'Last minute: every fuse counts DOUBLE!' }))));
$('cTeacher').onclick = () => {
  if (!room.view) { modal(h('p', { text: 'This game was resumed from an older version — create a new game to get a teacher phone link.' })); return; }
  const url = `${room.joinBase}/teacher.html?room=${room.code}#v=${room.view}`;
  modal(h('div', { style: { textAlign: 'center' } },
    h('h2', { text: '📋 Teacher phone view' }),
    h('p', { class: 'warn', text: 'Private: shows nicknames and who has answered. Blank or freeze the projector first, scan with YOUR phone, then close this.' }),
    qrSvg(url, 220),
    h('p', { class: 'muted small', text: 'Read-only: this link can\'t control the game.' })));
};

function overlay(el, dim) { const o = $('overlay'); o.replaceChildren(el); o.className = `overlay${dim ? ' dim' : ''}`; }
function clearOverlay() { $('overlay').className = 'overlay hidden'; $('overlay').replaceChildren(); }
let bannerT = null;
function banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.add('hidden'), 3000); }
function countdown() {
  let n = 3; const show = () => { overlay(h('div', { class: 'count-big', text: n > 0 ? String(n) : 'GO!' }), true); sound.play(n > 0 ? 'tick' : 'go'); };
  show(); const iv = setInterval(() => { n--; if (n < 0 || phase !== 'countdown') { clearInterval(iv); if (phase === 'play' && !paused) clearOverlay(); return; } show(); }, 1000);
}
const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function renderTop() {
  const t = $('bigTimer');
  t.textContent = snap.ph === 'play' ? fmt(snap.tl) : snap.ph === 'lobby' ? 'LOBBY' : snap.ph === 'results' ? 'FINISHED' : 'GET READY';
  t.classList.toggle('ot', !!snap.ot && snap.ph === 'play');
}
function renderBoard() {
  if (!snap) return;
  $('railTitle').textContent = snap.md === 0 ? 'Leaderboard' : 'Crew race';
  if (snap.md === 0) {
    const names = new Map(roster.map((p) => [p.n, p]));
    const top = snap.p.map((p) => ({ n: p[0], score: p[6] || 0 })).filter((p) => names.has(p.n)).sort((a, b) => b.score - a.score).slice(0, 5);
    const max = Math.max(1, ...top.map((t) => t.score)); let place = 0, last = null;
    $('board').replaceChildren(h('div', { class: 'muted small', text: `Top 5 of ${roster.length}${snap.gl ? ` · first to ${snap.gl} wins` : ''}` }), ...top.map((t, i) => { if (t.score !== last) { place = i + 1; last = t.score; } const r = names.get(t.n);
      return h('div', { class: `crow${place === 1 && t.score > 0 ? ' lead' : ''}`, style: { '--cc': CREWS[r.crew].color } }, h('i', { class: 'bar', style: { width: `${(t.score / max) * 100}%` } }),
        h('div', { class: 'in' }, h('span', { class: 'pl', text: String(place) }), h('span', { class: 'nm', text: r.name }), h('span', { class: 'sc', text: `⚡${t.score}` }))); }));
    return;
  }
  const counts = [0, 0, 0, 0]; roster.forEach((p) => counts[p.crew]++);
  const order = CREWS.slice(0, snap.md || 4).filter((c) => counts[c.id] > 0).map((c) => ({ ...c, score: snap.sc[c.id] })).sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...order.map((c) => c.score));
  let place = 0, last = null;
  $('board').replaceChildren(...order.map((c, i) => { if (c.score !== last) { place = i + 1; last = c.score; }
    return h('div', { class: `crow${place === 1 && c.score > 0 ? ' lead' : ''}`, style: { '--cc': c.color } }, h('i', { class: 'bar', style: { width: `${(c.score / max) * 100}%` } }),
      h('div', { class: 'in' }, h('span', { class: 'pl', text: String(place) }), h('span', {}, h('div', { class: 'nm', text: c.name }), h('div', { class: 'ppl', text: `${counts[c.id]} player${counts[c.id] === 1 ? '' : 's'}` })), h('span', { class: 'sc', text: `⚡${c.score}` }))); }));
}
function renderStats() {
  if (!stats) return;
  $('stats').replaceChildren(...[
    h('div', {}, 'Answers: ', h('b', { text: String(stats.answers) }), ' · Class accuracy: ', h('b', { text: stats.accuracy === null ? '–' : `${Math.round(stats.accuracy * 100)}%` })),
    h('div', {}, 'Toughest so far: ', h('b', { text: stats.hardest.length ? stats.hardest.map((q) => `Q${q.i + 1} (${Math.round(q.acc * 100)}%)`).join(', ') : '–' })),
    h('div', { class: 'small', text: `${stats.players} players · ${stats.packTitle}` }),
    stats.idle ? h('div', { class: 'idle', text: `⚠ ${stats.idle} player${stats.idle === 1 ? ' hasn\'t' : 's haven\'t'} answered in the last minute (📋 for names)` }) : null].filter(Boolean));
}
function renderFeed() { $('feed').replaceChildren(...feedItems.map((f) => h('li', { style: { '--cc': f.crew !== null && f.crew !== undefined ? CREWS[f.crew].color : '#6a4cff' }, text: f.text }))); }

function renderLobby() {
  if (!room || modalReturn) return;
  const url = `${room.joinBase}/play.html?room=${room.code}`;
  overlay(h('div', { class: 'lobby' },
    h('h2', { text: 'Join on your phone!' }), qrSvg(url, 200),
    h('div', { class: 'code', text: room.code }), h('div', { class: 'url', text: url }),
    h('div', { class: 'count', text: `${roster.length} / 40 players` }),
    modeButtons(),
    h('ol', {},
      h('li', { text: 'Make your character and run around!' }),
      h('li', { text: 'Walk to a glowing ❓ locker and answer.' }),
      h('li', { text: 'Correct = loot: fuses, speed, shields, zaps.' }),
      h('li', { text: settings.teams === 0 ? 'Carry fuses to the GENERATOR to score.' : 'Carry fuses to the GENERATOR for your crew.' }),
      h('li', { text: settings.teams === 0 ? 'Tagged by a zombie? Tag another player to turn back!' : 'Tagged by a zombie? Tag another crew to turn back!' }),
      h('li', { text: 'Keep your ⚡ power meter up by answering questions.' }))), false);
}

function modeButtons() {
  const n = roster.length; const sug = n < 6 ? 0 : n < 12 ? 2 : n < 20 ? 3 : 4;
  const opts = [[0, 'Solo'], [2, '2 crews'], [3, '3 crews'], [4, '4 crews']];
  return h('div', {}, h('div', { class: 'modes' }, opts.map(([v, label]) => h('button', { class: `btn${settings.teams === v ? ' on' : ''}`, onclick: () => act('settings', { teams: v }), text: label }))),
    h('div', { class: 'suggest', text: n ? `Suggested for ${n} players: ${opts.find((o) => o[0] === sug)[1]}${settings.goal ? ` · Goal: first to ${settings.goal}` : ''}` : (settings.goal ? `Goal: first to ${settings.goal}` : '') }));
}

function renderResults() {
  if (!results) return;
  const cv = h('canvas', { class: 'podium', width: 560, height: 300 });
  const review = h('div', { class: 'review' }, h('h2', { text: 'Let\'s review the toughest questions' }));
  const hard = (results.hardest || []);
  if (!hard.length) review.append(h('p', { text: 'Not enough answers yet to pick out tough questions.' }));
  for (const q of hard) review.append(h('div', { class: 'rq' }, h('span', { class: 'acc', text: `${Math.round(q.acc * 100)}% correct` }), h('div', { text: `Q${q.i + 1}. ${q.prompt}` }), h('div', {}, h("b", { text: `Answer ${LETTERS[q.correct]}: ${q.options[q.correct].replace(/[.!?]$/, "")}. ` }), q.explanation)));
  review.append(h('p', { class: 'muted', text: `${results.answers} answers · class accuracy ${Math.round(results.accuracy * 100)}%` }));
  const solo = results.mode === 0;
  const left = h('div', {}, h('h2', { text: solo ? (results.top[0] ? `🏆 ${results.top[0].name} wins!` : 'Game over!') : (results.crews[0] ? `🏆 Crew ${CREWS[results.crews[0].crew].name} wins!` : 'Game over!') }), cv,
    h('div', { class: 'row' }, h('button', { class: 'btn primary big', onclick: () => act('reset'), text: '↺ Play again' })));
  overlay(h('div', { class: 'results' }, left, review), true);
  drawPodium(cv);
}
function drawPodium(cv) {
  const c = cv.getContext('2d'); const solo = results.mode === 0; const crews = solo ? results.top.slice(0, 3).map((p) => ({ ...p, crew: p.crew, solo: true })) : results.crews.slice(0, 4); const t0 = performance.now();
  const slots = [{ x: 280, h: 120 }, { x: 140, h: 85 }, { x: 420, h: 60 }, { x: 520, h: 30 }];
  const conf = Array.from({ length: reduced ? 0 : 70 }, () => ({ x: Math.random() * 560, y: -Math.random() * 300, v: 40 + Math.random() * 60, col: ['#ff5fa2', '#ffd23f', '#2ec4ff', '#3ddc84', '#8f6bff'][Math.floor(Math.random() * 5)], r: Math.random() * 6 }));
  const loop = (now) => {
    if (!cv.isConnected) return;
    const t = (now - t0) / 1000; c.clearRect(0, 0, 560, 300);
    crews.forEach((cr, i) => {
      const s = slots[Math.min(cr.place - 1, 3)] || slots[3]; const col = CREWS[cr.crew].color; const x = i < 3 ? slots[i].x : s.x; const hgt = i < 3 ? slots[i].h : 30;
      c.fillStyle = col; c.strokeStyle = '#2b2340'; c.lineWidth = 4; c.beginPath(); c.roundRect(x - 62, 290 - hgt, 124, hgt, 10); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = '900 26px Trebuchet MS, Arial'; c.textAlign = 'center'; c.fillText(String(cr.place), x, 290 - hgt + 32);
      c.fillStyle = '#2b2340'; c.font = '900 16px Trebuchet MS, Arial'; c.fillText(`${cr.solo ? cr.name : CREWS[cr.crew].name} ⚡${cr.score}`, x, 290 - hgt + 54 > 286 ? 286 : 290 - hgt + 54);
      const members = cr.solo ? roster.filter((p) => p.n === cr.n) : roster.filter((p) => p.crew === cr.crew).slice(0, 3);
      members.forEach((p, k) => drawAvatar(c, x + (k - (members.length - 1) / 2) * 34, 290 - hgt - 2 - (cr.place === 1 && !reduced ? Math.abs(Math.sin(t * 5 + k)) * 10 : 0), 52, { avatar: p.avatar, t: reduced ? 0 : t, dir: 1, emote: cr.place === 1 ? 'dance' : null, seed: k }));
      if (cr.place === 1) { c.fillStyle = '#ffd23f'; star(c, x, 290 - hgt - 95, 16, t); }
    });
    for (const q of conf) { q.y += q.v / 60; if (q.y > 300) q.y = -10; c.save(); c.translate(q.x + Math.sin(t * 3 + q.r) * 8, q.y); c.rotate(t * 4 + q.r); c.fillStyle = q.col; c.fillRect(-4, -2, 8, 4); c.restore(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
