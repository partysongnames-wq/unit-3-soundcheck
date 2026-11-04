// HTTP + WebSocket tests against a real in-process server (Node 22 built-in WebSocket client).
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createServer } from '../server.mjs';
import { STARTER_PACK } from '../public/js/shared/packs.js';
import { LOCKERS, lockerStand } from '../public/js/shared/world.js';

let server, base, port;
test.before(async () => { server = createServer({ port: 0, log: () => {} }); await new Promise((r) => server.listen(0, '127.0.0.1', r)); port = server.address().port; base = `http://127.0.0.1:${port}`; });
test.after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

async function call(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
function wsClient(hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const inbox = []; const waiters = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); inbox.push(m); for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } };
  ws.onopen = () => ws.send(JSON.stringify(hello));
  const closed = new Promise((r) => { ws.onclose = r; });
  return {
    ws, inbox, closed, send: (m) => ws.send(JSON.stringify(m)),
    wait(pred, ms = 4000) { const hit = inbox.find(pred); if (hit) return Promise.resolve(hit); return new Promise((res, rej) => { const w = { pred, res }; waiters.push(w); setTimeout(() => rej(new Error('timeout')), ms); }); }
  };
}
const newRoom = async (extra = {}) => (await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK, settings: { minutes: 3 }, ...extra } })).data;
const join = async (code, callsign) => (await call(`/api/rooms/${code}/join`, { method: 'POST', body: { callsign } })).data;

test('room creation validates pack; host token required', async () => {
  assert.equal((await call('/api/rooms', { method: 'POST', body: { pack: { title: 'x', questions: [] } } })).status, 400);
  assert.equal((await call('/api/rooms', { method: 'POST', raw: '{bad' })).status, 400);
  const r = await newRoom();
  assert.match(r.code, /^[A-Z0-9]{5}$/); assert.ok(r.hostToken.length >= 40);
  assert.equal((await call(`/api/rooms/${r.code}/host/start`, { method: 'POST', body: {} })).status, 403);
  assert.equal((await call(`/api/rooms/${r.code}/host/start`, { method: 'POST', body: {}, headers: { 'X-Host-Token': 'guess' } })).status, 403);
  assert.equal((await call('/api/rooms/ZZZZZ/join', { method: 'POST', body: { callsign: 'Abc' } })).status, 404);
});

test('WebSocket: bad credentials are refused; players get roster + world snapshots', async () => {
  const r = await newRoom();
  const bad = wsClient({ t: 'hello', code: r.code, role: 'host', token: 'nope' });
  assert.equal((await bad.wait((m) => m.t === 'fatal')).code, 'bad_token'); await bad.closed;
  const bad2 = wsClient({ t: 'hello', code: r.code, role: 'player', playerId: 'x', secret: 'y' });
  assert.equal((await bad2.wait((m) => m.t === 'fatal')).code, 'bad_identity');
  const p = await join(r.code, 'Sparkly Fox');
  const c = wsClient({ t: 'hello', code: r.code, role: 'player', playerId: p.playerId, secret: p.secret });
  const w = await c.wait((m) => m.t === 'welcome');
  assert.equal(w.you.name, 'Sparkly Fox');
  const roster = await c.wait((m) => m.t === 'roster');
  assert.equal(JSON.stringify(roster).includes(p.secret), false);
  const s = await c.wait((m) => m.t === 's');
  assert.equal(s.ph, 'lobby'); assert.equal(JSON.stringify(s).includes(r.hostToken), false);
  const host = wsClient({ t: 'hello', code: r.code, role: 'host', token: r.hostToken });
  assert.equal((await host.wait((m) => m.t === 'welcome')).role, 'host');
  assert.ok(await host.wait((m) => m.t === 'stats'));
  c.ws.close(); host.ws.close();
});

