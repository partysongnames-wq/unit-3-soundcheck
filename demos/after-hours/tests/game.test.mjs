// Unit tests: world, packs and the real-time game engine. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, GameError, MAX_PLAYERS } from '../src/game.mjs';
import { STARTER_PACK, GENERIC_PACK, validatePack, importSpreadsheet, validateImage } from '../public/js/shared/packs.js';
import { LOCKERS, GENERATOR, SPAWNS, ZOMBIE_SPAWNS, walkableTiles, path, collides, lockerStand, isWalkableTile } from '../public/js/shared/world.js';
import { cleanAvatar } from '../public/js/shared/avatar.js';

function clock(t = 1_000_000) { const f = () => t; f.add = (ms) => { t += ms; }; return f; }
function seeded(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function mk(opts = {}) {
  const now = clock(); const msgs = [];
  const r = new Room({ code: 'TEST1', pack: STARTER_PACK, now, rng: seeded(5), out: (to, m) => msgs.push({ to, m }), ...opts });
  return { r, now, msgs };
}
const joinN = (r, n) => Array.from({ length: n }, (_, i) => r.join({ callsign: `Player ${i}` }).player);
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof GameError, String(e)); return e.code; } return 'no_error'; };
function run(r, now, ms, step = 50) { for (let t = 0; t < ms; t += step) { now.add(step); r.tick(); } }
function startPlay(r, now) { r.hostAction('start'); run(r, now, 3600); assert.equal(r.phase, 'play'); }
function standAt(p, l) { const [x, y] = lockerStand(l); p.x = x; p.y = y; }
function online(r) { for (const p of r.players.values()) { p.connected = true; p.lastSeen = r.now(); } }

test('world: every walkable tile is reachable, lockers are reachable, spawns are clear', () => {
  const all = walkableTiles();
  const unreachable = all.filter(([x, y]) => !(x === 24 && y === 13) && path(24, 13, x, y) === null);
  assert.equal(unreachable.length, 0);
  assert.ok(LOCKERS.length >= 16);
  for (const l of LOCKERS) { const s = lockerStand(l); assert.ok(s, `locker ${l.id} has a standing spot`); assert.ok(path(24, 13, s[0], s[1]) !== null); }
  for (const [x, y] of [...SPAWNS, ...ZOMBIE_SPAWNS]) assert.equal(collides(x, y), false, `spawn ${x},${y}`);
  assert.ok(isWalkableTile(21, 12), 'generator is reachable from the corridor');
});

test('packs: starter content valid, answers spread A–D, bad input rejected', () => {
  for (const p of [STARTER_PACK, GENERIC_PACK]) assert.equal(validatePack(p).ok, true);
  const dist = [0, 0, 0, 0]; STARTER_PACK.questions.forEach((q) => dist[q.correct]++);
  assert.deepEqual(dist, [3, 3, 3, 3]);
  assert.equal(validatePack({ title: 'x', questions: [{ prompt: 'q', options: ['a', 'b'], correct: 9 }] }).ok, false);
  assert.equal(validateImage('data:image/svg+xml;base64,AAAA').ok, false);
  const t = importSpreadsheet('Question\tA\tB\tC\tD\tCorrect\tExplanation\nQ1?\ta\tb\tc\td\tC\tbecause');
  assert.equal(t.questions.length, 1); assert.equal(t.questions[0].correct, 2);
  assert.ok(importSpreadsheet('broken\trow').errors.length);
});

test('avatars are always cleaned to valid options', () => {
  assert.deepEqual(Object.values(cleanAvatar({ hair: 999, skin: -4, acc: 'x', face: 1.5, evil: '<script>' })).every(Number.isInteger), true);
  const a = cleanAvatar({ hair: 999, skin: -4 });
  assert.equal(a.skin, 0); assert.ok(a.hair < 10); assert.equal('evil' in cleanAvatar({ evil: 1 }), false);
});

test('joining: 40 max (41st rejected), balanced crews, nickname rules, same-identity reconnect', () => {
  const { r } = mk();
  const ps = joinN(r, MAX_PLAYERS);
  assert.deepEqual([0, 1, 2, 3].map((c) => r.crewSize(c)), [10, 10, 10, 10]);
  assert.equal(code(() => r.join({ callsign: 'One More' })), 'room_full');
  const { r: r2 } = mk();
  joinN(r2, 3);
  assert.equal(code(() => r2.join({ callsign: 'player 0' })), 'callsign_taken');
  assert.equal(code(() => r2.join({ callsign: '<b>hi</b>' })), 'bad_callsign');
  assert.equal(code(() => r2.join({ callsign: 'x' })), 'bad_callsign');
  const again = r.join({ playerId: ps[5].id, secret: ps[5].secret });
  assert.equal(again.reconnected, true); assert.equal(again.player.crew, ps[5].crew); assert.equal(r.players.size, 40);
  assert.equal(code(() => r.join({ playerId: ps[5].id, secret: 'wrong' })), 'bad_identity');
});

