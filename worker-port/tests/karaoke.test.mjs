import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, GameError } from '../src/game.mjs';
import { STARTER_PACK } from '../assets/js/shared/packs.js';
import { MIC, SONG_MS } from '../assets/js/shared/karaoke.js';
import { collides, isStage, path } from '../assets/js/shared/world.js';
function setup({ practice = false, count = 1, solo = false } = {}) {
  let clock = 1_000_000; const messages = [];
  const r = new Room({ code: 'KAR01', pack: STARTER_PACK, now: () => clock, practice, settings: { teams: solo ? 0 : 4, minutes: 3, night: false }, out: (to, m) => messages.push({ to, m }) });
  const ps = Array.from({ length: count }, (_, i) => r.join({ callsign: 'Singer ' + i }).player);
  for (const p of ps) { p.connected = true; p.lastSeen = clock; }
  const run = ms => { for (let i = 0; i < ms; i += 50) { clock += 50; for (const p of ps) p.lastSeen = clock; r.tick(); } };
  r.hostAction('start'); run(3600); for (const p of ps) { p.x = MIC.x; p.y = MIC.y; }
  return { r, ps, p: ps[0], run, messages };
}
const error = (fn, code) => assert.throws(fn, e => e instanceof GameError && e.code === code);
function perform(r, p, limit = 52, offset = 0) {
  const s = p.karaoke;
  s.notes.forEach((n, i) => { if (i >= limit) return; r.gt = s.start + n.at + offset; r.karaokeTap(p, { nonce: s.nonce, lane: n.lane, score: 999999, at: -1 }); });
  r.gt = s.start + SONG_MS; r.advanceKaraoke(p);
}

test('microphone is walkable on the south stage and reachable through the lower AV doorway', () => {
  assert.equal(collides(MIC.x, MIC.y), false); assert.equal(isStage(MIC.x, MIC.y), true);
  assert.ok(MIC.y > 14); assert.ok(path(34.5, 13.5, MIC.x, MIC.y));
});

test('stage entry validates proximity, phase, zombies, busy state, pause and remaining match time', () => {
  const { r, p } = setup(); p.x = 37.5; p.y = 3.5; error(() => r.openKaraoke(p), 'too_far');
  p.x = MIC.x; p.y = MIC.y; p.zombieUntil = r.gt + 500; error(() => r.openKaraoke(p), 'zombified'); p.zombieUntil = 0;
  r.paused = true; error(() => r.openKaraoke(p), 'wrong_phase'); r.paused = false;
  p.pending = {}; error(() => r.openKaraoke(p), 'already_open'); p.pending = null;
  r.endsAt = r.gt + SONG_MS + 1999; error(() => r.openKaraoke(p), 'too_late'); assert.equal(p.karaokeAttempted, false);
  r.endsAt++; r.openKaraoke(p); assert.ok(p.karaoke);
});

test('35-second chart has three progressively denser rounds and independent player sessions', () => {
  const { r, ps } = setup({ count: 40 }); for (const p of ps) r.openKaraoke(p);
  assert.equal(new Set(ps.map(p => p.karaoke.nonce)).size, 40);
  for (const p of ps) {
    const notes = p.karaoke.notes; assert.equal(notes.length, 52);
    assert.deepEqual([0, 1, 2].map(round => notes.filter(n => Math.floor((n.at - 3000) / 10000) === round).length), [12, 16, 24]);
    assert.ok(notes.every(n => n.at < SONG_MS - 1000 && n.lane >= 0 && n.lane < 4));
  }
  assert.equal(JSON.stringify(r.snapshot()).includes(ps[0].karaoke.nonce), false);
});

