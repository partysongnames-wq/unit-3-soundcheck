// Unit tests: world, packs and the real-time game engine. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, GameError, MAX_PLAYERS } from '../src/game.mjs';
import { STARTER_PACK, GENERIC_PACK, validatePack, importSpreadsheet, validateImage } from '../public/js/shared/packs.js';
import { LOCKERS, GENERATOR, SPAWNS, ZOMBIE_SPAWNS, walkableTiles, path, collides, lockerStand, isWalkableTile, zoneCenter, inZone, ROOM_OF, WORD_DESK, KITTEN_SPAWNS } from '../public/js/shared/world.js';
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
  const [sx, sy] = SPAWNS[0];
  const unreachable = all.filter(([x, y]) => !(x === Math.floor(sx) && y === Math.floor(sy)) && path(sx, sy, x, y) === null);
  assert.equal(unreachable.length, 0);
  assert.ok(LOCKERS.length >= 16);
  for (const l of LOCKERS) { const s = lockerStand(l); assert.ok(s, `locker ${l.id} has a standing spot`); assert.ok(path(sx, sy, s[0], s[1]) !== null); }
  for (const [x, y] of [...SPAWNS, ...ZOMBIE_SPAWNS]) assert.equal(collides(x, y), false, `spawn ${x},${y}`);
  assert.ok(isWalkableTile(GENERATOR.x, GENERATOR.y + 1) && !collides(GENERATOR.x, GENERATOR.y + 1.4), 'you can stand next to the generator');
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
  p.x = 22.5; p.y = 15.5; now.add(100);
  assert.equal(r.updatePos(p, { x: 22.8, y: 15.5, dir: 1, moving: true }), null);
  now.add(100);
  assert.deepEqual(r.updatePos(p, { x: 35, y: 15.5 }), { x: 22.8, y: 15.5 }, 'teleport corrected');
  now.add(500);
  assert.ok(collides(24.5, 12.5));
  assert.ok(r.updatePos(p, { x: 24.5, y: 12.5 }), 'walking into the generator corrected');
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

test('night falls twice for 30 s (warning first), zombies get faster, correct answers give a bonus fuse', () => {
  const { r, now, msgs } = mk({ settings: { minutes: 6 } }); const [p] = joinN(r, 2); online(r); startPlay(r, now);
  assert.equal(r.nights.length, 2);
  const first = r.nights[0] - r.gt; assert.ok(Math.abs(first - 0.35 * 6 * 60_000) < 200, `first night at ${first} ms`);
  const tick = (ms) => { for (let t = 0; t < ms; t += 100) { now.add(100); r.tick(); online(r); } };
  tick(first - 4000);
  assert.ok(msgs.some((m) => m.m.t === 'night' && m.m.stage === 'warn'), 'warning before night');
  assert.equal(r.night, null);
  tick(4500);
  assert.ok(r.night, 'night has started'); assert.ok(r.snapshot().nt > 25_000);
  assert.equal(r.event, null, 'no other event during the night');
  for (const z of r.zombies) z.stunUntil = 1e12;
  p.fuses = []; standAt(p, LOCKERS[5]); p.lockerCd.clear(); p.zombieUntil = 0; r.openLocker(p, 5);
  const q = r.qById.get(p.pending.qid); const res = r.answer(p, { nonce: p.pending.nonce, choice: q.correct });
  assert.equal(res.loot.moon, true, 'night bonus'); assert.ok(p.fuses.length >= 1);
  tick(30_500);
  assert.equal(r.night, null); assert.ok(msgs.some((m) => m.m.t === 'night' && m.m.stage === 'end'));
  tick(r.nights[0] - r.gt + 500);
  assert.ok(r.night, 'second night'); assert.equal(r.nights.length, 0);
});

test('night time can be switched off by the teacher', () => {
  const { r, now } = mk({ settings: { night: false } }); joinN(r, 1); online(r);
  assert.equal(r.settings.night, false);
  r.hostAction('settings', { night: true }); assert.equal(r.settings.night, true);
  r.hostAction('settings', { night: false });
  startPlay(r, now); assert.equal(r.nights.length, 0);
});