test('lockers: closed in lobby, distance + cooldown checks, question hides the answer', () => {
  const { r, now, msgs } = mk(); const [p] = joinN(r, 2); online(r);
  assert.equal(code(() => r.openLocker(p, 0)), 'wrong_phase');
  startPlay(r, now);
  p.x = 24.5; p.y = 13.5;
  assert.equal(code(() => r.openLocker(p, 0)), 'too_far');
  assert.equal(code(() => r.openLocker(p, 999)), 'bad_locker');
  standAt(p, LOCKERS[3]);
  const q = r.openLocker(p, 3);
  const s = JSON.stringify(q);
  assert.equal('correct' in q.question, false); assert.equal('explanation' in q.question, false);
  for (const qq of STARTER_PACK.questions) assert.equal(s.includes(qq.explanation), false);
  assert.ok(msgs.some((x) => x.to === p.id && x.m.t === 'q'));
  assert.equal(code(() => r.openLocker(p, 3)), 'already_open');
  assert.equal(code(() => r.answer(p, { nonce: 'nope', choice: 0 })), 'stale');
  assert.equal(code(() => r.answer(p, { nonce: p.pending.nonce, choice: 7 })), 'bad_choice');
  const correct = r.qById.get(p.pending.qid).correct; const nonce = p.pending.nonce;
  const res = r.answer(p, { nonce, choice: correct });
  assert.equal(res.correct, true); assert.ok(res.loot); assert.ok(res.explanation.length > 5);
  assert.equal(code(() => r.answer(p, { nonce, choice: correct })), 'stale', 'no double answer');
  assert.equal(p.stats.answered, 1); assert.equal(p.stats.correct, 1);
  assert.equal(code(() => r.openLocker(p, 3)), 'cooldown');
});

test('learning: only correct answers give loot; wrong answers come back later', () => {
  const { r, now } = mk(); const [p] = joinN(r, 1); online(r); startPlay(r, now);
  standAt(p, LOCKERS[0]); r.openLocker(p, 0);
  const qid = p.pending.qid; const q = r.qById.get(qid);
  const res = r.answer(p, { nonce: p.pending.nonce, choice: (q.correct + 1) % 4 });
  assert.equal(res.correct, false); assert.equal(res.loot, null); assert.equal(res.correctIndex, q.correct);
  assert.equal(p.fuses.length, 0);
  assert.ok(p.queue.slice(0, 4).includes(qid), 'missed question re-queued soon');
  let got = 0;
  for (let i = 0; i < 30; i++) { // correct answers: loot every time
    const l = LOCKERS[(i % (LOCKERS.length - 1)) + 1]; standAt(p, l); p.lockerCd.clear(); p.zombieUntil = 0;
    r.openLocker(p, l.id); const qq = r.qById.get(p.pending.qid); const rr = r.answer(p, { nonce: p.pending.nonce, choice: qq.correct });
    assert.ok(rr.loot); got++; p.fuses = [];
  }
  assert.equal(got, 30);
  assert.equal(r.qstats.get(qid).n >= 1, true);
});

test('movement is validated: no teleporting, no walking through walls', () => {
  const { r, now } = mk(); const [p] = joinN(r, 1); online(r); startPlay(r, now);
  p.x = 24.5; p.y = 13.5; now.add(100);
  assert.equal(r.updatePos(p, { x: 24.8, y: 13.5, dir: 1, moving: true }), null);
  now.add(100);
  assert.deepEqual(r.updatePos(p, { x: 35, y: 13.5 }), { x: 24.8, y: 13.5 }, 'teleport corrected');
  now.add(100);
  assert.ok(r.updatePos(p, { x: 24.8, y: 11.0 }), 'into the wall/fence corrected');
  assert.ok(r.updatePos(p, { x: NaN, y: 1 }));
});

test('zombie tag: drops fuses, shield blocks, tagged player passes it to another crew only', () => {
  const { r, now } = mk(); const ps = joinN(r, 4); online(r); startPlay(r, now);
  run(r, now, 6500); // spawn protection ends
  const [a, b, c] = ps; // crews 0,1,2
  for (const p of ps) { p.x = 5 + p.num * 4; p.y = 13.5; }
  a.fuses = [1, 2];
  const z = r.zombies[0]; z.x = a.x; z.y = a.y; z.stunUntil = 0; r.event = null;
  r.tickTags();
  assert.ok(r.isZombie(a)); assert.equal(a.fuses.length, 0); assert.equal(r.loose.length, 2);
  // shield
  b.shieldUntil = r.gt + 10000; const z2 = r.zombies[1]; z2.x = b.x; z2.y = b.y; z2.stunUntil = 0;
  r.tickTags(); assert.equal(r.isZombie(b), false); assert.equal(b.shieldUntil, 0);
  // zombified a tags c (different crew): a cured, c zombified
  for (const zz of r.zombies) { zz.x = 40; zz.y = 26; }
  c.x = a.x + 0.3; c.y = a.y; c.invulnUntil = 0;
  r.tickTags();
  assert.equal(r.isZombie(a), false); assert.ok(r.isZombie(c)); assert.equal(a.stats.cures, 1);
  // same crew: no tag
  const d = ps[3]; const mate = r.join({ callsign: 'Mate' }).player; online(r);
  mate.crew = d.crew; mate.x = d.x; mate.y = d.y; mate.zombieUntil = r.gt + 5000; d.invulnUntil = 0;
  r.tickTags(); assert.equal(r.isZombie(d), false);
});