test('server receipt time, lane and nonce determine judgment; forged score and timestamps have no authority', () => {
  const { r, p } = setup(); r.openKaraoke(p); const s = p.karaoke, n = s.notes[0];
  error(() => r.karaokeTap(p, { nonce: 'fake', lane: n.lane }), 'stale');
  error(() => r.karaokeTap(p, { nonce: s.nonce, lane: 4 }), 'bad_lane');
  r.karaokeTap(p, { nonce: s.nonce, lane: n.lane, score: 999999, at: n.at }); assert.equal(s.hits, 0); assert.equal(s.stray, 1);
  r.gt = s.start + n.at; r.karaokeTap(p, { nonce: s.nonce, lane: n.lane, score: 999999 });
  assert.equal(s.hits, 1); assert.equal(s.score, 102); assert.equal(s.judged[0], 'perfect');
  r.karaokeTap(p, { nonce: s.nonce, lane: n.lane }); assert.equal(s.hits, 1);
  r.gt += 100; r.karaokeTap(p, { nonce: s.nonce, lane: n.lane }); assert.equal(s.hits, 1); assert.equal(s.score, 77);
});

test('wrong pad consumes that note and late hits cannot recover a miss', () => {
  const { r, p } = setup(); r.openKaraoke(p); const s = p.karaoke;
  r.gt = s.start + s.notes[0].at; r.karaokeTap(p, { nonce: s.nonce, lane: (s.notes[0].lane + 1) % 4 });
  assert.equal(s.judged[0], 'wrong');
  r.gt = s.start + s.notes[1].at + 321; r.karaokeTap(p, { nonce: s.nonce, lane: s.notes[1].lane });
  assert.equal(s.judged[1], 'miss'); assert.equal(s.hits, 0);
});

test('reward thresholds, solo/team scores and duplicate expiry are exact', () => {
  for (const [hits, points] of [[0, 0], [23, 0], [24, 2], [36, 2], [37, 3], [46, 3], [47, 4], [52, 4]]) {
    for (const solo of [true, false]) {
      const { r, p } = setup({ solo }); r.openKaraoke(p); const nonce = p.karaoke.nonce; perform(r, p, hits);
      assert.equal(p.karaokeResult.points, points, String(hits)); assert.equal(solo ? p.score : r.scores[p.crew], points);
      r.endKaraoke(p); r.advanceKaraoke(p); assert.equal(p.stats.delivered, points);
      error(() => r.karaokeTap(p, { nonce, lane: 0 }), 'stale'); error(() => r.openKaraoke(p), 'attempted');
    }
  }
});

test('all forty players can complete independent songs with only their own rewards', () => {
  const { r, ps } = setup({ count: 40 }); ps.forEach(p => r.openKaraoke(p));
  const start = ps[0].karaoke.start;
  for (let i = 0; i < 52; i++) { r.gt = start + ps[0].karaoke.notes[i].at; for (const p of ps) r.karaokeTap(p, { nonce: p.karaoke.nonce, lane: p.karaoke.notes[i].lane }); }
  r.gt = start + SONG_MS; ps.forEach(p => r.advanceKaraoke(p));
  assert.deepEqual(r.scores, [40, 40, 40, 40]); assert.ok(ps.every(p => p.karaokeResult.accuracy === 100));
});

test('approach protection expires once; singers are safe; zombies still tag other players', () => {
  const { r, ps, run } = setup({ count: 2 }); const [p, other] = ps;
  p.invulnUntil = other.invulnUntil = 0; assert.equal(r.karaokeSafe(p), true);
  r.gt += 8000; assert.equal(r.karaokeSafe(p), false); p.y = 11; r.karaokeSafe(p); p.y = MIC.y; assert.equal(r.karaokeSafe(p), false);
  r.openKaraoke(p); const z = r.zombies[0]; z.x = p.x; z.y = p.y; z.stunUntil = 0; r.tickTags(); assert.equal(r.isZombie(p), false);
  other.x = z.x = 30.5; other.y = z.y = 18.5; r.tickTags(); assert.equal(r.isZombie(other), true);
  r.endKaraoke(p); assert.ok(p.invulnUntil >= r.gt + 3000); const until = p.invulnUntil; r.endKaraoke(p); assert.equal(p.invulnUntil, until);
});

