// HTTP API + security tests against a real in-process server on a random port.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createServer } from '../server.mjs';
import { STARTER_PACK } from '../public/js/shared/packs.js';

let server; let base;
test.before(async () => {
  server = createServer({ port: 0, log: () => {}, pollWaitMs: 300 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

async function call(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
function rawRequest(path) {
  return new Promise((resolve) => {
    const s = net.connect(server.address().port, '127.0.0.1', () => s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let buf = ''; s.on('data', (d) => { buf += d; }); s.on('end', () => resolve(buf.split('\r\n')[0]));
  });
}

test('create room validates pack; host token required for controls', async () => {
  assert.equal((await call('/api/rooms', { method: 'POST', body: { pack: { title: 'x', questions: [] } } })).status, 400);
  assert.equal((await call('/api/rooms', { method: 'POST', raw: '{not json' })).status, 400);
  const r = await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK } });
  assert.equal(r.status, 201);
  assert.match(r.data.code, /^[A-Z0-9]{5}$/);
  assert.ok(r.data.hostToken.length >= 40, 'unguessable token');
  const c = r.data.code;
  assert.equal((await call(`/api/rooms/${c}/host/start`, { method: 'POST', body: {} })).status, 403);
  assert.equal((await call(`/api/rooms/${c}/host/start`, { method: 'POST', body: {}, headers: { 'X-Host-Token': 'guess' } })).status, 403);
  assert.equal((await call('/api/rooms/ZZZZZ/state')).status, 404);
});

test('join, hidden answers in public state, answer/vote flow, stale + duplicate rejection', async () => {
  const room = (await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK } })).data;
  const H = { 'X-Host-Token': room.hostToken };
  const p = (await call(`/api/rooms/${room.code}/join`, { method: 'POST', body: { callsign: 'Quiet Fox 12' } })).data;
  const P = { 'X-Player-Id': p.playerId, 'X-Player-Secret': p.secret };
  const p2 = (await call(`/api/rooms/${room.code}/join`, { method: 'POST', body: { callsign: 'Swift Moth 7' } })).data;
  const P2 = { 'X-Player-Id': p2.playerId, 'X-Player-Secret': p2.secret };
  assert.equal((await call(`/api/rooms/${room.code}/state`)).status, 401, 'state requires identity');
  assert.equal((await call(`/api/rooms/${room.code}/state`, { headers: { 'X-Player-Id': p.playerId, 'X-Player-Secret': 'x' } })).status, 401);
  assert.equal((await call(`/api/rooms/${room.code}/host/start`, { method: 'POST', body: {}, headers: H })).status, 200);
  const st = await call(`/api/rooms/${room.code}/state?since=0`, { headers: P });
  const s = JSON.stringify(st.data);
  assert.equal(st.data.phase, 'question');
  assert.equal(s.includes(room.hostToken), false);
  assert.equal(s.includes(STARTER_PACK.questions[0].explanation), false);
  assert.equal(st.data.reveal, null);
  assert.equal((await call(`/api/rooms/${room.code}/answer`, { method: 'POST', headers: P, body: { roundId: 'e1r5', choice: 1 } })).status, 409);
  assert.equal((await call(`/api/rooms/${room.code}/answer`, { method: 'POST', headers: P, body: { roundId: st.data.roundId, choice: 1 } })).status, 200);
  const dup = await call(`/api/rooms/${room.code}/answer`, { method: 'POST', headers: P, body: { roundId: st.data.roundId, choice: 2 } });
  assert.equal(dup.status, 409); assert.equal(dup.data.error, 'already_answered');
  assert.equal((await call(`/api/rooms/${room.code}/state?since=0`, { headers: P })).data.phase, 'question', 'still open until everyone answered');
  assert.equal((await call(`/api/rooms/${room.code}/answer`, { method: 'POST', headers: P2, body: { roundId: st.data.roundId, choice: 0 } })).status, 200);
  // everyone answered -> auto reveal
  const rv = await call(`/api/rooms/${room.code}/state?since=0`, { headers: P });
  assert.equal(rv.data.phase, 'reveal'); assert.equal(rv.data.reveal.correct, STARTER_PACK.questions[0].correct);
  assert.equal(rv.data.me.correct, true);
  await call(`/api/rooms/${room.code}/host/next`, { method: 'POST', body: {}, headers: H });
  const vt = await call(`/api/rooms/${room.code}/state?since=0`, { headers: P });
  assert.equal(vt.data.phase, 'vote');
  assert.equal((await call(`/api/rooms/${room.code}/vote`, { method: 'POST', headers: P, body: { roundId: vt.data.roundId, option: 'teleport' } })).status, 400);
  assert.equal((await call(`/api/rooms/${room.code}/vote`, { method: 'POST', headers: P, body: { roundId: vt.data.roundId, option: 'hold' } })).status, 200);
  assert.equal((await call(`/api/rooms/${room.code}/vote`, { method: 'POST', headers: P, body: { roundId: 'e1r0x', option: 'hold' } })).status, 409, 'stale vote');
  // reconnect same identity
  const re = await call(`/api/rooms/${room.code}/join`, { method: 'POST', body: { playerId: p.playerId, secret: p.secret } });
  assert.equal(re.data.playerId, p.playerId); assert.equal(re.data.reconnected, true); assert.equal(re.data.crew, p.crew);
});

test('body size limits and input validation', async () => {
  const room = (await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK } })).data;
  const big = 'x'.repeat(10_000);
  assert.equal((await call(`/api/rooms/${room.code}/join`, { method: 'POST', raw: JSON.stringify({ callsign: big }) })).status, 413);
  assert.equal((await call(`/api/rooms/${room.code}/join`, { method: 'POST', body: { callsign: '<img src=x>' } })).status, 400);
  assert.equal((await call(`/api/rooms/${room.code}/join`, { method: 'POST', raw: '[1,2]' })).status, 400);
  const huge = 'y'.repeat(3.5 * 1024 * 1024);
  assert.equal((await call('/api/rooms', { method: 'POST', raw: JSON.stringify({ pack: { title: huge } }) })).status, 413);
});

test('static files are served safely (no traversal, no dotfiles, no server source)', async () => {
  const ok = await call('/host.html');
  assert.equal(ok.status, 200); assert.match(ok.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await call('/js/shared/packs.js')).status, 200);
  for (const p of ['/../server.mjs', '/%2e%2e/server.mjs', '/..%2fserver.mjs', '/.git/config', '/js/../../package.json', '/%00', '/server.mjs']) {
    const r = await call(p);
    assert.notEqual(r.status, 200, `${p} must not be served`);
  }
  assert.match(await rawRequest('/../../server.mjs'), / 404 /);
  assert.match(await rawRequest('/..%2f..%2fserver.mjs'), / (404|400) /);
  assert.equal((await call('/host.html', { method: 'POST', body: {} })).status, 405);
});

test('41st player is rejected over HTTP', async () => {
  const room = (await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK } })).data;
  const res = await Promise.all(Array.from({ length: 41 }, (_, i) => call(`/api/rooms/${room.code}/join`, { method: 'POST', body: { callsign: `Unit ${i}` } })));
  assert.equal(res.filter((r) => r.status === 200).length, 40);
  const rej = res.filter((r) => r.status !== 200);
  assert.equal(rej.length, 1); assert.equal(rej[0].status, 409); assert.equal(rej[0].data.error, 'room_full');
  const crews = [0, 0, 0, 0]; res.filter((r) => r.status === 200).forEach((r) => crews[r.data.crew]++);
  assert.deepEqual(crews, [10, 10, 10, 10]);
});
