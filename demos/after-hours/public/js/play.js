import { api, startPolling, h, LETTERS, store, reducedMotion } from './net.js';
import { createRunner } from './runner.js';
import { NODES, CREWS } from './shared/map-data.js';

const $ = (id) => document.getElementById(id);
const ID_KEY = 'afterhours.player.v1';
let me = null; // {code, playerId, secret, callsign, crew}
let view = null; let poller = null; let mainKey = ''; let deadlineAt = null;
let pendingAnswer = null; let runner = null; let runnerVocabKey = '';

const params = new URLSearchParams(location.search);
const roomParam = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
$('roomIn').value = roomParam;

const ANIMALS = ['Owl', 'Moth', 'Fox', 'Comet', 'Echo', 'Pixel', 'Ember', 'Nova', 'Rook', 'Wren', 'Lynx', 'Orbit', 'Gecko', 'Koi', 'Mango', 'Lotus'];
const ADJ = ['Quiet', 'Swift', 'Lucky', 'Brave', 'Silver', 'Neon', 'Hidden', 'Clever'];
function randomCallsign() { const r = (a) => a[Math.floor(Math.random() * a.length)]; return `${r(ADJ)} ${r(ANIMALS)} ${10 + Math.floor(Math.random() * 90)}`.slice(0, 16); }
$('nameIn').value = randomCallsign();
$('diceBtn').onclick = () => { $('nameIn').value = randomCallsign(); };

async function join(body, code) {
  const r = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body });
  me = { code, playerId: r.playerId, secret: r.secret, callsign: r.callsign, crew: r.crew };
  store(ID_KEY, me);
  enterGame();
}

$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('joinErr').textContent = '';
  const code = $('roomIn').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) { $('joinErr').textContent = 'Room code has 5 letters/numbers.'; return; }
  try { await join({ callsign: $('nameIn').value }, code); } catch (err) { $('joinErr').textContent = err.message; }
});

// Reconnect with the same identity (same crew, no duplicate scoring)
const saved = store(ID_KEY);
if (saved && saved.playerId && (!roomParam || saved.code === roomParam)) {
  join({ playerId: saved.playerId, secret: saved.secret }, saved.code).catch(() => { store(ID_KEY, null); $('roomIn').value = roomParam || saved.code; });
}

function enterGame() {
  $('joinView').classList.add('hidden'); $('gameView').classList.remove('hidden');
  const chip = $('crewChip'); chip.classList.remove('hidden');
  const crew = CREWS[me.crew]; chip.style.setProperty('--cc', crew.color); chip.textContent = `${crew.name} · ${me.callsign}`;
  document.body.style.setProperty('--cc', crew.color);
  history.replaceState(null, '', `play.html?room=${me.code}`);
  if (poller) poller.stop();
  poller = startPolling({
    code: me.code, headers: () => ({ 'X-Player-Id': me.playerId, 'X-Player-Secret': me.secret }),
    onState: render, onConn: conn,
    onFatal: (e) => { conn('lost'); store(ID_KEY, null); showFatal(e.message); }
  });
}

function showFatal(msg) {
  stopArcade();
  $('mainCard').replaceChildren(h('div', { class: 'big-msg' }, h('h2', { text: 'Disconnected from the room' }), h('p', { text: msg }), h('a', { class: 'btn primary', href: `play.html?room=${me ? me.code : ''}`, text: 'Join again' })));
}

function conn(s) {
  const b = $('conn');
  if (s === 'ok') { b.classList.add('hidden'); return; }
  b.classList.remove('hidden');
  b.textContent = s === 'lost' ? 'Offline — trying to reconnect… (your answers are safe)' : 'Reconnecting…';
}

const PH = { lobby: 'Waiting to start', question: 'Question', reveal: 'Answer + why', vote: 'Crew vote', resolve: 'Watch the big screen', extraction: 'Extraction', debrief: 'Debrief' };

