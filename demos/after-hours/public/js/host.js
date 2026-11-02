import { api, startPolling, h, qrSvg, reducedMotion, LETTERS, store } from './net.js';
import { CampusRenderer } from './map-render.js';
import { loadStore } from './packstore.js';
import { validatePack } from './shared/packs.js';
import { NODES, CREWS } from './shared/map-data.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const HOST_KEY = 'afterhours.host.v1';
const sound = new Sound();
let room = null; // { code, token, joinBase }
let poller = null; let renderer = null; let view = null;
let overlayKey = ''; let deadlineAt = null; let deadlineTotal = 1;
let captionTimer = null; let resolveDone = false;

// ---------------- setup ----------------
const setupMap = new CampusRenderer($('setupMap'), { reducedMotion: reducedMotion(), title: true });
setupMap.setState({ crews: CREWS.map((c) => ({ id: c.id, color: c.color, node: c.start, active: true })), mission: null, phase: 'lobby' });

const packStore = loadStore();
function fillPacks() {
  const sel = $('packSelect'); sel.replaceChildren();
  for (const p of packStore.packs) {
    const v = validatePack(p);
    sel.append(h('option', { value: p.id, text: `${p.title} — ${p.questions.length} questions${v.ok ? '' : ' (needs fixing)'}` }));
  }
  sel.value = packStore.selectedId;
  showPackInfo();
}
function showPackInfo() {
  const p = packStore.packs.find((x) => x.id === $('packSelect').value);
  const v = p ? validatePack(p) : { ok: false, errors: ['No pack'] };
  $('packInfo').textContent = v.ok
    ? `${p.description || ''} About ${Math.max(6, Math.round(p.questions.length * 1.1))} minutes.`
    : `This pack has problems: ${v.errors.slice(0, 2).join(' ')} Open the editor to fix it.`;
}
$('packSelect').addEventListener('change', showPackInfo);
fillPacks();

api('/api/info').then((info) => {
  if (!$('joinBase').value) $('joinBase').value = info.joinBaseUrl || location.origin;
  $('lanHint').textContent = info.lanAddresses.length
    ? `Detected on this computer: ${info.lanAddresses.join(', ')}. Phones must be on the same Wi-Fi. "localhost" will not work on phones.`
    : 'No network address detected. Phones cannot reach "localhost" — connect to the classroom Wi-Fi or set JOIN_BASE_URL.';
}).catch(() => { $('joinBase').value = location.origin; });

const saved = store(HOST_KEY);
if (saved && saved.code && saved.token) {
  api(`/api/rooms/${saved.code}/state?since=0`, { headers: { 'X-Host-Token': saved.token } }).catch((e) => e).then((r) => {
    if (r && r.code) {
      const box = $('resumeBox'); box.classList.remove('hidden');
      box.append(h('span', { text: `Room ${saved.code} is still running (${r.phase}).` }),
        h('button', { class: 'btn small primary', onclick: () => enterGame(saved) , text: 'Resume room' }));
    }
  });
}

async function create(demo) {
  $('setupErr').textContent = '';
  const p = packStore.packs.find((x) => x.id === $('packSelect').value);
  const v = validatePack(p);
  if (!v.ok) { $('setupErr').textContent = `Pack problems: ${v.errors.slice(0, 3).join(' ')}`; return; }
  const joinBase = ($('joinBase').value || location.origin).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(joinBase)) { $('setupErr').textContent = 'Join address must start with http:// or https://'; return; }
  try {
    const r = await api('/api/rooms', { method: 'POST', body: { pack: v.pack, demo, demoBots: 12, settings: { questionSeconds: Number($('qSecs').value), voteSeconds: Number($('vSecs').value), autoAdvance: $('autoAdv').checked } } });
    const info = { code: r.code, token: r.hostToken, joinBase };
    store(HOST_KEY, info);
    enterGame(info);
  } catch (e) { $('setupErr').textContent = e.message; }
}
$('createBtn').addEventListener('click', () => create(false));
$('demoBtn').addEventListener('click', () => create(true));

// ---------------- game ----------------
function enterGame(info) {
  room = { ...info, joinBase: info.joinBase || location.origin };
  setupMap.destroy();
  $('setup').classList.add('hidden'); $('game').classList.remove('hidden');
  renderer = new CampusRenderer($('map'), { reducedMotion: reducedMotion() });
  renderer.onCaption = showCaption;
  renderer.onQueueDone = () => { resolveDone = true; if (view && view.phase === 'resolve') setBanner('Map updated — press NEXT for the next question'); };
  $('codeMini').textContent = room.code;
  poller = startPolling({
    code: room.code, headers: () => ({ 'X-Host-Token': room.token }),
    onState: render,
    onConn: (s) => conn(s),
    onFatal: (e) => { conn('lost'); $('ctrlMsg').textContent = `Room unavailable: ${e.message}`; store(HOST_KEY, null); }
  });
}

