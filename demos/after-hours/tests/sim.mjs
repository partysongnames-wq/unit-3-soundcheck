// SIMULATED classroom load test: N automated HTTP clients (NOT real student devices).
// Usage: node tests/sim.mjs 20     (or 40)
// Each client long-polls like a phone, answers with ~85% accuracy after a random delay,
// votes with a simple crew strategy, and some clients disconnect + reconnect mid-mission.
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { STARTER_PACK } from '../public/js/shared/packs.js';
import { pickOption } from './helpers.mjs';

const N = Number(process.argv[2] || 20);
const ACC = Number(process.env.SIM_ACCURACY || 0.85);
const CONNECTED_MS = 2500; // shortened "disconnected" threshold so the simulation runs quickly
const server = createServer({ port: 0, log: () => {}, connectedMs: CONNECTED_MS, pollWaitMs: 1500 });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const stats = { requests: 0, ok: 0, rejected: {}, serverErrors: 0, answerMs: [], voteMs: [] };

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  stats.requests++;
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (res.status >= 500) stats.serverErrors++;
  if (res.ok) stats.ok++; else stats.rejected[data?.error || res.status] = (stats.rejected[data?.error || res.status] || 0) + 1;
  return { status: res.status, data };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

class Client {
  constructor(i) { this.i = i; this.callsign = `Sim ${String(i).padStart(2, '0')}`; this.online = true; this.answered = new Set(); this.voted = new Set(); this.v = null; this.version = 0; }
  get H() { return { 'X-Player-Id': this.id, 'X-Player-Secret': this.secret }; }
  async join(code) {
    this.code = code;
    const r = await call(`/api/rooms/${code}/join`, { method: 'POST', body: { callsign: this.callsign } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    Object.assign(this, { id: r.data.playerId, secret: r.data.secret, crew: r.data.crew });
  }
  async reconnect() {
    const r = await call(`/api/rooms/${this.code}/join`, { method: 'POST', body: { playerId: this.id, secret: this.secret } });
    assert.equal(r.status, 200); assert.equal(r.data.playerId, this.id, 'same identity'); assert.equal(r.data.crew, this.crew, 'same crew');
    this.reconnects = (this.reconnects || 0) + 1; this.online = true; this.version = 0;
  }
  async run(stopFlag) {
    while (!stopFlag.stop) {
      if (!this.online) { await sleep(200); continue; }
      const r = await call(`/api/rooms/${this.code}/state?since=${this.version}`, { headers: this.H });
      if (r.status !== 200) { await sleep(300); continue; }
      this.v = r.data; this.version = r.data.version;
      this.act(r.data);
    }
  }
  act(v) {
    if (v.paused) return;
    if (v.phase === 'question' && !this.answered.has(v.roundId) && v.me.answer === null) {
      this.answered.add(v.roundId);
      const rid = v.roundId;
      setTimeout(async () => {
        if (!this.online) { this.answered.delete(rid); return; }
        // pick correct with probability ACC — the client does not know the answer, so the harness reads it from the pack
        const q = STARTER_PACK.questions[v.roundIndex]; const choice = Math.random() < ACC ? q.correct : (q.correct + 1 + Math.floor(Math.random() * 3)) % 4;
        const t = performance.now();
        const res = await call(`/api/rooms/${this.code}/answer`, { method: 'POST', headers: this.H, body: { roundId: rid, choice } });
        stats.answerMs.push(performance.now() - t);
        if (res.status === 200 && Math.random() < 0.1) { // occasional double-tap / stale resend
          const d = await call(`/api/rooms/${this.code}/answer`, { method: 'POST', headers: this.H, body: { roundId: rid, choice: (choice + 1) % 4 } });
          assert.equal(d.status, 409);
        }
      }, rnd(300, 2500));
    }
    if (v.phase === 'vote' && !this.voted.has(v.roundId) && v.crews[this.crew].active) {
      this.voted.add(v.roundId);
      const rid = v.roundId;
      setTimeout(async () => {
        if (!this.online) return;
        const o = pickOption(v, this.crew); if (!o) return;
        const t = performance.now();
        await call(`/api/rooms/${this.code}/vote`, { method: 'POST', headers: this.H, body: { roundId: rid, option: o.id } });
        stats.voteMs.push(performance.now() - t);
      }, rnd(200, 1500));
    }
  }
}

const t0 = performance.now();
const created = await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK, settings: { questionSeconds: 20, voteSeconds: 12 } } });
const { code, hostToken } = created.data; const HH = { 'X-Host-Token': hostToken };
const host = async (a) => { const r = await call(`/api/rooms/${code}/host/${a}`, { method: 'POST', headers: HH, body: {} }); return r; };
const hostState = async () => (await call(`/api/rooms/${code}/state?since=0`, { headers: HH })).data;

