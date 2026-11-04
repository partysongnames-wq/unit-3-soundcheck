// SIMULATED classroom: N automated WebSocket clients (NOT real student devices) play a full game.
// Usage: node tests/sim.mjs 20   |   node tests/sim.mjs 40
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { STARTER_PACK } from '../public/js/shared/packs.js';
import { SPEED, move } from '../public/js/shared/world.js';
import { createBrain, think } from '../public/js/shared/botbrain.js';

const N = Number(process.argv[2] || 20); const MINUTES = Number(process.env.SIM_MINUTES || 2); const ACC = 0.8;
const logs = [];
const server = createServer({ port: 0, log: (...a) => logs.push(a.join(' ')) });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port; const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, body, headers = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) }); return { status: r.status, data: await r.json() }; };
const qById = new Map(STARTER_PACK.questions.map((q) => [q.prompt, q]));
const stats = { snapshots: 0, opens: 0, answers: 0, correct: 0, corrections: 0, errors: {}, qLatency: [], resLatency: [], bytes: 0, fatals: 0 };

class Client {
  constructor(i) { this.i = i; this.name = `Sim Kid ${String(i).padStart(2, '0')}`; this.brain = createBrain(); this.zombies = []; this.flags = 0; this.fuses = 0; this.question = null; }
  async join(code) { const r = await post(`/api/rooms/${code}/join`, { callsign: this.name, avatar: { hair: this.i % 8, outfit: this.i % 6 } }); assert.equal(r.status, 200); Object.assign(this, { code, id: r.data.playerId, secret: r.data.secret, num: r.data.num, crew: r.data.crew }); }
  connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      this.ws.onopen = () => this.ws.send(JSON.stringify({ t: 'hello', code: this.code, role: 'player', playerId: this.id, secret: this.secret }));
      this.ws.onmessage = (e) => { stats.bytes += e.data.length; this.onMsg(JSON.parse(e.data), resolve); };
      this.ws.onclose = () => { this.open = false; };
    });
  }
  onMsg(m, resolve) {
    if (m.t === 'welcome') { this.open = true; this.x = m.you.x; this.y = m.you.y; this.welcomes = (this.welcomes || 0) + 1; this.crewSeen = m.you.crew; resolve(); }
    else if (m.t === 's') { stats.snapshots++; this.phase = m.ph; this.zombies = m.z.map((z) => ({ x: z[0] / 100, y: z[1] / 100 })); const me = m.p.find((p) => p[0] === this.num); if (me) { this.flags = me[3]; this.fuses = me[4]; } }
    else if (m.t === 'corr') { stats.corrections++; this.x = m.x; this.y = m.y; }
    else if (m.t === 'q') {
      stats.qLatency.push(performance.now() - this.openedAt); this.question = m;
      const q = qById.get(m.question.prompt); const choice = Math.random() < ACC ? q.correct : (q.correct + 1) % 4;
      setTimeout(() => { if (!this.open) return; this.answerAt = performance.now(); this.ws.send(JSON.stringify({ t: 'answer', nonce: m.nonce, c: choice })); }, 1200 + Math.random() * 2500);
    }
    else if (m.t === 'res') { stats.resLatency.push(performance.now() - this.answerAt); stats.answers++; if (m.correct) stats.correct++; this.question = null; }
    else if (m.t === 'err') { stats.errors[m.code] = (stats.errors[m.code] || 0) + 1; if (m.about === 'open') this.question = null; }
    else if (m.t === 'fatal') stats.fatals++;
    else if (m.t === 'mystats') this.mystats = m;
  }
  step(dt) {
    if (!this.open || this.question || this.phase !== 'play') return;
    const d = think(this.brain, { x: this.x, y: this.y, fuses: this.fuses, zombified: this.flags & 4 }, { now: performance.now(), zombies: this.zombies, lockerReady: () => true });
    const sp = (this.flags & 4 ? SPEED.zombified : this.flags & 16 ? SPEED.boots : SPEED.player) * dt * 0.95;
    [this.x, this.y] = move(this.x, this.y, d.dx * sp, d.dy * sp);
    this.ws.send(JSON.stringify({ t: 'pos', x: this.x, y: this.y, d: d.dx < 0 ? -1 : 1, m: true }));
    if (d.atLocker !== null && !(this.flags & 4)) { stats.opens++; this.openedAt = performance.now(); this.question = { pending: true }; this.ws.send(JSON.stringify({ t: 'open', l: d.atLocker })); setTimeout(() => { if (this.question && this.question.pending) this.question = null; }, 1500); }
  }
}

