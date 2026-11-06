import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { STARTER_PACK } from '../assets/js/shared/packs.js';
import { path as worldPath } from '../assets/js/shared/world.js';

const port = 8799;
const persistence = await mkdtemp(join(tmpdir(), 'daywalkers-test-'));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', persistence], {
  cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' }
});
let logs = '';
child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
const stop = () => { if (!child.killed) child.kill('SIGTERM'); };
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130); });

async function waitReady() {
  for (let i = 0; i < 240; i++) {
    if (child.exitCode !== null) throw new Error(`wrangler exited ${child.exitCode}\n${logs}`);
    try { if ((await fetch(base + '/api/info')).ok) return; } catch {}
    await delay(125);
  }
  throw new Error('wrangler did not become ready\n' + logs);
}
async function call(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
async function walkSocket(client, from, to) {
  const tiles = worldPath(from.x, from.y, to.x, to.y); assert.ok(tiles, 'station path exists');
  let x = from.x, y = from.y;
  for (const [tx, ty] of tiles) { const gx = tx + .5, gy = ty + .5, d = Math.hypot(gx - x, gy - y), n = Math.max(1, Math.ceil(d / .65)); for (let i = 1; i <= n; i++) { const nx = x + (gx - x) * i / n, ny = y + (gy - y) * i / n; client.send({ t: 'pos', x: +nx.toFixed(3), y: +ny.toFixed(3), d: nx >= x ? 1 : -1, m: true }); await delay(110); } x = gx; y = gy; }
}
function wsClient(code, hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?code=${encodeURIComponent(code)}`);
  const inbox = [], waiters = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); inbox.push(m); for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } };
  ws.onopen = () => ws.send(JSON.stringify(hello));
  return { ws, inbox, send: (m) => ws.send(JSON.stringify(m)), wait(pred, ms = 5000) { const hit = inbox.find(pred); if (hit) return Promise.resolve(hit); return new Promise((resolve, reject) => { const w = { pred, resolve }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); reject(new Error('WebSocket timeout; inbox=' + JSON.stringify(inbox))); }, ms); }); } };
}
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); console.log('ok -', name); }

try {
  await waitReady();
  await check('static host/player/teacher/editor pages and security headers', async () => {
    for (const page of ['/host.html', '/play.html', '/teacher.html', '/editor.html']) {
      const r = await call(page); assert.equal(r.status, 200, page); assert.match(String(r.data), /Suksanari|AFTER HOURS|Question Pack|Daywalkers/i); assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    }
    for (const asset of ['/audio/day.mp3', '/audio/night.mp3']) {
      const r = await fetch(base + asset); assert.equal(r.status, 200, asset); assert.match(r.headers.get('content-type') || '', /audio|mpeg/); assert.ok((await r.arrayBuffer()).byteLength > 10_000, asset + ' is populated');
    }
    const playJs = await call('/js/play.js'); assert.match(String(playJs.data), /wb_open/); assert.match(String(playJs.data), /feed/); assert.match(String(playJs.data), /riderArt/); assert.match(String(playJs.data), /candidate-fallback/);
    assert.equal((await call('/host.html', { method: 'POST', body: {} })).status, 405);
    assert.notEqual((await call('/server.mjs')).status, 200);
  });

  let room, player;
  await check('room creation, join, reconnect, and HTTP authentication', async () => {
    assert.equal((await call('/api/rooms', { method: 'POST', raw: '{bad' })).status, 400);
    assert.equal((await call('/api/rooms', { method: 'POST', body: { pack: { title: 'bad', questions: [] } } })).status, 400);
    const made = await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK, settings: { minutes: 3, teams: 4 } } });
    assert.equal(made.status, 201); room = made.data; assert.match(room.code, /^[A-Z0-9]{5}$/); assert.ok(room.hostToken.length >= 40);
    assert.equal((await call(`/api/rooms/${room.code}/host/start`, { method: 'POST', body: {} })).status, 403);
    const joined = await call(`/api/rooms/${room.code}/join`, { method: 'POST', body: { callsign: 'Cloud Fox' } });
    assert.equal(joined.status, 200); player = joined.data;
    const reconnect = await call(`/api/rooms/${room.code}/join`, { method: 'POST', body: { playerId: player.playerId, secret: player.secret } });
    assert.equal(reconnect.status, 200); assert.equal(reconnect.data.reconnected, true);
    assert.equal((await call(`/api/rooms/${room.code}/teacher`, { headers: { 'x-view-token': 'bad' } })).status, 403);
    const teacher = await call(`/api/rooms/${room.code}/teacher`, { headers: { 'x-view-token': room.viewToken } });
    assert.equal(teacher.status, 200); assert.equal(teacher.data.players[0].name, 'Cloud Fox');
  });

  await check('WebSocket host/player authentication and real-time exchange', async () => {
    const bad = wsClient(room.code, { t: 'hello', code: room.code, role: 'host', token: 'bad' });
    assert.equal((await bad.wait((m) => m.t === 'fatal')).code, 'bad_token');
    const host = wsClient(room.code, { t: 'hello', code: room.code, role: 'host', token: room.hostToken });
    const play = wsClient(room.code, { t: 'hello', code: room.code, role: 'player', playerId: player.playerId, secret: player.secret });
    assert.equal((await host.wait((m) => m.t === 'welcome')).role, 'host');
    const welcome = await play.wait((m) => m.t === 'welcome'); assert.equal(welcome.you.name, 'Cloud Fox');
    const roster = await play.wait((m) => m.t === 'roster'); assert.equal(roster.list[0].name, 'Cloud Fox'); assert.equal(JSON.stringify(roster).includes(player.secret), false);
    assert.equal((await host.wait((m) => m.t === 'stats')).players, 1);
    const start = await call(`/api/rooms/${room.code}/host/start`, { method: 'POST', body: {}, headers: { 'x-host-token': room.hostToken } });
    assert.equal(start.status, 200);
    const live = await play.wait((m) => m.t === 's' && m.ph === 'play', 7000);
    assert.equal(live.ph, 'play'); assert.equal(live.k.length, 4, 'kitten state is broadcast'); assert.equal(live.p[0].length, 10, 'happiness and cat food are broadcast');
    play.send({ t: 'feed', k: 0 }); const feedErr = await play.wait((m) => m.t === 'err' && m.about === 'feed'); assert.ok(['too_far', 'no_food'].includes(feedErr.code));
    play.send({ t: 'wb_open' }); assert.equal((await play.wait((m) => m.t === 'err' && m.about === 'wb_open')).code, 'too_far');
    play.send({ t: 'wb_word', nonce: 'stale', i: 0, w: 'school' }); assert.equal((await play.wait((m) => m.t === 'err' && m.about === 'wb_word')).code, 'stale');
    play.send({ t: 'wb_close' });
    play.send({ t: 'pos', x: 999, y: 999, d: 1, m: true }); assert.equal((await play.wait((m) => m.t === 'corr')).t, 'corr');
    const mine = live.p.find((x) => x[0] === welcome.you.n);
    await walkSocket(play, { x: mine[1] / 100, y: mine[2] / 100 }, { x: 24.5, y: 4.5 });
    play.send({ t: 'station_open', kind: 'math' }); const station = await play.wait((m) => m.t === 'station', 7000);
    assert.equal(station.total, 3); assert.equal(JSON.stringify(station).includes('answer'), false); assert.equal(JSON.stringify(play.inbox.filter(m => m.t === 's')).includes('correctIndex'), false);
    let item = 0; for (; item < 3; item++) { play.send({ t: 'station_answer', nonce: station.nonce, i: item, c: 0 }); await play.wait((m) => m.t === 'station_res' && m.i === item); }
    assert.equal((await play.wait((m) => m.t === 'station_end')).total, 3);
    play.send({ t: 'station_open', kind: 'math' }); assert.equal((await play.wait((m) => m.t === 'err' && m.about === 'station_open')).code, 'attempted');
    host.ws.close(); play.ws.close(); bad.ws.close();
  });

  await check('karaoke wire protocol rejects distant entry and ignores forged score', async () => {
    const far = wsClient(room.code, { t: 'hello', code: room.code, role: 'player', playerId: player.playerId, secret: player.secret });
    await far.wait(m => m.t === 'welcome'); far.send({ t: 'karaoke_open', score: 999999 });
    assert.equal((await far.wait(m => m.t === 'err' && m.about === 'karaoke_open')).code, 'too_far'); far.ws.close();
  });

  await check('forty karaoke clients, private sessions, reconnect, expiry, duplicate close and practice isolation', async () => {
    const made = await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK, practice: true, settings: { minutes: 3, teams: 4, night: false } } });
    const rehearsal = made.data, clients = [];
    for (let i = 0; i < 40; i++) {
      const joined = await call(`/api/rooms/${rehearsal.code}/join`, { method: 'POST', body: { callsign: 'Chorus ' + i } });
      assert.equal(joined.status, 200);
      const identity = joined.data;
      const c = wsClient(rehearsal.code, { t: 'hello', code: rehearsal.code, role: 'player', playerId: identity.playerId, secret: identity.secret });
      const welcome = await c.wait(m => m.t === 'welcome'); assert.equal(welcome.practice, true); assert.equal(welcome.you.x, 37.5); assert.equal(welcome.you.y, 14.8);
      clients.push({ c, identity });
    }
    assert.equal((await call(`/api/rooms/${rehearsal.code}/host/start`, { method: 'POST', body: {}, headers: { 'x-host-token': rehearsal.hostToken } })).status, 200);
    await clients[0].c.wait(m => m.t === 's' && m.ph === 'play', 7000);
    for (const { c } of clients) c.send({ t: 'karaoke_open', score: 999999 });
    const songs = await Promise.all(clients.map(({ c }) => c.wait(m => m.t === 'karaoke')));
    assert.equal(new Set(songs.map(s => s.nonce)).size, 40);
    // Owner authentication must bind input even if another player's nonce is known.
    clients[0].c.send({ t: 'karaoke_tap', nonce: songs[1].nonce, lane: 0, score: 999999 });
    assert.equal((await clients[0].c.wait(m => m.t === 'err' && m.about === 'karaoke_tap')).code, 'stale');
    for (let i = 1; i < 40; i++) clients[i].c.send({ t: 'karaoke_close' });
    await Promise.all(clients.slice(1).map(({ c }) => c.wait(m => m.t === 'karaoke_end')));
    const old = clients[0]; old.c.ws.close(); await delay(250);
    const resumed = wsClient(rehearsal.code, { t: 'hello', code: rehearsal.code, role: 'player', playerId: old.identity.playerId, secret: old.identity.secret });
    const song = await resumed.wait(m => m.t === 'karaoke'); assert.equal(song.nonce, songs[0].nonce); assert.ok(song.elapsed > 0);
    // Let an abandoned song expire on the server; the result must survive reconnect.
    resumed.ws.close(); await delay(35500);
    const expired = wsClient(rehearsal.code, { t: 'hello', code: rehearsal.code, role: 'player', playerId: old.identity.playerId, secret: old.identity.secret });
    const result = await expired.wait(m => m.t === 'karaoke_end', 20000); assert.equal(result.reason, 'done'); assert.equal(result.points, 0); assert.equal(result.accuracy, 0);
    expired.send({ t: 'karaoke_close' }); expired.send({ t: 'karaoke_ack' }); expired.send({ t: 'karaoke_open' });
    const repeated = await expired.wait(m => m.t === 'karaoke' && m.nonce !== song.nonce); assert.notEqual(repeated.nonce, song.nonce);
    const world = await expired.wait(m => m.t === 's' && m.ph === 'play'); assert.deepEqual(world.sc, [0, 0, 0, 0]);
    for (const { c } of clients) c.ws.close(); expired.ws.close();
  });

  await check('online API info advertises HTTPS origin and both music tracks', async () => {
    const info = await call('/api/info'); assert.equal(info.status, 200); assert.equal(info.data.cloudflare, true);
    assert.equal(info.data.joinBaseUrl, base); assert.deepEqual(info.data.audio, ['day', 'night']); assert.deepEqual(info.data.lanAddresses, []);
  });

  await check('teacher view token remains read-only', async () => {
    assert.equal((await call(`/api/rooms/${room.code}/host/pause`, { method: 'POST', body: {}, headers: { 'x-host-token': room.viewToken } })).status, 403);
    assert.equal((await call(`/api/rooms/${room.code}/teacher`, { headers: { 'x-host-token': room.hostToken } })).status, 200);
  });

  await check('WebSocket frame and upgrade-path limits are enforced', async () => {
    assert.equal((await call(`/ws?code=${room.code}`)).status, 426);
    assert.notEqual((await call('/not-ws')).status, 101);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?code=${encodeURIComponent(room.code)}`);
    const closed = new Promise((resolve, reject) => { ws.onclose = (e) => resolve(e.code); ws.onerror = () => {}; setTimeout(() => reject(new Error('oversized WebSocket was not closed')), 5000); });
    await new Promise((resolve) => { ws.onopen = resolve; }); ws.send('x'.repeat(16 * 1024 + 1)); assert.equal(await closed, 1009);
  });

  await check('room enforces the 40-player HTTP limit with balanced crews', async () => {
    const made = await call('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK, settings: { teams: 4 } } }); assert.equal(made.status, 201);
    const crews = [0, 0, 0, 0];
    for (let i = 0; i < 40; i++) { const j = await call(`/api/rooms/${made.data.code}/join`, { method: 'POST', body: { callsign: `Limit ${i}` } }); assert.equal(j.status, 200); crews[j.data.crew]++; }
    assert.deepEqual(crews, [10, 10, 10, 10]);
    assert.equal((await call(`/api/rooms/${made.data.code}/join`, { method: 'POST', body: { callsign: 'One Too Many' } })).status, 409);
  });

  console.log(`\n${checks.length} Worker integration groups passed`);
} catch (e) {
  console.error(e); console.error('--- wrangler logs ---\n' + logs); process.exitCode = 1;
} finally { stop(); await delay(1000); await rm(persistence, { recursive: true, force: true }); }