function render(v) {
  view = v;
  const crew = v.crews[v.me.crew];
  if (v.remainingMs !== null && !v.paused) deadlineAt = performance.now() + v.remainingMs; else deadlineAt = null;
  // status
  const sc = $('statusCard'); sc.style.setProperty('--cc', crew.color);
  sc.replaceChildren(
    h('div', { class: 'grow' },
      h('div', { class: 'ph', text: `${PH[v.phase]}${v.roundIndex >= 0 && v.phase !== 'debrief' ? ` · Q${v.roundIndex + 1}/${v.totalRounds}` : ''}${v.demo ? ' · DEMO' : ''}` }),
      h('div', {}, h('b', { text: `Crew ${crew.name}` }), v.mission ? ` · ${NODES[crew.node].short}` : ` · ${crew.members} member${crew.members === 1 ? '' : 's'}`)),
    v.mission ? h('span', { class: 'cells', 'aria-label': `${crew.energy} power cells` }, Array.from({ length: Math.max(3, Math.min(9, crew.energy)) }, (_, i) => h('i', { class: i < crew.energy ? 'on' : '' }))) : null,
    h('div', { id: 'ptimer', class: 'tm', 'aria-live': 'off' }));
  // paused veil
  let veil = document.querySelector('.paused-veil');
  if (v.paused && !veil) { veil = h('div', { class: 'paused-veil' }, 'PAUSED', h('div', { style: { fontSize: '.5em', letterSpacing: '.05em' }, text: 'Look at the big screen' })); document.body.append(veil); }
  if (!v.paused && veil) veil.remove();

  const answered = v.me.answer !== null || (pendingAnswer && pendingAnswer.roundId === v.roundId);
  const key = [v.phase, v.roundIndex, answered ? 'a' : '-', v.me.vote || '-', v.phase === 'vote' ? crew.energy : '', v.phase === 'resolve' ? v.mission.eventSeq : '', v.reveal ? 'r' : ''].join('|');
  if (key !== mainKey) { mainKey = key; buildMain(v, crew, answered); }
  const w = $('waitInfo'); if (w && v.phase === 'question') w.textContent = `${v.answeredCount} / ${v.expectedCount} answered in the room`;
  gateArcade(v, answered);
}

function buildMain(v, crew, answered) {
  const mc = $('mainCard'); const kids = [];
  if (v.phase === 'lobby') {
    kids.push(h('div', { class: 'big-msg' }, h('h2', { text: `You're in Crew ${crew.name}` }), h('p', { text: 'Watch the big screen. The mission starts soon.' }), h('p', { class: 'muted', text: 'Try Signal Runner below while you wait.' })));
  } else if (v.phase === 'question') {
    const q = v.question;
    if (answered) {
      const ch = v.me.answer !== null ? v.me.answer : pendingAnswer.choice;
      kids.push(h('div', { class: 'locked', role: 'status' }, h('span', { class: 'L', text: LETTERS[ch] }), h('span', {}, 'Answer locked in. ', h('span', { class: 'muted', text: 'Wait for the reveal.' }))));
      kids.push(h('div', { id: 'waitInfo', class: 'muted' }));
    } else {
      if (q.passage) kids.push(h('div', { class: 'passage', text: q.passage }));
      kids.push(h('div', { class: 'prompt', text: q.prompt }));
      if (q.image) kids.push(h('img', { class: 'qimg', src: q.image, alt: 'Question picture' }));
      kids.push(h('div', { class: 'choices' }, q.options.map((o, i) => h('button', { class: 'choice', onclick: () => answer(i), 'aria-label': `${LETTERS[i]}: ${o}` }, h('span', { class: 'L', text: LETTERS[i] }), h('span', { text: o })))));
      kids.push(h('p', { id: 'ansErr', class: 'err', role: 'alert' }));
    }
  } else if (v.phase === 'reveal' && v.reveal) {
    const q = v.question; const mine = v.me.answer;
    if (mine === null) kids.push(h('div', { class: 'result miss', text: 'No answer this time — that\'s OK. Here\'s the answer:' }));
    else if (v.me.correct) kids.push(h('div', { class: 'result good', text: '✔ Correct! You helped your crew power up.' }));
    else kids.push(h('div', { class: 'result miss', text: `Not this time. You chose ${LETTERS[mine]}. The answer is ${LETTERS[v.reveal.correct]}.` }));
    kids.push(h('div', { class: 'choices' }, q.options.map((o, i) => h('button', { class: `choice${i === v.reveal.correct ? ' correct' : ''}${i === mine && i !== v.reveal.correct ? ' picked' : ''}`, disabled: true }, h('span', { class: 'L', text: LETTERS[i] }), h('span', { text: o })))));
    kids.push(h('div', { class: 'why' }, h('b', { text: 'WHY: ' }), v.reveal.explanation));
    const r = v.reveal.crews[v.me.crew];
    if (r && r.active) kids.push(h('div', { class: 'big-msg' }, h('b', { text: `Crew ${crew.name}: ` }), r.accuracy === null ? 'no answers counted' : `${Math.round(r.accuracy * 100)}% correct → +${r.gained} ⚡ power cells`));
  } else if (v.phase === 'vote') {
    if (!crew.active) kids.push(h('div', { class: 'big-msg', text: 'Your crew is not on the map this mission. Watch the big screen!' }));
    else {
      kids.push(h('div', { class: 'prompt', text: crew.cornered ? 'Your crew is CORNERED! What do you do?' : 'What should your crew do?' }));
      kids.push(h('div', { class: 'muted', text: `You have ${crew.energy} ⚡. Most votes in your crew wins. You can change your vote.` }));
      kids.push(h('div', { class: 'vote-list' }, crew.options.map((o) => h('button', {
        class: `vote${v.me.vote === o.id ? ' picked' : ''}${o.danger ? ' danger' : ''}`, disabled: !o.affordable, onclick: () => vote(o.id), 'aria-pressed': String(v.me.vote === o.id)
      }, h('span', { text: o.label }), h('span', { class: 'cost', text: o.cost ? `${o.cost}⚡` : 'free' })))));
      kids.push(h('p', { id: 'voteErr', class: 'err', role: 'alert' }));
    }
  } else if (v.phase === 'resolve') {
    const d = (v.mission.decisions || []).find((x) => x.crew === v.me.crew);
    kids.push(h('div', { class: 'big-msg' }, h('h2', { text: 'Watch the big screen' }), d ? h('p', {}, 'Your crew chose: ', h('b', { text: d.label })) : null,
      crew.cornered ? h('p', { text: '⚠ Your crew is cornered. Next vote: push back or wait for a rescue.' }) : null,
      crew.carrying ? h('p', { text: 'You are carrying a fuse — take it to the Generator!' }) : null,
      v.mission.power ? h('p', { text: 'Power is ON. Get to the front gate!' }) : h('p', { class: 'muted', text: `Generator: ${v.mission.installed}/${v.mission.needed} fuses` })));
  } else if (v.phase === 'extraction' || v.phase === 'debrief') {
    const s = v.summary;
    const cs = s.crewStats[v.me.crew];
    kids.push(h('div', { class: 'big-msg' },
      h('h2', { text: v.phase === 'extraction' ? 'Dawn — extraction!' : 'Mission complete' }),
      h('div', { class: 'stars' }, [0, 1, 2].map((i) => h('span', { class: i < s.stars ? '' : 'off', text: '★' }))),
      h('p', { text: s.outcome === 'full' ? 'Every crew escaped through the front gate!' : s.outcome === 'gate' ? 'The gate opened. The dawn patrol picked up the crews still inside.' : 'The dawn patrol helped every crew over the side fence.' }),
      h('p', {}, `Crew ${crew.name}: `, h('b', { text: cs.accuracy === null ? '–' : `${Math.round(cs.accuracy * 100)}% correct` }), cs.atGate ? ' · reached the gate' : ''),
      h('p', { class: 'muted', text: `Class accuracy ${Math.round(s.classAccuracy * 100)}%` })));
  }
  mc.replaceChildren(...kids);
}