test('WebSocket game flow: locker question → answer → result with WHY; errors are reported', async () => {
  const r = await newRoom();
  const p = await join(r.code, 'Lucky Mochi');
  const c = wsClient({ t: 'hello', code: r.code, role: 'player', playerId: p.playerId, secret: p.secret });
  await c.wait((m) => m.t === 'welcome');
  c.send({ t: 'open', l: 0 });
  assert.equal((await c.wait((m) => m.t === 'err')).code, 'wrong_phase');
  await call(`/api/rooms/${r.code}/host/start`, { method: 'POST', body: {}, headers: { 'X-Host-Token': r.hostToken } });
  await c.wait((m) => m.t === 's' && m.ph === 'play', 6000);
  // walk to locker 4 in small valid steps
  const L = LOCKERS[4]; const [tx, ty] = lockerStand(L);
  let me = (await c.wait((m) => m.t === 's' && m.p.length)).p[0]; let x = me[1] / 100, y = me[2] / 100;
  c.send({ t: 'open', l: 4 }); assert.equal((await c.wait((m) => m.t === 'err' && m.code === 'too_far')).code, 'too_far');
  // route: move along the corridor row then to the stand point
  const steps = [];
  const goto = (gx, gy) => { while (Math.hypot(gx - x, gy - y) > 0.05) { const d = Math.hypot(gx - x, gy - y); const k = Math.min(1, 0.3 / d); x += (gx - x) * k; y += (gy - y) * k; steps.push([x, y]); } };
  goto(x, 13.5); goto(tx, 13.5); goto(tx, ty);
  for (const [sx, sy] of steps) { c.send({ t: 'pos', x: sx, y: sy, d: 1, m: true }); await new Promise((res) => setTimeout(res, 80)); }
  const corr = c.inbox.filter((m) => m.t === 'corr').length;
  assert.equal(corr, 0, 'valid walking is never corrected');
  c.send({ t: 'open', l: 4 });
  const q = await c.wait((m) => m.t === 'q');
  assert.equal('correct' in q.question, false); assert.equal('explanation' in q.question, false);
  c.send({ t: 'answer', nonce: 'forged', c: 0 });
  assert.equal((await c.wait((m) => m.t === 'err' && m.about === 'answer')).code, 'stale');
  c.send({ t: 'answer', nonce: q.nonce, c: 2 });
  const res = await c.wait((m) => m.t === 'res');
  assert.equal(typeof res.correct, 'boolean'); assert.ok(res.explanation.length > 10); assert.ok(Number.isInteger(res.correctIndex));
  c.send({ t: 'answer', nonce: q.nonce, c: 2 });
  assert.equal((await c.wait((m) => m.t === 'err' && m.about === 'answer' && m.code === 'stale' && m !== c.inbox.find((x) => x.code === 'stale'))).code, 'stale');
  // teleport is corrected
  c.send({ t: 'pos', x: 38, y: 13.5, d: 1, m: true });
  assert.ok(await c.wait((m) => m.t === 'corr'));
  c.ws.close();
});

test('WebSocket limits: oversized frames close the socket; non-ws upgrade paths refused', async () => {
  const r = await newRoom(); const p = await join(r.code, 'Big Sender');
  const c = wsClient({ t: 'hello', code: r.code, role: 'player', playerId: p.playerId, secret: p.secret });
  await c.wait((m) => m.t === 'welcome');
  c.ws.send('x'.repeat(40_000));
  await c.closed;
  const line = await new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write('GET /nope HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')); let b = ''; s.on('data', (d) => { b += d; }); s.on('end', () => resolve(b.split('\r\n')[0])); s.on('close', () => resolve(b.split('\r\n')[0])); });
  assert.match(line, /404/);
});

test('41st join rejected over HTTP; crews 10/10/10/10', async () => {
  const r = await newRoom();
  const res = await Promise.all(Array.from({ length: 41 }, (_, i) => call(`/api/rooms/${r.code}/join`, { method: 'POST', body: { callsign: `Kid ${i}` } })));
  assert.equal(res.filter((x) => x.status === 200).length, 40);
  assert.equal(res.find((x) => x.status !== 200).data.error, 'room_full');
  const crews = [0, 0, 0, 0]; res.filter((x) => x.status === 200).forEach((x) => crews[x.data.crew]++);
  assert.deepEqual(crews, [10, 10, 10, 10]);
});

test('input limits and safe static files', async () => {
  const r = await newRoom();
  assert.equal((await call(`/api/rooms/${r.code}/join`, { method: 'POST', raw: JSON.stringify({ callsign: 'x'.repeat(9000) }) })).status, 413);
  assert.equal((await call(`/api/rooms/${r.code}/join`, { method: 'POST', body: { callsign: '<img>' } })).status, 400);
  const ok = await call('/play.html'); assert.equal(ok.status, 200); assert.match(ok.headers.get('content-security-policy'), /default-src 'self'/);
  for (const p of ['/../server.mjs', '/%2e%2e/server.mjs', '/.git/config', '/server.mjs', '/js/../../package.json']) assert.notEqual((await call(p)).status, 200, p);
  assert.equal((await call('/host.html', { method: 'POST', body: {} })).status, 405);
});

test('teacher phone view: read-only token works, cannot control the game, bad token refused', async () => {
  const r = await newRoom(); await join(r.code, 'Quiet Star');
  assert.ok(r.viewToken && r.viewToken !== r.hostToken);
  const ok = await call(`/api/rooms/${r.code}/teacher`, { headers: { 'X-View-Token': r.viewToken } });
  assert.equal(ok.status, 200); assert.equal(ok.data.players[0].name, 'Quiet Star');
  assert.equal(JSON.stringify(ok.data).includes(r.hostToken), false);
  assert.equal((await call(`/api/rooms/${r.code}/teacher`, { headers: { 'X-View-Token': 'nope' } })).status, 403);
  assert.equal((await call(`/api/rooms/${r.code}/host/start`, { method: 'POST', body: {}, headers: { 'X-Host-Token': r.viewToken } })).status, 403, 'view token cannot control');
  const mode = await call(`/api/rooms/${r.code}/host/settings`, { method: 'POST', body: { teams: 0 }, headers: { 'X-Host-Token': r.hostToken } });
  assert.equal(mode.status, 200);
});