test('delivering fuses scores for the crew; final minute counts double', () => {
  const { r, now, msgs } = mk({ settings: { minutes: 3 } }); const [p] = joinN(r, 1); online(r); startPlay(r, now);
  for (const z of r.zombies) z.stunUntil = 1e12;
  p.fuses = [1, 2]; p.x = GENERATOR.x; p.y = GENERATOR.y + 1.4;
  r.tickItems();
  assert.equal(r.scores[p.crew], 3); assert.equal(p.fuses.length, 0); assert.equal(p.stats.delivered, 3);
  assert.ok(msgs.some((m) => m.m.t === 'fx' && m.m.k === 'deliver'));
  run(r, now, 2 * 60_000 + 200);
  assert.equal(r.overtime, true);
  online(r); p.fuses = [1]; p.zombieUntil = 0; p.x = GENERATOR.x; p.y = GENERATOR.y + 1.4; r.tickItems();
  assert.equal(r.scores[p.crew], 5);
});

test('host controls: pause freezes time, +1 min, end shows results, reset clears scores', () => {
  const { r, now } = mk(); const ps = joinN(r, 3); online(r);
  assert.equal(code(() => r.hostAction('end')), 'wrong_phase');
  assert.equal(code(() => r.hostAction('fly')), 'bad_action');
  startPlay(r, now);
  assert.equal(code(() => r.hostAction('start')), 'wrong_phase');
  const left = r.endsAt - r.gt;
  r.hostAction('pause'); run(r, now, 30_000);
  assert.equal(r.endsAt - r.gt, left, 'paused');
  standAt(ps[0], LOCKERS[0]); assert.equal(code(() => r.openLocker(ps[0], 0)), 'paused');
  r.hostAction('resume'); r.hostAction('addtime');
  assert.ok(r.endsAt - r.gt > left + 50_000);
  r.scores[1] = 7; r.hostAction('end');
  assert.equal(r.phase, 'results'); assert.equal(r.results.crews[0].crew, 1);
  assert.equal(JSON.stringify(r.publicResults()).includes('explanation'), false, 'public results hide review answers');
  r.hostAction('reset');
  assert.equal(r.phase, 'lobby'); assert.deepEqual(r.scores, [0, 0, 0, 0]); assert.equal(r.players.size, 3);
});

test('snapshots and roster never contain secrets or answers', () => {
  const { r, now } = mk(); const [p] = joinN(r, 2); online(r); startPlay(r, now);
  standAt(p, LOCKERS[2]); r.openLocker(p, 2);
  const s = JSON.stringify(r.snapshot()) + JSON.stringify(r.roster()) + JSON.stringify(r.hostStats());
  assert.equal(s.includes(r.hostToken), false); assert.equal(s.includes(p.secret), false); assert.equal(s.includes(p.pending.nonce), false);
  for (const q of STARTER_PACK.questions) assert.equal(s.includes(q.explanation), false);
});

test('running game keeps its own frozen pack copy', () => {
  const pack = JSON.parse(JSON.stringify(STARTER_PACK));
  const r = new Room({ code: 'SNAP1', pack });
  pack.questions[0].prompt = 'CHANGED'; pack.questions.length = 1;
  assert.notEqual(r.pack.questions[0].prompt, 'CHANGED'); assert.equal(r.pack.questions.length, 12);
  assert.ok(Object.isFrozen(r.pack.questions[0]));
});

test('surprise events happen during a game; DEMO bots play a full game to results', () => {
  const { r, now, msgs } = mk({ demoBots: 12, settings: { minutes: 4 } });
  r.hostAction('start');
  run(r, now, 4 * 60_000 + 5000, 50);
  assert.equal(r.phase, 'results');
  const kinds = new Set(msgs.filter((m) => m.m.t === 'event' && m.m.kind).map((m) => m.m.kind));
  assert.ok(kinds.size >= 2, `events seen: ${[...kinds]}`);
  assert.ok(r.results.answers > 20, `bots answered ${r.results.answers}`);
  assert.ok(r.scores.reduce((a, b) => a + b, 0) > 5, `scores ${r.scores}`);
  assert.ok(msgs.some((m) => m.m.t === 'fx' && m.m.k === 'tag'), 'zombies tagged someone');
});