async function answer(choice) {
  if (!view || view.phase !== 'question') return;
  const roundId = view.roundId;
  pendingAnswer = { roundId, choice };
  document.querySelectorAll('.choice').forEach((b, i) => { b.disabled = true; if (i === choice) b.classList.add('picked'); });
  try {
    await api(`/api/rooms/${me.code}/answer`, { method: 'POST', headers: { 'X-Player-Id': me.playerId, 'X-Player-Secret': me.secret }, body: { roundId, choice } });
    if (view) { mainKey = ''; render(view); }
  } catch (e) {
    pendingAnswer = null;
    if (e.code === 'already_answered') { mainKey = ''; return; }
    document.querySelectorAll('.choice').forEach((b) => { b.disabled = false; b.classList.remove('picked'); });
    const err = $('ansErr'); if (err) err.textContent = e.message;
  }
}

async function vote(option) {
  if (!view || view.phase !== 'vote') return;
  document.querySelectorAll('.vote').forEach((b) => b.classList.remove('picked'));
  try {
    await api(`/api/rooms/${me.code}/vote`, { method: 'POST', headers: { 'X-Player-Id': me.playerId, 'X-Player-Secret': me.secret }, body: { roundId: view.roundId, option } });
  } catch (e) { const err = $('voteErr'); if (err) err.textContent = e.message; }
}

setInterval(() => {
  const t = $('ptimer'); if (!t) return;
  t.textContent = deadlineAt === null ? '' : String(Math.ceil(Math.max(0, deadlineAt - performance.now()) / 1000));
}, 250);

// ---------- waiting mini-game gating ----------
function gateArcade(v, answered) {
  const allowed = !v.paused && (v.phase === 'lobby' || (v.phase === 'question' && answered));
  const box = $('arcade');
  if (!allowed) { stopArcade(); return; }
  if (!runner || runnerVocabKey !== v.code) {
    runner = createRunner($('runner'), { vocab: v.vocab, color: CREWS[v.me.crew].color, reduced: reducedMotion() });
    runnerVocabKey = v.code;
    runner.onChange(syncRunnerBtn); runner.draw();
  }
  box.classList.remove('hidden');
  syncRunnerBtn();
}
function stopArcade() {
  $('arcade').classList.add('hidden');
  if (runner && runner.running) runner.pause();
}
function syncRunnerBtn() { if (runner) $('rStart').textContent = runner.running ? 'Pause' : (runner.over ? 'Play again' : 'Play'); }
$('rStart').onclick = () => { if (!runner) return; if (runner.running) runner.pause(); else runner.start(); syncRunnerBtn(); };
$('rLeft').onclick = () => runner && runner.left();
$('rRight').onclick = () => runner && runner.right();
document.addEventListener('keydown', (e) => {
  if ($('arcade').classList.contains('hidden') || !runner || !runner.running) return;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { e.preventDefault(); runner.left(); }
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { e.preventDefault(); runner.right(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && runner && runner.running) runner.pause(); });