const t0 = performance.now();
const room = (await post('/api/rooms', { pack: STARTER_PACK, settings: { minutes: MINUTES } })).data;
const H = { 'X-Host-Token': room.hostToken };
const late = 2; const clients = Array.from({ length: N }, (_, i) => new Client(i));
await Promise.all(clients.slice(0, N - late).map((c) => c.join(room.code)));
await Promise.all(clients.slice(0, N - late).map((c) => c.connect()));
const host = new WebSocket(`ws://127.0.0.1:${port}/ws`); let hostResults = null; let hostSnaps = 0;
host.onopen = () => host.send(JSON.stringify({ t: 'hello', code: room.code, role: 'host', token: room.hostToken }));
host.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 's') hostSnaps++; if (m.t === 'results' && m.results.hardest) hostResults = m.results; };
assert.equal((await post(`/api/rooms/${room.code}/host/start`, {}, H)).status, 200);
const dropped = clients.slice(0, 3);
let last = performance.now(); const gameMs = MINUTES * 60_000 + 6000; let phaseDone = false;
const timeline = [];
const loop = setInterval(() => { const now = performance.now(); const dt = (now - last) / 1000; last = now; for (const c of clients) if (c.ws) c.step(dt); }, 66);
const events = [
  [25_000, async () => { await Promise.all(clients.slice(N - late).map((c) => c.join(room.code))); await Promise.all(clients.slice(N - late).map((c) => c.connect())); timeline.push('late joiners connected'); }],
  [35_000, async () => { dropped.forEach((c) => c.ws.close()); timeline.push('3 clients dropped'); }],
  [55_000, async () => { for (const c of dropped) { const r = await post(`/api/rooms/${room.code}/join`, { playerId: c.id, secret: c.secret }); assert.equal(r.data.playerId, c.id); assert.equal(r.data.crew, c.crew); await c.connect(); } timeline.push('3 clients reconnected (same id + crew)'); }]
];
for (const [at, fn] of events) setTimeout(fn, at);
while (performance.now() - t0 < gameMs + 8000) { await sleep(500); if (clients.every((c) => !c.open || c.phase === 'results')) { phaseDone = clients.some((c) => c.phase === 'results'); if (phaseDone) break; } }
clearInterval(loop);
await sleep(800);
assert.ok(phaseDone, 'game reached results');
assert.ok(hostResults, 'host received results with review');
const withStats = clients.filter((c) => c.mystats).length;
// reset back to lobby
assert.equal((await post(`/api/rooms/${room.code}/host/reset`, {}, H)).status, 200);
await sleep(400);
for (const c of clients) c.ws.close(); host.close();
server.closeAllConnections?.(); server.close();
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : '-'; };
const secs = (performance.now() - t0) / 1000;
console.log(`\n=== SIMULATED ${N}-client game (automated WebSocket clients, NOT real student devices) ===`);
console.log(timeline.join(' → '));
console.log({
  clients: N, gameMinutes: MINUTES, wallSeconds: Number(secs.toFixed(1)),
  crews: hostResults.crews.map((c) => `#${c.place} crew${c.crew}: ${c.score}`).join(', '),
  answers: hostResults.answers, classAccuracy: `${Math.round(hostResults.accuracy * 100)}%`, toughest: hostResults.hardest.map((q) => `Q${q.i + 1} ${Math.round(q.acc * 100)}%`).join(', '),
  lockerOpens: stats.opens, answersAcked: stats.answers, positionCorrections: stats.corrections,
  rejected: stats.errors, fatals: stats.fatals, serverErrorsLogged: logs.filter((l) => /error/i.test(l)).length,
  snapshotsReceived: stats.snapshots, snapshotsPerClientPerSec: Number((stats.snapshots / N / secs).toFixed(1)),
  downstreamKBps: Number((stats.bytes / 1024 / secs).toFixed(1)),
  openToQuestionMs: { p50: pct(stats.qLatency, 0.5), p95: pct(stats.qLatency, 0.95) },
  answerToResultMs: { p50: pct(stats.resLatency, 0.5), p95: pct(stats.resLatency, 0.95) },
  privateStatsDelivered: `${withStats}/${N}`, hostSnapshots: hostSnaps
});
assert.equal(logs.filter((l) => /error/i.test(l)).length, 0, 'no server errors');
assert.equal(stats.fatals, 0);
assert.ok(stats.answers > N, 'clients answered questions');
assert.equal(withStats, N, 'every client got private end-of-game stats');
console.log(`PASS: simulated ${N}-client game completed.`);
process.exit(0);