const lateCount = N >= 4 ? 2 : 0;
const clients = Array.from({ length: N }, (_, i) => new Client(i));
await Promise.all(clients.slice(0, N - lateCount).map((c) => c.join(code))); // simultaneous joins
const flag = { stop: false };
const loops = clients.slice(0, N - lateCount).map((c) => c.run(flag));
let s = await hostState();
assert.equal(s.playerCount, N - lateCount);
const crewSizes = s.crews.map((c) => c.members);
assert.ok(Math.max(...crewSizes) - Math.min(...crewSizes) <= 1, `balanced crews ${crewSizes}`);
assert.equal((await host('start')).status, 200);

const timeline = [];
const dropped = clients.slice(0, 3);
let round = -1;
const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  s = await hostState();
  if (s.roundIndex !== round && s.phase === 'question') {
    round = s.roundIndex;
    if (round === 2 && lateCount) { // late joiners arrive mid-question
      await Promise.all(clients.slice(N - lateCount).map((c) => c.join(code)));
      loops.push(...clients.slice(N - lateCount).map((c) => c.run(flag)));
    }
    if (round === 4) dropped.forEach((c) => { c.online = false; });       // three phones lose Wi-Fi
    if (round === 6) await Promise.all(dropped.map((c) => c.reconnect())); // and come back with the same identity
  }
  if (s.phase === 'reveal') {
    timeline.push({ q: s.roundIndex + 1, answered: `${s.reveal.classCounted} counted`, correct: s.reveal.classCorrect, crews: s.reveal.crews.map((c) => c.accuracy === null ? '-' : Math.round(c.accuracy * 100) + '%').join('/') });
    await sleep(150); await host('next');
  } else if (s.phase === 'resolve') { await sleep(100); await host('next'); }
  else if (s.phase === 'extraction') { await host('next'); }
  else if (s.phase === 'debrief') break;
  else await sleep(150);
}
s = await hostState();
assert.equal(s.phase, 'debrief', 'mission reached debrief');
const summary = s.summary;
const missionSec = ((performance.now() - t0) / 1000).toFixed(1);

// Reset and replay start: crews kept, old round ids rejected
const oldRound = clients[0].v.roundId;
assert.equal((await host('reset')).status, 200);
const afterReset = await hostState();
assert.equal(afterReset.phase, 'lobby'); assert.equal(afterReset.playerCount, N);
assert.equal((await host('start')).status, 200);
const stale = await call(`/api/rooms/${code}/answer`, { method: 'POST', headers: clients[0].H, body: { roundId: oldRound, choice: 0 } });
assert.equal(stale.status, 409);
await host('end'); await host('next');
assert.equal((await hostState()).phase, 'debrief');
flag.stop = true;
await Promise.race([Promise.all(loops), sleep(3000)]);
server.closeAllConnections?.(); server.close();

const pct = (a, p) => { const s2 = a.slice().sort((x, y) => x - y); return s2.length ? s2[Math.min(s2.length - 1, Math.floor(p * s2.length))].toFixed(1) : '-'; };
console.log(`\n=== SIMULATED ${N}-client run (automated HTTP clients, NOT real student devices) ===`);
console.table(timeline);
console.log({
  clients: N, lateJoiners: lateCount, disconnectedThenReconnected: dropped.length,
  reconnectsSameIdentity: dropped.filter((c) => c.reconnects === 1).length,
  outcome: summary.outcome, stars: summary.stars, power: summary.power, fuses: `${summary.installed}/${summary.needed}`,
  crewsAtGate: `${summary.atGate}/${summary.activeCrews}`, classAccuracy: `${Math.round(summary.classAccuracy * 100)}%`,
  roundsPlayed: summary.roundsPlayed, missionSeconds: Number(missionSec),
  requests: stats.requests, ok: stats.ok, rejected: stats.rejected, serverErrors: stats.serverErrors,
  answerLatencyMs: { p50: pct(stats.answerMs, 0.5), p95: pct(stats.answerMs, 0.95), n: stats.answerMs.length },
  voteLatencyMs: { p50: pct(stats.voteMs, 0.5), p95: pct(stats.voteMs, 0.95), n: stats.voteMs.length },
  resetThenStaleAnswer: stale.status
});
assert.equal(stats.serverErrors, 0, 'no 5xx');
assert.equal(summary.roundsPlayed, 12);
console.log(`PASS: simulated ${N}-client mission completed (${summary.outcome}).`);
process.exit(0);
