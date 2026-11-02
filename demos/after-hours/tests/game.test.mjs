// Unit tests for the game engine and pack tools. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, GameError, MAX_PLAYERS } from '../src/game.mjs';
import { STARTER_PACK, GENERIC_PACK, validatePack, importSpreadsheet, publicQuestion, validateImage } from '../public/js/shared/packs.js';

function clock(start = 1_000_000) { let t = start; const f = () => t; f.add = (ms) => { t += ms; }; return f; }
function seeded(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const mk = (opts = {}) => { const now = clock(); const r = new Room({ code: 'TEST1', pack: STARTER_PACK, now, rng: seeded(3), ...opts }); return { r, now }; };
const joinN = (r, n, prefix = 'P') => Array.from({ length: n }, (_, i) => r.join({ callsign: `${prefix}${String(i).padStart(2, '0')}` }).player);
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof GameError, `expected GameError, got ${e}`); return e.code; } return 'no_error'; };

test('starter packs validate and correct answers are spread A/B/C/D', () => {
  for (const p of [STARTER_PACK, GENERIC_PACK]) assert.equal(validatePack(p).ok, true, validatePack(p).errors.join('\n'));
  assert.equal(STARTER_PACK.questions.length, 12);
  const dist = [0, 0, 0, 0]; STARTER_PACK.questions.forEach((q) => dist[q.correct]++);
  assert.deepEqual(dist, [3, 3, 3, 3]);
  const words = ['publish', 'collect', 'suitable', 'scary', 'primarily', 'text', 'add', 'belief', 'magical', 'although'];
  const all = JSON.stringify(STARTER_PACK.questions).toLowerCase();
  for (const w of words) assert.ok(all.includes(w.slice(0, 5)), `vocabulary "${w}" appears in the starter pack`);
});

test('malformed packs and images are rejected with readable errors', () => {
  assert.equal(validatePack(null).ok, false);
  assert.equal(validatePack([]).ok, false);
  assert.equal(validatePack({ title: 'x', questions: [] }).ok, false);
  const bad = validatePack({ title: 'x', questions: [{ prompt: 'q', options: ['a', 'b', 'c'], correct: 5, explanation: '' }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /four options/.test(e)));
  assert.ok(bad.errors.some((e) => /correct answer/.test(e)));
  assert.ok(bad.errors.some((e) => /explanation/.test(e)));
  assert.equal(validatePack({ title: 'x', questions: [{ prompt: 'q', options: ['a', 'a', 'c', 'd'], correct: 0, explanation: 'y' }] }).ok, false, 'duplicate options');
  assert.equal(validateImage('javascript:alert(1)').ok, false);
  assert.equal(validateImage('data:image/svg+xml;base64,PHN2Zz4=').ok, false, 'svg not allowed');
  assert.equal(validateImage('data:image/png;base64,' + 'A'.repeat(400_000)).ok, false, 'too large');
  assert.equal(validateImage('data:image/png;base64,iVBORw0KGgo=').ok, true);
  const withBadImg = validatePack({ title: 'x', questions: [{ prompt: 'q', options: ['a', 'b', 'c', 'd'], correct: 'B', explanation: 'y', image: 'data:text/html;base64,AAAA' }] });
  assert.equal(withBadImg.ok, false);
  const letter = validatePack({ title: 'x', questions: [{ prompt: 'q', options: ['a', 'b', 'c', 'd'], correct: 'C', explanation: 'y' }] });
  assert.equal(letter.ok, true); assert.equal(letter.pack.questions[0].correct, 2);
});

test('spreadsheet paste import: valid rows, header skip, quoted cells and bad rows', () => {
  const tsv = 'Question\tA\tB\tC\tD\tCorrect\tExplanation\tPassage\nWhat is 2+2?\t3\t4\t5\t6\tB\tTwo plus two is four.\t\n"Multi\nline"\tx\ty\tz\tw\t4\tBecause.\tSome passage';
  const ok = importSpreadsheet(tsv);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.questions.length, 2);
  assert.equal(ok.questions[0].correct, 1);
  assert.equal(ok.questions[1].prompt, 'Multi\nline');
  assert.equal(ok.questions[1].correct, 3);
  const bad = importSpreadsheet('Only\ttwo\ncolumns\nQ\ta\tb\tc\td\tE\twhy');
  assert.equal(bad.questions.length, 0);
  assert.ok(bad.errors.length >= 2);
  assert.ok(importSpreadsheet('').errors.length === 1);
});