test('modes: solo scores per player, 2 crews only use two crews, lobby switch rebalances', () => {
  const { r, now } = mk({ settings: { teams: 2 } }); const ps = joinN(r, 6); online(r);
  assert.deepEqual([...new Set(ps.map((p) => p.crew))].sort(), [0, 1]);
  r.hostAction('settings', { teams: 0 });
  assert.equal(r.solo, true);
  r.hostAction('settings', { teams: 3, goal: 30, minutes: 6 });
  assert.deepEqual([0, 1, 2].map((c) => r.crewSize(c)), [2, 2, 2]); assert.equal(r.settings.goal, 30);
  r.hostAction('settings', { teams: 99, goal: 7 }); assert.equal(r.settings.teams, 4); assert.equal(r.settings.goal, 0, 'invalid values fall back');
  r.hostAction('settings', { teams: 0 });
  startPlay(r, now);
  assert.equal(code(() => r.hostAction('settings', { teams: 4 })), 'wrong_phase');
  for (const z of r.zombies) z.stunUntil = 1e12;
  const [a, b] = ps; a.fuses = [1, 1]; a.x = GENERATOR.x; a.y = GENERATOR.y + 1.4; r.tickItems();
  assert.equal(a.score, 2); assert.deepEqual(r.scores, [0, 0, 0, 0], 'solo does not add crew score');
  // solo tag can hit a same-colour player
  run(r, now, 6500); online(r); for (const z of r.zombies) { z.x = 40; z.y = 26; }
  b.crew = a.crew; a.zombieUntil = r.gt + 5000; b.x = a.x + 0.2; b.y = a.y; b.invulnUntil = 0; r.tickTags();
  assert.ok(r.isZombie(b));
  r.hostAction('end');
  assert.equal(r.results.mode, 0); assert.equal(r.results.top[0].n, a.num); assert.equal(r.results.crews.length, 0);
});

test('goal mode ends the game when a crew reaches the goal', () => {
  const { r, now } = mk({ settings: { goal: 20 } }); const [p] = joinN(r, 2); online(r); startPlay(r, now);
  for (const z of r.zombies) z.stunUntil = 1e12;
  r.scores[p.crew] = 18; p.fuses = [2]; p.x = GENERATOR.x; p.y = GENERATOR.y + 1.4; r.tickItems();
  assert.equal(r.phase, 'results'); assert.equal(r.results.crews[0].crew, p.crew);
});

test('power meter drains while exploring, answers refill it, empty meter = sleepy + slow', () => {
  const { r, now } = mk(); const [p] = joinN(r, 1); online(r); startPlay(r, now);
  for (const z of r.zombies) z.stunUntil = 1e12;
  assert.ok(p.energy > 99, 'starts full');
  for (let i = 0; i < 80; i++) { run(r, now, 1000, 100); online(r); }
  assert.equal(p.energy, 0); assert.ok(r.speedOf(p) < 3, 'sleepy is slow');
  assert.ok(r.snapshot().p.find((x) => x[0] === p.num)[3] & 256, 'sleepy flag in snapshot');
  standAt(p, LOCKERS[1]); p.invulnUntil = 1e12; r.openLocker(p, 1);
  const before = r.snapshot(); void before;
  run(r, now, 5000, 100); online(r);
  assert.equal(p.energy, 0, 'no drain while answering');
  const q = r.qById.get(p.pending.qid); r.answer(p, { nonce: p.pending.nonce, choice: q.correct });
  assert.equal(p.energy, 45); assert.ok(r.speedOf(p) > 4);
});

test('teacher view lists who has not answered; host stats count them without names', () => {
  const { r, now } = mk(); const ps = joinN(r, 3); online(r); startPlay(r, now);
  for (const z of r.zombies) z.stunUntil = 1e12;
  standAt(ps[0], LOCKERS[0]); r.openLocker(ps[0], 0); const q = r.qById.get(ps[0].pending.qid); r.answer(ps[0], { nonce: ps[0].pending.nonce, choice: q.correct });
  for (let i = 0; i < 65; i++) { run(r, now, 1000, 100); online(r); }
  const st = r.hostStats();
  assert.equal(st.idle, 3); assert.equal(JSON.stringify(st).includes(ps[1].callsign), false, 'projector stats have no names');
  const tv = r.teacherView();
  assert.equal(tv.players.length, 3); assert.ok(tv.players.find((x) => x.name === ps[0].callsign).answered === 1);
  assert.equal(JSON.stringify(tv).includes(ps[0].secret), false);
  assert.ok(r.viewToken && r.viewToken !== r.hostToken);
});