test('short games get one night; nights never run back-to-back', () => {
  const { r, now } = mk({ settings: { minutes: 1 } }); joinN(r, 1); online(r); startPlay(r, now);
  assert.equal(r.nights.length, 1);
  const { r: r2, now: n2 } = mk({ settings: { minutes: 3 } }); joinN(r2, 1); online(r2); startPlay(r2, n2);
  r2.nights[1] = r2.nights[0] + 31_000; // pretend the second night was scheduled right after the first
  const until = r2.nights[0] - r2.gt + 31_000;
  for (let t = 0; t < until; t += 100) { n2.add(100); r2.tick(); online(r2); }
  assert.equal(r2.night, null, 'morning'); assert.equal(r2.nights.length, 0, 'back-to-back night dropped');
});

test('timetable events: lunch in the canteen, PE in the gym, karaoke on the stage, garden keeps zombies out, pop-quiz lockers', () => {
  const { r, now, msgs } = mk({ settings: { night: false } }); const ps = joinN(r, 4); online(r); startPlay(r, now);
  const step = (ms) => { for (let t = 0; t < ms; t += 100) { now.add(100); r.tick(); online(r); } };
  for (const z of r.zombies) z.stunUntil = 1e12;
  const [a, b, c2, d] = ps;
  // lunch
  r.startEvent('lunch'); a.energy = 10; [a.x, a.y] = zoneCenter('lunch'); a.y += 0.5; step(200);
  assert.equal(Math.round(a.energy), 100); assert.ok(a.bootsUntil > r.gt); assert.ok(msgs.some((m) => m.m.k === 'snack'));
  const e1 = a.energy; step(200); assert.ok(r.event.claimed.has(a.id) && a.energy <= e1, 'only once per lunch');
  // PE: 2 s in the gym
  r.startEvent('pe'); [b.x, b.y] = zoneCenter('pe'); b.bootsUntil = 0; step(1000); assert.equal(b.bootsUntil > r.gt, false);
  step(1300); assert.ok(b.bootsUntil > r.gt + 5000, 'boots after a lap');
  // karaoke: stage points, max 4 per player
  r.startEvent('karaoke'); const before = r.scores[c2.crew]; c2.x = 37.5; c2.y = 15.2; step(14_000);
  assert.equal(r.scores[c2.crew] - before, 4, 'sang 4 points max'); assert.ok(msgs.some((m) => m.m.k === 'sing'));
  // garden: zombies kept out, zombified players recover faster
  r.startEvent('garden'); for (const z of r.zombies) z.stunUntil = 0;
  [d.x, d.y] = zoneCenter('garden'); d.zombieUntil = r.gt + 8000; d.invulnUntil = 1e12;
  const z0 = r.zombies[0]; z0.x = 13.5; z0.y = 19.0; step(2600);
  assert.ok(r.zombies.every((z) => !inZone('garden', z.x, z.y)), 'no zombie inside the garden');
  assert.ok(d.zombieUntil - r.gt < 8000 - 2600 - 2000, 'recovers faster in the garden');
  // pop quiz: English/Thai lockers double fuses
  r.startEvent('quiz'); for (const z of r.zombies) z.stunUntil = 1e12;
  const L = LOCKERS.find((l) => ROOM_OF[l.ty][l.tx] === 'ENG'); standAt(a, L); a.lockerCd.clear(); a.zombieUntil = 0; a.fuses = [];
  r.rng = () => 0.01; // first loot-table entry = fuse
  r.openLocker(a, L.id); const q = r.qById.get(a.pending.qid); const res = r.answer(a, { nonce: a.pending.nonce, choice: q.correct });
  assert.equal(res.loot.item, 'fuse'); assert.equal(res.loot.golden, true); assert.equal(a.fuses[0], 2, 'double fuse in pop quiz room');
});

test('happiness: rises with answers/rooms, decays, and 70+ gives a bonus point at the generator', () => {
  const { r, now } = mk({ settings: { night: false } }); const [p] = joinN(r, 1); online(r); startPlay(r, now);
  for (const z of r.zombies) z.stunUntil = 1e12;
  p.happy = 80; p.fuses = [1]; p.x = GENERATOR.x; p.y = GENERATOR.y + 1.4; r.tickItems();
  assert.equal(r.scores[p.crew], 2, '1 fuse + 1 happy bonus');
  p.happy = 30; p.fuses = [1]; r.tickItems(); assert.equal(r.scores[p.crew], 3, 'no bonus when not happy');
  const h0 = p.happy; for (let t = 0; t < 10_000; t += 100) { now.add(100); r.tick(); online(r); } assert.ok(p.happy < h0, 'decays');
  assert.equal(r.snapshot().p[0][8], Math.round(p.happy), 'happiness in snapshot');
});