test('public question view never includes the answer or explanation', () => {
  const pq = publicQuestion(STARTER_PACK.questions[0]);
  assert.equal('correct' in pq, false); assert.equal('explanation' in pq, false);
});

test('40 players join with balanced crews; 41st is rejected; callsign rules', () => {
  const { r } = mk();
  joinN(r, MAX_PLAYERS);
  const sizes = [0, 1, 2, 3].map((c) => r.crewMembers(c).length);
  assert.deepEqual(sizes, [10, 10, 10, 10]);
  assert.equal(code(() => r.join({ callsign: 'Extra' })), 'room_full');
  const { r: r2 } = mk();
  joinN(r2, 7);
  const s2 = [0, 1, 2, 3].map((c) => r2.crewMembers(c).length);
  assert.ok(Math.max(...s2) - Math.min(...s2) <= 1, `balanced: ${s2}`);
  assert.equal(code(() => r2.join({ callsign: 'p00' })), 'callsign_taken');
  assert.equal(code(() => r2.join({ callsign: '<script>' })), 'bad_callsign');
  assert.equal(code(() => r2.join({ callsign: 'x' })), 'bad_callsign');
  assert.equal(code(() => r2.join({ callsign: 'A'.repeat(40) })), 'bad_callsign');
});

test('reconnect with the same identity keeps id and crew; wrong secret is rejected', () => {
  const { r } = mk();
  const [a] = joinN(r, 3);
  const again = r.join({ playerId: a.id, secret: a.secret });
  assert.equal(again.reconnected, true); assert.equal(again.player.id, a.id); assert.equal(again.player.crew, a.crew);
  assert.equal(r.players.size, 3);
  assert.equal(code(() => r.join({ playerId: a.id, secret: 'nope' })), 'bad_identity');
  assert.equal(code(() => r.authPlayer(a.id, 'nope')), 'bad_identity');
});

test('phase rules: invalid phases, stale rounds, duplicates and bad votes are rejected', () => {
  const { r } = mk();
  assert.equal(code(() => r.hostAction('start')), 'no_players');
  const ps = joinN(r, 8);
  assert.equal(code(() => r.submitAnswer(ps[0], { roundId: r.roundId, choice: 0 })), 'wrong_phase');
  assert.equal(code(() => r.hostAction('next')), 'wrong_phase');
  assert.equal(code(() => r.hostAction('end')), 'wrong_phase');
  assert.equal(code(() => r.hostAction('dance')), 'bad_action');
  r.hostAction('start');
  assert.equal(r.phase, 'question');
  assert.equal(code(() => r.hostAction('start')), 'wrong_phase');
  assert.equal(code(() => r.submitAnswer(ps[0], { roundId: 'e1r99', choice: 0 })), 'stale_round');
  assert.equal(code(() => r.submitAnswer(ps[0], { roundId: r.roundId, choice: 7 })), 'bad_choice');
  assert.equal(code(() => r.submitAnswer(ps[0], { roundId: r.roundId, choice: '1' })), 'bad_choice');
  assert.equal(r.submitAnswer(ps[0], { roundId: r.roundId, choice: 1 }).duplicate, false);
  assert.equal(r.submitAnswer(ps[0], { roundId: r.roundId, choice: 1 }).duplicate, true, 'same answer twice is idempotent');
  assert.equal(code(() => r.submitAnswer(ps[0], { roundId: r.roundId, choice: 2 })), 'already_answered');
  assert.equal(r.answers.size, 1, 'no duplicate scoring');
  assert.equal(code(() => r.submitVote(ps[0], { roundId: r.roundId, option: 'hold' })), 'wrong_phase');
  const oldRound = r.roundId;
  r.hostAction('reveal');
  assert.equal(code(() => r.submitAnswer(ps[1], { roundId: oldRound, choice: 1 })), 'wrong_phase');
  r.hostAction('next'); // vote
  assert.equal(r.phase, 'vote');
  assert.equal(code(() => r.submitVote(ps[0], { roundId: r.roundId, option: 'fly:MOON' })), 'bad_option');
  assert.equal(code(() => r.submitVote(ps[0], { roundId: 'e0r0', option: 'hold' })), 'stale_round');
  const crew = r.mission.crews[ps[0].crew];
  crew.energy = 0; r.crewOptions[crew.id] = r.optionsFor(crew);
  const costly = r.crewOptions[crew.id].find((o) => o.cost > 0);
  assert.equal(code(() => r.submitVote(ps[0], { roundId: r.roundId, option: costly.id })), 'unaffordable');
  assert.deepEqual(r.submitVote(ps[0], { roundId: r.roundId, option: 'hold' }), { option: 'hold' });
});

