// Suksanari: AFTER HOURS — authoritative LAN game server (Node ESM, zero dependencies).
// Usage: node server.mjs   (env: PORT=8787 HOST=0.0.0.0 JOIN_BASE_URL=http://192.168.1.20:8787)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room, GameError, makeRoomCode } from './src/game.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MAX_ROOMS = 12;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000; // rooms expire after 3 hours without activity
const POLL_WAIT_MS = 20_000;
const MAX_WAITERS_PER_ROOM = 160;
const SMALL_BODY = 4 * 1024;
const PACK_BODY = 3.2 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

export function createServer({ port = 8787, joinBaseUrl = '', now = Date.now, log = console.log, connectedMs, pollWaitMs = POLL_WAIT_MS } = {}) {
  const rooms = new Map();

  function cleanup() {
    const t = now();
    for (const [code, r] of rooms) {
      if (t - r.lastActivity > ROOM_IDLE_MS) { for (const w of r.waiters) w(); rooms.delete(code); }
    }
  }
  const ticker = setInterval(() => {
    for (const r of rooms.values()) { try { r.tick(); } catch (e) { log('tick error', e); } }
  }, 250);
  const sweeper = setInterval(cleanup, 60_000);

  function send(res, status, body, headers = {}) {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...headers
    });
    res.end(data);
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length'] || 0);
      if (declared > limit) { reject(new GameError(413, 'too_large', 'Request body too large.')); req.resume(); return; }
      let size = 0; const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) { reject(new GameError(413, 'too_large', 'Request body too large.')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('x');
          resolve(v);
        } catch { reject(new GameError(400, 'bad_json', 'Body must be a JSON object.')); }
      });
      req.on('error', reject);
    });
  }

  function getRoom(code) {
    const r = typeof code === 'string' ? rooms.get(code.toUpperCase()) : null;
    if (!r) throw new GameError(404, 'no_room', 'Room not found. Check the code with your teacher.');
    return r;
  }

  function identify(req, room) {
    const t = req.headers['x-host-token'];
    if (t) {
      if (!room.isHost(String(t))) throw new GameError(403, 'bad_token', 'Teacher token is not valid for this room.');
      return { host: true };
    }
    const player = room.authPlayer(String(req.headers['x-player-id'] || ''), String(req.headers['x-player-secret'] || ''));
    return { host: false, player };
  }

  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    if (parts[1] === 'info' && req.method === 'GET') {
      const port_ = server.address()?.port || port;
      const lan = lanAddresses();
      return send(res, 200, {
        joinBaseUrl: joinBaseUrl || (lan[0] ? `http://${lan[0]}:${port_}` : ''),
        lanAddresses: lan.map((a) => `http://${a}:${port_}`), port: port_
      });
    }
    if (parts[1] !== 'rooms') throw new GameError(404, 'not_found', 'Unknown API route.');
    if (parts.length === 2 && req.method === 'POST') {
      cleanup();
      if (rooms.size >= MAX_ROOMS) throw new GameError(503, 'too_many_rooms', 'Too many active rooms on this server. End an old room first.');
      const body = await readBody(req, PACK_BODY);
      let code; do { code = makeRoomCode(); } while (rooms.has(code));
      const demoBots = body.demo ? Math.max(0, Math.min(16, Number(body.demoBots) || 12)) : 0;
      const room = new Room({ code, pack: body.pack, settings: body.settings || {}, now, demoBots, ...(connectedMs ? { connectedMs } : {}) });
      rooms.set(code, room);
      log(`room ${code} created (${room.pack.questions.length} questions${demoBots ? `, DEMO ${demoBots} bots` : ''})`);
      return send(res, 201, { code, hostToken: room.hostToken, packTitle: room.pack.title });
    }
    const room = getRoom(parts[2]);
    const action = parts[3];
    if (action === 'join' && req.method === 'POST') {
      const body = await readBody(req, SMALL_BODY);
      const { player, reconnected } = room.join({ callsign: body.callsign, playerId: body.playerId, secret: body.secret });
      return send(res, 200, { playerId: player.id, secret: player.secret, callsign: player.callsign, crew: player.crew, reconnected });
    }
    if (action === 'state' && req.method === 'GET') {
      const who = identify(req, room);
      room.tick();
      const since = Number(url.searchParams.get('since') || 0);
      if (room.version > since || room.waiters.size >= MAX_WAITERS_PER_ROOM) return send(res, 200, room.view(who));
      let done = false;
      const finish = () => {
        if (done) return; done = true; clearTimeout(timer);
        room.waiters.delete(finish);
        if (who.player) room.seen(who.player);
        if (!res.writableEnded) send(res, 200, room.view(who));
      };
      const timer = setTimeout(finish, pollWaitMs);
      room.waiters.add(finish);
      req.on('close', () => { if (!done) { done = true; clearTimeout(timer); room.waiters.delete(finish); } });
      return;
    }
    if (action === 'answer' && req.method === 'POST') {
      const { player } = identify(req, room);
      if (!player) throw new GameError(400, 'player_only', 'Only players answer.');
      const body = await readBody(req, SMALL_BODY);
      const r = room.submitAnswer(player, { roundId: body.roundId, choice: body.choice });
      return send(res, 200, { ok: true, ...r });
    }
    if (action === 'vote' && req.method === 'POST') {
      const { player } = identify(req, room);
      if (!player) throw new GameError(400, 'player_only', 'Only players vote.');
      const body = await readBody(req, SMALL_BODY);
      const r = room.submitVote(player, { roundId: body.roundId, option: body.option });
      return send(res, 200, { ok: true, ...r });
    }
    if (action === 'host' && req.method === 'POST' && parts[4]) {
      const t = String(req.headers['x-host-token'] || '');
      if (!room.isHost(t)) throw new GameError(403, 'bad_token', 'Teacher token required.');
      await readBody(req, SMALL_BODY);
      room.hostAction(parts[4]);
      return send(res, 200, { ok: true, phase: room.phase });
    }
    throw new GameError(404, 'not_found', 'Unknown API route.');
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad_path' }); }
    if (p === '/') p = '/index.html';
    if (p.includes('\0') || p.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return send(res, 404, { error: 'not_found' });
    const file = path.resolve(PUBLIC, '.' + p);
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: 'not_found' });
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) return send(res, 404, { error: 'not_found' });
    try {
      const st = await stat(file);
      if (!st.isFile()) return send(res, 404, { error: 'not_found' });
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { send(res, 404, { error: 'not_found' }); }
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'bad_url' }); }
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof GameError) send(res, e.status, { error: e.code, message: e.message });
      else { log('server error', e); if (!res.headersSent) send(res, 500, { error: 'server_error', message: 'Unexpected server error.' }); }
    }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 30_000;
  server.on('close', () => { clearInterval(ticker); clearInterval(sweeper); });
  server.rooms = rooms;
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '0.0.0.0';
  const server = createServer({ port, joinBaseUrl: process.env.JOIN_BASE_URL || '' });
  server.listen(port, host, () => {
    console.log(`\nSuksanari: AFTER HOURS server listening on ${host}:${port}`);
    console.log(`  Teacher (this computer): http://localhost:${port}/host.html`);
    console.log(`  Pack editor:            http://localhost:${port}/editor.html`);
    const lan = lanAddresses();
    if (lan.length) lan.forEach((a) => console.log(`  Phones on the same Wi-Fi may use: http://${a}:${port}/play.html`));
    else console.log('  No LAN address found. Phones cannot reach localhost — connect this computer to the classroom network.');
    console.log('  This is a LAN server only. It is NOT reachable from the internet.\n');
  });
}