test('disconnect keeps the song clock, reconnect state and consumed attempt; abandoned songs expire', () => {
  const { r, p, run } = setup(); r.openKaraoke(p); const nonce = p.karaoke.nonce;
  p.connected = false; run(10000); assert.equal(r.karaokeState(p).nonce, nonce); assert.ok(p.karaoke.judged.includes('miss'));
  const again = r.join({ playerId: p.id, secret: p.secret }); assert.equal(again.reconnected, true);
  run(26000); assert.equal(p.karaoke, null); assert.equal(p.karaokeResult.points, 0); error(() => r.openKaraoke(p), 'attempted');
});

test('pause freezes main and song clocks; match end cancels without reward; reset clears attempts', () => {
  const { r, p, run } = setup(); r.openKaraoke(p); const before = r.gt;
  r.hostAction('pause'); run(4000); assert.equal(r.gt, before); assert.equal(r.karaokeState(p).elapsed, 0);
  r.karaokeTap(p, { nonce: p.karaoke.nonce, lane: 0 }); assert.equal(p.karaoke.stray, 0);
  r.hostAction('resume'); r.hostAction('end'); assert.equal(p.karaokeResult.reason, 'ended'); assert.equal(p.karaokeResult.points, 0);
  r.hostAction('reset'); assert.equal(p.karaokeAttempted, false); assert.equal(p.karaokeResult, null);
});

test('practice rooms spawn at stage, allow repeats, prevent tags, and never award karaoke rewards', () => {
  const { r, p } = setup({ practice: true }); assert.equal(p.x, MIC.x); assert.equal(p.y, MIC.y);
  for (let i = 0; i < 2; i++) { r.openKaraoke(p); perform(r, p); assert.equal(p.karaokeResult.accuracy, 100); assert.equal(p.karaokeResult.points, 0); }
  assert.equal(r.scores[p.crew], 0); r.zombies[0].x = p.x; r.zombies[0].y = p.y; r.zombies[0].stunUntil = 0; r.tickTags(); assert.equal(r.isZombie(p), false);
  r.hostAction('reset'); r.hostAction('settings', { practice: false }); assert.equal(r.practice, true);
});

test('passive Karaoke Hour camping awards no points; normal game continues while singing', () => {
  const { r, p, run } = setup(); r.startEvent('karaoke'); run(7000); assert.equal(r.scores[p.crew], 0);
  r.openKaraoke(p); const before = r.endsAt - r.gt; run(5000); assert.equal(r.endsAt - r.gt, before - 5000);
  assert.deepEqual(r.updatePos(p, { x: p.x + .5, y: p.y, dir: 1, moving: true }), { x: p.x, y: p.y });
});


test('karaoke rewards respect the existing score goal and end other active songs', () => {
  const { r, ps } = setup({ count: 2 }); const [p, other] = ps;
  r.settings.goal = 20; r.scores[p.crew] = 18;
  r.openKaraoke(p); r.openKaraoke(other); perform(r, p);
  assert.equal(r.phase, 'results'); assert.equal(r.scores[p.crew], 22);
  assert.equal(other.karaoke, null); assert.equal(other.karaokeResult.reason, 'ended');
  assert.equal(other.karaokeResult.points, 0);
});

test('Durable Object storage restore preserves attempt, chart, judgments and expired result', async () => {
  const { GameRoom } = await import('../src/worker.mjs');
  const { r, p } = setup(); r.openKaraoke(p);
  const note = p.karaoke.notes[0]; r.gt = p.karaoke.start + note.at;
  r.karaokeTap(p, { nonce: p.karaoke.nonce, lane: note.lane });
  const nonce = p.karaoke.nonce;
  const original = new GameRoom({}); original.room = r;
  const stored = structuredClone(original.state()); stored.lastTick = Date.now() - SONG_MS;
  const restoredObject = new GameRoom({ storage: { async get() { return stored; } }, getWebSockets() { return []; } });
  const restored = await restoredObject.load(); const singer = restored.players.get(p.id);
  assert.equal(singer.karaoke.nonce, nonce); assert.equal(singer.karaoke.hits, 1); assert.equal(singer.karaokeAttempted, true);
  restored.advanceKaraoke(singer);
  assert.equal(singer.karaoke, null); assert.equal(singer.karaokeResult.hits, 1); assert.equal(singer.karaokeResult.points, 0);
  assert.equal(restored.byNum.get(p.num), singer);
});