test('answers stay hidden until reveal (player and host views)', () => {
  const { r } = mk();
  const ps = joinN(r, 4); r.hostAction('start');
  const q = STARTER_PACK.questions[0];
  for (const v of [r.view({ host: true }), r.view({ player: ps[0] })]) {
    const s = JSON.stringify(v);
    assert.equal(v.reveal, null);
    assert.equal(s.includes(q.explanation), false);
    assert.equal(s.includes(r.hostToken), false, 'host token never in state');
    assert.equal(s.includes('"correct":1'), false);
  }
  r.hostAction('reveal');
  assert.equal(r.view({ player: ps[0] }).reveal.correct, q.correct);
});

test('crew power is normalised percentage correct (not raw counts or speed); disconnected non-answerers excluded', () => {
  const { r, now } = mk({ connectedMs: 10_000 });
  const ps = joinN(r, 6); // crews: 2,2,1,1
  r.hostAction('start');
  const q = r.pack.questions[0];
  const byCrew = (c) => ps.filter((p) => p.crew === c);
  // crew 0: 1 of 2 correct (50%). crew 1: 1 correct, other member silent but connected (50%).
  r.submitAnswer(byCrew(0)[0], { roundId: r.roundId, choice: q.correct });
  r.submitAnswer(byCrew(0)[1], { roundId: r.roundId, choice: (q.correct + 1) % 4 });
  r.submitAnswer(byCrew(1)[0], { roundId: r.roundId, choice: q.correct });
  // crew 2: single member correct (100%). crew 3: single member disconnects without answering (not counted).
  r.submitAnswer(byCrew(2)[0], { roundId: r.roundId, choice: q.correct });
  now.add(11_000);
  for (const p of ps) if (p !== byCrew(3)[0]) r.seen(p);
  r.hostAction('reveal');
  const res = r.lastReveal.crews;
  assert.equal(res[0].accuracy, 0.5); assert.equal(res[1].accuracy, 0.5);
  assert.equal(res[0].gained, res[1].gained, 'same % = same reward');
  assert.equal(res[2].accuracy, 1); assert.equal(res[2].gained, 2);
  assert.equal(res[3].counted, 0); assert.equal(res[3].accuracy, null); assert.equal(res[3].gained, 0);
  assert.ok(res.every((x) => x.gained <= 2), 'bounded reward (max 2 cells per question)');
});

test('question closes automatically when every connected player answered, or on the timer', () => {
  const { r, now } = mk();
  const ps = joinN(r, 3); r.hostAction('start');
  ps.forEach((p) => r.submitAnswer(p, { roundId: r.roundId, choice: 0 }));
  assert.equal(r.phase, 'reveal');
  r.hostAction('next'); r.hostAction('next'); r.hostAction('next');
  assert.equal(r.phase, 'question'); assert.equal(r.roundIndex, 1);
  now.add(r.settings.questionSeconds * 1000 + 10); r.tick();
  assert.equal(r.phase, 'reveal');
  assert.equal(r.lastReveal.reason, 'timer');
});

test('pause freezes the timer and rejects answers; resume continues', () => {
  const { r, now } = mk();
  const ps = joinN(r, 2); r.hostAction('start');
  now.add(5000); r.hostAction('pause');
  const rem = r.view().remainingMs;
  now.add(120_000); r.tick();
  assert.equal(r.phase, 'question'); assert.equal(r.view().remainingMs, rem);
  assert.equal(code(() => r.submitAnswer(ps[0], { roundId: r.roundId, choice: 0 })), 'paused');
  r.hostAction('resume');
  assert.equal(r.paused, false);
  r.submitAnswer(ps[0], { roundId: r.roundId, choice: 0 });
});