function conn(s) {
  const b = $('conn');
  if (s === 'ok') { b.classList.add('hidden'); return; }
  b.classList.remove('hidden', 'ok');
  b.textContent = s === 'lost' ? 'Connection to the game server lost — retrying…' : 'Reconnecting to the game server…';
}

async function act(action) {
  if (!room) return;
  if (action === 'reset' && !confirm('Reset the mission? Players stay in their crews; progress is cleared.')) return;
  if (action === 'end' && !confirm('End the mission now and go to extraction?')) return;
  try {
    await api(`/api/rooms/${room.code}/host/${action}`, { method: 'POST', headers: { 'X-Host-Token': room.token }, body: {} });
    $('ctrlMsg').textContent = '';
  } catch (e) { $('ctrlMsg').textContent = e.message; }
}
$('cStart').onclick = () => act('start');
$('cReveal').onclick = () => act('reveal');
$('cNext').onclick = () => act('next');
$('cPause').onclick = () => act(view && view.paused ? 'resume' : 'pause');
$('cEnd').onclick = () => act('end');
$('cReset').onclick = () => act('reset');
$('soundBtn').onclick = () => { const on = sound.toggle(); $('soundBtn').textContent = on ? '🔊 Sound' : '🔇 Sound'; $('soundBtn').setAttribute('aria-pressed', String(on)); };
document.addEventListener('keydown', (e) => {
  if (!view || e.target.closest('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (k === 'n' || k === 'arrowright') { e.preventDefault(); if (view.phase === 'lobby') act('start'); else act('next'); }
  else if (k === 'r') act('reveal');
  else if (k === 'p') act(view.paused ? 'resume' : 'pause');
});

const PHASE_NAMES = { lobby: 'Lobby', question: 'Question', reveal: 'Answer + Why', vote: 'Crew decisions', resolve: 'Map update', extraction: 'Extraction', debrief: 'Debrief' };

function render(v) {
  const prev = view; view = v;
  renderer.setState(v);
  $('demoTag').classList.toggle('hidden', !v.demo);
  $('phaseLabel').textContent = PHASE_NAMES[v.phase] + (v.paused ? ' · paused' : '');
  $('roundLabel').textContent = v.roundIndex >= 0 && v.phase !== 'debrief' ? `Q ${v.roundIndex + 1} / ${v.totalRounds}` : `${v.playerCount} / ${v.maxPlayers} players`;
  $('pauseVeil').classList.toggle('hidden', !v.paused);
  // timer
  if (v.remainingMs !== null && !v.paused) {
    const total = v.phase === 'question' ? v.settings.questionSeconds * 1000 : v.phase === 'vote' ? v.settings.voteSeconds * 1000 : Math.max(v.remainingMs, 1);
    deadlineAt = performance.now() + v.remainingMs; deadlineTotal = total;
  } else deadlineAt = null;
  if (v.paused && v.remainingMs !== null) { $('timerTxt').textContent = Math.ceil(v.remainingMs / 1000); }
  // controls
  const ph = v.phase;
  $('cStart').classList.toggle('hidden', ph !== 'lobby');
  $('cStart').disabled = v.playerCount === 0;
  $('cReveal').disabled = ph !== 'question';
  $('cNext').disabled = ['lobby', 'debrief'].includes(ph);
  $('cNext').textContent = { question: 'Close answers (N)', reveal: 'Crew decisions (N)', vote: 'Close votes (N)', resolve: v.roundIndex + 1 >= v.totalRounds ? 'Dawn extraction (N)' : 'Next question (N)', extraction: 'Debrief (N)' }[ph] || 'Next (N)';
  $('cPause').disabled = ['lobby', 'debrief'].includes(ph);
  $('cPause').textContent = v.paused ? 'Resume (P)' : 'Pause (P)';
  $('cEnd').disabled = ['lobby', 'extraction', 'debrief'].includes(ph);
  renderRail(v);
  renderOverlay(v, prev);
  if (prev && prev.phase !== ph) {
    if (ph === 'reveal') sound.blip('reveal');
    if (ph === 'resolve') resolveDone = false;
  }
  if (prev && prev.mission && v.mission && !prev.mission.power && v.mission.power) sound.blip('power');
  if (ph === 'vote') setBanner('CREW DECISIONS — vote on your phones');
  else if (ph === 'resolve') setBanner(resolveDone ? 'Map updated — press NEXT for the next question' : 'MAP UPDATE');
  else setBanner(null);
  if (ph !== 'resolve' && ph !== 'vote') hideCaption();
}

function setBanner(t) { const b = $('banner'); if (!t) { b.classList.add('hidden'); return; } b.textContent = t; b.classList.remove('hidden'); }
function showCaption(text, e) {
  const c = $('caption'); c.textContent = text; c.classList.remove('hidden', 'danger', 'power');
  if (e.t === 'cornered' || e.t === 'spawn') { c.classList.add('danger'); sound.blip('warn'); }
  if (e.t === 'power') c.classList.add('power');
  if (e.t === 'collect' || e.t === 'install' || e.t === 'gate') sound.blip('good');
  clearTimeout(captionTimer); captionTimer = setTimeout(hideCaption, 4500);
}
function hideCaption() { $('caption').classList.add('hidden'); }

setInterval(() => {
  if (!view) return;
  const t = $('timer');
  if (deadlineAt === null) { if (!view.paused) $('timerTxt').textContent = '–'; $('timerArc').style.strokeDashoffset = '0'; t.classList.remove('low'); return; }
  const left = Math.max(0, deadlineAt - performance.now());
  $('timerTxt').textContent = Math.ceil(left / 1000);
  $('timerArc').style.strokeDashoffset = String(106.8 * (1 - left / deadlineTotal));
  t.classList.toggle('low', left < 6000 && ['question', 'vote'].includes(view.phase));
}, 200);

function cells(n, max = 9) { return h('span', { class: 'cells', 'aria-label': `${n} power cells` }, Array.from({ length: Math.min(max, Math.max(n, 3)) }, (_, i) => h('i', { class: i < n ? 'on' : '' }))); }

function renderRail(v) {
  const rail = $('rail'); rail.replaceChildren();
  if (v.mission) {
    const m = v.mission;
    rail.append(h('div', { class: 'mission-card' },
      h('div', {}, 'Generator: ', h('b', { text: `${m.installed} / ${m.needed} fuses` }), m.power ? ' · POWER ON' : ''),
      h('div', { class: 'muted' }, m.power ? 'Front gate is OPEN — get every crew there by dawn.' : `Collect fuses (⚡ glowing icons) and bring them to the Generator. Hordes: ${m.hordes.length}`)));
  } else {
    rail.append(h('div', { class: 'mission-card' }, h('b', { text: 'Mission: ' }), 'restore power, reach the front gate by dawn.'));
  }
  for (const c of v.crews) {
    const card = h('div', { class: `crew-card${c.active ? '' : ' inactive'}`, style: { '--cc': c.color } });
    card.append(h('div', { class: 'hd' }, h('span', { class: 'nm', text: `Crew ${c.name}` }), h('span', { class: 'ppl', text: `${c.connected}/${c.members} online` })));
    if (v.mission && c.active) {
      const st = h('div', { class: 'st' }, cells(c.energy), h('span', {}, 'at ', h('b', { text: NODES[c.node].short })));
      if (c.carrying) st.append(h('span', { class: 'badge fuse', text: 'FUSE' }));
      if (c.cornered) st.append(h('span', { class: 'badge corner', text: 'CORNERED' }));
      if (c.node === 'GATE') st.append(h('span', { class: 'badge gate', text: 'AT GATE' }));
      card.append(st);
    } else if (!c.active && v.mission) card.append(h('div', { class: 'st', text: 'No crew members this mission' }));
    if (!v.mission) card.append(h('div', { class: 'st' }, 'Starts in the ', h('b', { text: NODES[c.node].short })), h('div', { class: 'st', text: c.members ? `${c.members} member${c.members === 1 ? '' : 's'} ready` : 'Waiting for members…' }));
    if (v.phase === 'question' && c.active) {
      const pct = c.expected ? (c.answered / c.expected) * 100 : 0;
      card.append(h('div', { class: 'st', text: `Answered ${c.answered} / ${c.expected}` }), h('div', { class: 'progress' }, h('i', { style: { width: `${pct}%` } })));
    }
    if (v.phase === 'vote' && c.active) {
      card.append(h('div', { class: 'st', text: `Voted ${c.voted} / ${c.connected}` }));
      const tl = h('div', { class: 'tallies' });
      const max = Math.max(0, ...Object.values(c.tally || {}));
      for (const o of c.options) {
        const n = (c.tally || {})[o.id] || 0;
        tl.append(h('div', { class: n && n === max ? 'win' : '' }, h('span', { text: `${o.label}${o.cost ? ` (${o.cost}⚡)` : ''}` }), h('span', { text: String(n) })));
      }
      card.append(tl);
    }
    if (v.phase === 'resolve' && v.mission) {
      const d = (v.mission.decisions || []).find((x) => x.crew === c.id);
      if (d) card.append(h('div', { class: 'st' }, 'Chose: ', h('b', { text: d.label })));
    }
    if (v.phase === 'reveal' && v.reveal && c.active) {
      const r = v.reveal.crews[c.id];
      card.append(h('div', { class: 'st' }, r.accuracy === null ? 'No answers counted' : `${Math.round(r.accuracy * 100)}% correct → `, r.accuracy === null ? '' : h('b', { text: `+${r.gained} ⚡` })));
    }
    rail.append(card);
  }
}

function optionEls(q, reveal) {
  const total = reveal ? reveal.counts.reduce((a, b) => a + b, 0) || 1 : 1;
  return h('div', { class: 'opts' }, q.options.map((o, i) => {
    const cls = reveal ? (i === reveal.correct ? 'opt correct' : 'opt dim') : 'opt';
    const el = h('div', { class: cls }, h('span', { class: 'L', text: LETTERS[i] }), h('span', { text: o }));
    if (reveal) { el.append(h('span', { class: 'cnt', text: String(reveal.counts[i]) }), h('i', { class: 'bar', style: { width: `${(reveal.counts[i] / total) * 100}%` } })); }
    return el;
  }));
}

function renderOverlay(v, prev) {
  const ov = $('overlay');
  const key = `${v.phase}|${v.roundIndex}|${v.reveal ? 1 : 0}`;
  const wrap = document.querySelector('.map-wrap');
  wrap.querySelectorAll('.extract-title').forEach((x) => { if (v.phase !== 'extraction') x.remove(); });
  if (v.phase === 'lobby') {
    if (overlayKey !== key) { ov.className = 'overlay lobby'; ov.replaceChildren(lobbyLeft(v), h('div', { class: 'rules' }, rulesEl(), h('div', { id: 'rosters', class: 'rosters' }))); }
    const rs = $('rosters'); rs.replaceChildren(...v.crews.map((c, i) => h('div', { class: 'roster', style: { '--cc': c.color } },
      h('h3', { text: `Crew ${c.name} · ${c.members}` }),
      h('ul', {}, (v.roster ? v.roster[i] : []).map((p) => h('li', { class: p.connected ? '' : 'off', text: p.callsign }))))));
    ov.classList.remove('hidden');
  } else if (v.phase === 'question' || v.phase === 'reveal') {
    if (overlayKey !== key) {
      ov.className = 'overlay';
      const q = v.question;
      const kids = [h('div', { class: 'q-head' }, h('span', { class: 'q-num', text: `QUESTION ${v.roundIndex + 1} / ${v.totalRounds}` }), h('span', { class: 'muted small', text: 'Teacher-authored practice' }))];
      if (q.passage) kids.push(h('div', { class: 'passage', text: q.passage }));
      const body = h('div', { class: 'q-body' }, h('div', { class: 'prompt', text: q.prompt }));
      if (q.image) body.append(h('img', { src: q.image, alt: 'Question picture' }));
      kids.push(body, optionEls(q, v.reveal));
      if (v.reveal) {
        kids.push(h('div', { class: 'why' }, h('b', { text: `Answer ${LETTERS[v.reveal.correct]}. WHY: ` }), v.reveal.explanation));
        kids.push(h('div', { class: 'crew-gains' }, v.reveal.crews.filter((r) => r.active).map((r) => h('div', { class: 'crew-gain', style: { '--cc': CREWS[r.crew].color } },
          h('b', { text: CREWS[r.crew].name }), ' ', r.accuracy === null ? 'no answers' : `${Math.round(r.accuracy * 100)}% → +${r.gained}⚡`))));
        kids.push(h('div', { class: 'muted small', text: `Class: ${v.reveal.classCorrect} of ${v.reveal.classCounted} correct. Power cells are based on each crew's percentage correct, not speed.` }));
      } else kids.push(h('div', { id: 'answeredInd', class: 'answered-ind' }));
      ov.replaceChildren(...kids);
    }
    const ind = $('answeredInd');
    if (ind) {
      const all = v.expectedCount > 0 && v.answeredCount >= v.expectedCount;
      ind.className = `answered-ind${all ? ' all' : ''}`;
      ind.textContent = all ? `✔ Everyone has answered (${v.answeredCount})` : `${v.answeredCount} / ${v.expectedCount} answered — answer on your phone`;
    }
    ov.classList.remove('hidden');
  } else if (v.phase === 'debrief') {
    if (overlayKey !== key) { ov.className = 'overlay'; ov.replaceChildren(debriefEl(v)); }
    ov.classList.remove('hidden');
  } else {
    ov.classList.add('hidden');
    if (v.phase === 'extraction' && !wrap.querySelector('.extract-title')) {
      wrap.append(h('div', { class: 'extract-title' }, 'DAWN — EXTRACTION', h('div', { style: { fontSize: '.45em', letterSpacing: '.05em' }, text: v.summary && v.summary.power ? 'The rescue bus pulls up to the front gate…' : 'The dawn patrol arrives at the side fence…' })));
    }
  }
  overlayKey = key;
  void prev;
}

function lobbyLeft(v) {
  const url = `${room.joinBase}/play.html?room=${room.code}`;
  return h('div', { class: 'qr-box' },
    h('h2', { text: 'Join on your phone' }), qrSvg(url, 230),
    h('div', { class: 'code', text: room.code }), h('div', { class: 'url', text: url }),
    h('div', { class: 'muted small', text: 'Use a callsign, not your real name. Same Wi-Fi as this computer.' }),
    v.demo ? h('span', { class: 'tag demo', text: 'DEMO players are simulated' }) : null);
}

function rulesEl() {
  return h('div', {},
    h('h2', { text: 'The power is out. You are locked in after hours.' }),
    h('ol', {},
      h('li', { text: 'Answer each question on your phone. Your crew\'s % correct earns up to 2 ⚡ power cells.' }),
      h('li', { text: 'See the answer and WHY on the big screen.' }),
      h('li', { text: 'Vote with your crew: move, search for fuses, barricade, or rescue.' }),
      h('li', { text: 'Bring fuses to the Generator to unlock the gate. Reach the gate by dawn!' })),
    h('p', { class: 'muted small', text: 'Hordes move toward crews. Barricades stop them. Cornered crews can push back or be rescued. Nobody is eliminated.' }));
}

function debriefEl(v) {
  const s = v.summary;
  const outcome = { full: 'FULL EXTRACTION — every crew escaped through the front gate!', gate: 'POWER RESTORED — the gate opened; the dawn patrol collected the crews still inside.', fence: 'THE LONG WAY OUT — the gate stayed locked, so the dawn patrol helped every crew over the side fence.' }[s.outcome];
  const stars = h('div', { class: 'stars', 'aria-label': `${s.stars} of 3 stars` }, [0, 1, 2].map((i) => h('span', { class: i < s.stars ? '' : 'off', text: '★' })));
  const left = h('div', {},
    h('h2', { text: 'Mission debrief' }), stars, h('div', { class: 'outcome', text: outcome }),
    h('ul', {},
      h('li', { text: `${s.power ? '★' : '☆'} Power restored (${s.installed}/${s.needed} fuses)` }),
      h('li', { text: `${s.activeCrews && s.atGate === s.activeCrews ? '★' : '☆'} Crews at the gate at dawn: ${s.atGate} / ${s.activeCrews}` }),
      h('li', { text: `${s.classAccuracy >= 0.7 ? '★' : '☆'} Class accuracy ${Math.round(s.classAccuracy * 100)}% (goal 70%)` })),
    h('h3', { text: 'Crew accuracy' }),
    h('div', { class: 'crew-gains' }, s.crewStats.filter((c) => c.active).map((c) => h('div', { class: 'crew-gain', style: { '--cc': CREWS[c.crew].color } }, h('b', { text: CREWS[c.crew].name }), ` ${c.accuracy === null ? '–' : Math.round(c.accuracy * 100) + '%'}`))),
    h('div', { class: 'row', style: { marginTop: '14px' } }, h('button', { class: 'btn primary', onclick: () => act('reset'), text: 'Play again (same crews)' })));
  const right = h('div', {},
    h('h3', { text: 'Class accuracy by question' }),
    h('div', { class: 'qbars' }, s.perQuestion.map((q) => h('div', { style: { height: `${Math.max(4, (q.accuracy || 0) * 100)}%` }, title: `Q${q.round + 1}` , 'aria-label': `Question ${q.round + 1}: ${Math.round((q.accuracy || 0) * 100)}%` }, h('span', { text: `Q${q.round + 1}` })))),
    h('h3', { style: { marginTop: '28px' }, text: 'Words to review' }),
    h('div', { class: 'vocab-chips' }, (v.vocab || []).map((w) => h('span', { title: w.clue, text: w.word }))),
    h('p', { class: 'muted small', text: 'Results are class and crew totals only. No individual answers are shown or stored after the room closes.' }));
  return h('div', { class: 'debrief' }, left, right);
}