test('kittens: need cat food, give crew points + happiness, then nap and follow you; rules are checked', () => {
  const { r, now, msgs } = mk({ settings: { night: false } }); const [p, q] = joinN(r, 2); online(r);
  assert.equal(code(() => r.feedKitten(p, 0)), 'wrong_phase');
  startPlay(r, now); for (const z of r.zombies) z.stunUntil = 1e12;
  assert.equal(r.kittens.length, 4); assert.ok(r.snapshot().k.length === 4);
  const k = r.kittens[0]; p.x = k.x + 0.5; p.y = k.y; k.route = []; k.repathAt = 1e12;
  assert.equal(code(() => r.feedKitten(p, 0)), 'no_food');
  p.catFood = 2; q.x = 40; q.y = 26;
  const before = r.scores[p.crew]; r.feedKitten(p, 0);
  assert.equal(r.scores[p.crew] - before, 2); assert.equal(p.catFood, 1); assert.equal(p.stats.fed, 1);
  assert.ok(msgs.some((m) => m.m.k === 'purr'));
  assert.equal(code(() => r.feedKitten(p, 0)), 'napping', 'kitten naps after eating');
  assert.ok(r.kittens[0].follow && r.kittens[0].follow.id === p.id, 'kitten follows the feeder');
  p.x = 2.5; p.y = 7.5; for (let t = 0; t < 4000; t += 100) { now.add(100); r.tick(); online(r); }
  assert.equal(code(() => r.feedKitten(p, 3)), 'too_far');
  assert.equal(code(() => r.feedKitten(p, 99)), 'bad_kitten');
  p.zombieUntil = r.gt + 5000; assert.equal(code(() => r.feedKitten(p, 1)), 'zombified');
  // cat food can drop from lockers
  p.zombieUntil = 0; p.catFood = 0; let got = false;
  for (let i = 0; i < 40 && !got; i++) { const L = LOCKERS[i % LOCKERS.length]; standAt(p, L); p.lockerCd.clear(); p.fuses = []; r.openLocker(p, L.id); const qq = r.qById.get(p.pending.qid); const res = r.answer(p, { nonce: p.pending.nonce, choice: qq.correct }); if (res.loot.item === 'catfood') got = true; }
  assert.ok(got && p.catFood >= 1, 'cat food appears as locker loot');
});

test('Word Builder: at the English desk, 3 vocab words, points for correct spelling, stale/duplicate rejected, cooldown', () => {
  const { r, now } = mk({ settings: { night: false } }); const [p] = joinN(r, 1); online(r); startPlay(r, now);
  for (const z of r.zombies) z.stunUntil = 1e12;
  p.x = 22; p.y = 15.5; assert.equal(code(() => r.openWordGame(p)), 'too_far');
  p.x = WORD_DESK.x; p.y = WORD_DESK.y - 1.0;
  const m = r.openWordGame(p);
  assert.equal(m.items.length, 3); assert.ok(m.items.every((it) => it.clue && it.letters.length === it.len));
  assert.equal(JSON.stringify(m).includes(p.wb.words[0]) && m.items[0].letters.join('') === p.wb.words[0], false, 'the answer is not sent unscrambled');
  assert.ok(r.snapshot().p[0][3] & 32, 'busy while spelling'); assert.equal(code(() => r.openLocker(p, 0)), 'already_open');
  const before = r.scores[p.crew];
  assert.equal(code(() => r.wordAnswer(p, { nonce: 'nope', i: 0, word: 'x' })), 'stale');
  assert.equal(r.wordAnswer(p, { nonce: m.nonce, i: 0, word: p.wb.words[0].toUpperCase() }).ok, true, 'case-insensitive');
  assert.equal(code(() => r.wordAnswer(p, { nonce: m.nonce, i: 0, word: p.wb.words[0] })), 'already_answered');
  const wrong = r.wordAnswer(p, { nonce: m.nonce, i: 1, word: 'zzzz' }); assert.equal(wrong.ok, false); assert.ok(wrong.answer.length >= 3, 'shows the right spelling');
  r.wordAnswer(p, { nonce: m.nonce, i: 2, word: p.wb.words[2] });
  assert.equal(p.wb, null, 'round ends after 3 words'); assert.equal(r.scores[p.crew] - before, 2);
  assert.equal(code(() => r.openWordGame(p)), 'cooldown');
  // times out if left open
  p.wbCd = 0; r.openWordGame(p); for (let t = 0; t < 26_000; t += 100) { now.add(100); r.tick(); online(r); }
  assert.equal(p.wb, null, 'times out');
});