test('late join during a question can answer; late joiners fill active crews', () => {
  const { r } = mk();
  joinN(r, 4); r.hostAction('start');
  const late = r.join({ callsign: 'Late01' }).player;
  assert.ok(r.eligible.has(late.id));
  r.submitAnswer(late, { roundId: r.roundId, choice: 0 });
  const { r: r2 } = mk();
  joinN(r2, 2); r2.hostAction('start'); // only crews 0,1 active
  const l2 = r2.join({ callsign: 'Late02' }).player;
  assert.ok([0, 1].includes(l2.crew), 'late joiner goes to an active crew');
});

test('running room keeps its own frozen pack snapshot', () => {
  const pack = JSON.parse(JSON.stringify(STARTER_PACK));
  const r = new Room({ code: 'SNAP1', pack });
  pack.questions[0].prompt = 'EDITED AFTER START'; pack.questions.pop();
  assert.notEqual(r.pack.questions[0].prompt, 'EDITED AFTER START');
  assert.equal(r.pack.questions.length, 12);
  assert.ok(Object.isFrozen(r.pack.questions[0]));
  assert.throws(() => new Room({ code: 'BAD01', pack: { title: '' } }), /invalid/);
});

test('reset returns to lobby, keeps crews, and old round ids become stale', () => {
  const { r } = mk();
  const ps = joinN(r, 4); r.hostAction('start');
  const old = r.roundId; const crewBefore = ps.map((p) => p.crew);
  r.hostAction('reset');
  assert.equal(r.phase, 'lobby'); assert.equal(r.mission, null);
  assert.deepEqual(ps.map((p) => r.players.get(p.id).crew), crewBefore);
  r.hostAction('start');
  assert.notEqual(r.roundId, old);
  assert.equal(code(() => r.submitAnswer(ps[0], { roundId: old, choice: 0 })), 'stale_round');
});

test('teacher can end early: extraction then debrief with aggregate-only summary', () => {
  const { r } = mk();
  const ps = joinN(r, 4); r.hostAction('start');
  r.submitAnswer(ps[0], { roundId: r.roundId, choice: 1 });
  r.hostAction('end');
  assert.equal(r.phase, 'extraction');
  const v = r.view({ host: true });
  assert.ok(v.summary); assert.equal(JSON.stringify(v.summary).includes(ps[0].callsign), false, 'no names in summary');
  r.hostAction('next');
  assert.equal(r.phase, 'debrief');
});

test('full mission with perfect answers and planned crew votes ends in full extraction', () => {
  const { r, now } = mk();
  const ps = joinN(r, 20); r.hostAction('start');
  let guard = 0;
  while (r.phase !== 'debrief' && guard++ < 200) {
    if (r.phase === 'question') { const q = r.pack.questions[r.roundIndex]; for (const p of ps) { if (r.phase !== 'question') break; r.submitAnswer(p, { roundId: r.roundId, choice: q.correct }); } }
    else if (r.phase === 'reveal') r.hostAction('next');
    else if (r.phase === 'vote') { for (const p of ps) { if (r.phase !== 'vote') break; const o = r.planOption(p.crew); if (o) r.submitVote(p, { roundId: r.roundId, option: o.id }); } if (r.phase === 'vote') r.hostAction('next'); }
    else r.hostAction('next');
    now.add(1000);
  }
  assert.equal(r.phase, 'debrief');
  assert.equal(r.summary.classAccuracy, 1);
  assert.equal(r.summary.power, true);
  assert.equal(r.summary.outcome, 'full', JSON.stringify(r.summary));
  assert.equal(r.summary.stars, 3);
});

test('weak accuracy never dead-ends: mission still reaches debrief, cornered crews are freed', () => {
  const { r, now } = mk();
  const ps = joinN(r, 8); r.hostAction('start');
  let guard = 0;
  while (r.phase !== 'debrief' && guard++ < 300) {
    if (r.phase === 'question') { now.add(r.settings.questionSeconds * 1000 + 1); r.tick(); }
    else if (r.phase === 'vote') { now.add(r.settings.voteSeconds * 1000 + 1); r.tick(); }
    else r.hostAction('next');
    for (const p of ps) r.seen(p);
  }
  assert.equal(r.phase, 'debrief');
  assert.ok(r.mission.crews.every((c) => !c.cornered || c.corneredRounds <= 2));
});
