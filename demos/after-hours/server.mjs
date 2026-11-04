// Suksanari: AFTER HOURS — Night Crew. Authoritative LAN game server (Node ESM, zero dependencies).
// Usage: node server.mjs   (env: PORT=8787 HOST=0.0.0.0 JOIN_BASE_URL=http://192.168.1.20:8787)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room, GameError, makeRoomCode } from './src/game.mjs';
import { acceptUpgrade } from './src/ws.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MAX_ROOMS = 12;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;
const MAX_CONNS_PER_ROOM = 60;
const SMALL_BODY = 4 * 1024;
const PACK_BODY = 3.2 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

export function createServer({ port = 8787, joinBaseUrl = '', now = Date.now, log = console.log, connectedMs, tickMs = 50 } = {}) {
  const rooms = new Map(); // code -> { room, conns:Set }

  function makeOut(entry) {
    return (to, msg) => {
      const s = JSON.stringify(msg);
      for (const c of entry.conns) {
        if (to === 'all' || (to === 'host' && c.role === 'host') || (c.role === 'player' && c.playerId === to)) safeSend(c, s);
      }
    };
  }
  function safeSend(c, s, droppable = false) {
    if (!c.ws.open) return;
    if (droppable && c.ws.buffered > 256 * 1024) return; // slow phone: skip a world frame instead of queueing
    c.ws.send(s);
  }

  let frame = 0;
  const ticker = setInterval(() => {
    frame++;
    for (const [code, e] of rooms) {
      try {
        e.room.tick();
        if (frame % 2 === 0) {
          const snap = JSON.stringify(e.room.snapshot());
          let roster = null;
          for (const c of e.conns) {
            if (c.rosterV !== e.room.rosterVersion) { roster = roster || JSON.stringify({ t: 'roster', v: e.room.rosterVersion, list: e.room.roster() }); safeSend(c, roster); c.rosterV = e.room.rosterVersion; }
            safeSend(c, snap, true);
          }
        }
        if (frame % 20 === 0) { const st = JSON.stringify(e.room.hostStats()); for (const c of e.conns) if (c.role === 'host') safeSend(c, st); }
        if (now() - e.room.lastActivity > ROOM_IDLE_MS && !e.conns.size) rooms.delete(code);
      } catch (err) { log('tick error', err); }
    }
  }, tickMs);

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      if (Number(req.headers['content-length'] || 0) > limit) { reject(new GameError(413, 'too_large', 'Request body too large.')); req.resume(); return; }
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > limit) { reject(new GameError(413, 'too_large', 'Request body too large.')); req.destroy(); return; } chunks.push(c); });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(); resolve(v); }
        catch { reject(new GameError(400, 'bad_json', 'Body must be a JSON object.')); }
      });
      req.on('error', reject);
    });
  }
  function getEntry(code) {
    const e = typeof code === 'string' ? rooms.get(code.toUpperCase()) : null;
    if (!e) throw new GameError(404, 'no_room', 'Room not found. Check the code on the big screen.');
    return e;
  }

  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[1] === 'info' && req.method === 'GET') {
      const p = server.address()?.port || port; const lan = lanAddresses();
      return send(res, 200, { joinBaseUrl: joinBaseUrl || (lan[0] ? `http://${lan[0]}:${p}` : ''), lanAddresses: lan.map((a) => `http://${a}:${p}`), port: p });
    }
    if (parts[1] !== 'rooms') throw new GameError(404, 'not_found', 'Unknown API route.');
    if (parts.length === 2 && req.method === 'POST') {
      for (const [c, e] of rooms) if (now() - e.room.lastActivity > ROOM_IDLE_MS) rooms.delete(c);
      if (rooms.size >= MAX_ROOMS) throw new GameError(503, 'too_many_rooms', 'Too many rooms on this server. Restart it or wait for old rooms to expire.');
      const body = await readBody(req, PACK_BODY);
      let code; do { code = makeRoomCode(); } while (rooms.has(code));
      const entry = { conns: new Set() };
      const demoBots = body.demo ? Math.max(1, Math.min(20, Number(body.demoBots) || 14)) : 0;
      entry.room = new Room({ code, pack: body.pack, settings: body.settings || {}, now, demoBots, out: makeOut(entry), ...(connectedMs ? { connectedMs } : {}) });
      rooms.set(code, entry);
      log(`room ${code} created (${entry.room.pack.questions.length} questions${demoBots ? `, DEMO ${demoBots} bots` : ''})`);
      return send(res, 201, { code, hostToken: entry.room.hostToken, packTitle: entry.room.pack.title });
    }
    const entry = getEntry(parts[2]); const room = entry.room;
    if (parts[3] === 'join' && req.method === 'POST') {
      const b = await readBody(req, SMALL_BODY);
      const { player, reconnected } = room.join({ callsign: b.callsign, avatar: b.avatar, playerId: b.playerId, secret: b.secret });
      return send(res, 200, { playerId: player.id, secret: player.secret, num: player.num, callsign: player.callsign, crew: player.crew, avatar: player.avatar, reconnected });
    }
    if (parts[3] === 'host' && req.method === 'POST' && parts[4]) {
      if (!room.isHost(String(req.headers['x-host-token'] || ''))) throw new GameError(403, 'bad_token', 'Teacher token required.');
      await readBody(req, SMALL_BODY);
      room.hostAction(parts[4]);
      return send(res, 200, { ok: true, phase: room.phase, paused: room.paused });
    }
    if (parts[3] === 'check' && req.method === 'GET') {
      if (!room.isHost(String(req.headers['x-host-token'] || ''))) throw new GameError(403, 'bad_token', 'Teacher token required.');
      return send(res, 200, { ok: true, phase: room.phase });
    }
    throw new GameError(404, 'not_found', 'Unknown API route.');
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
    let p; try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad_path' }); }
    if (p === '/') p = '/index.html';
    if (p.includes('\0') || p.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return send(res, 404, { error: 'not_found' });
    const file = path.resolve(PUBLIC, '.' + p);
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: 'not_found' });
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) return send(res, 404, { error: 'not_found' });
    try {
      const st = await stat(file); if (!st.isFile()) return send(res, 404, { error: 'not_found' });
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { send(res, 404, { error: 'not_found' }); }
  }

  const server = http.createServer(async (req, res) => {
    let url; try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'bad_url' }); }
    try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else await serveStatic(req, res, url); }
    catch (e) {
      if (e instanceof GameError) send(res, e.status, { error: e.code, message: e.message });
      else { log('server error', e); if (!res.headersSent) send(res, 500, { error: 'server_error', message: 'Unexpected server error.' }); }
    }
  });

  // ---------------- WebSocket: real-time play ----------------
  server.on('upgrade', (req, socket) => {
    let url; try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    if (url.pathname !== '/ws') { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    const ws = acceptUpgrade(req, socket); if (!ws) return;
    const c = { ws, role: null, playerId: null, entry: null, rosterV: 0, tokens: 60, last: Date.now() };
    const hello = setTimeout(() => { if (!c.role) ws.close(); }, 5000);
    const reply = (msg) => safeSend(c, JSON.stringify(msg));
    ws.on('message', (raw) => {
      const t = Date.now(); c.tokens = Math.min(60, c.tokens + (t - c.last) * 0.06); c.last = t;
      if (c.tokens < 1) return; c.tokens--;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      try {
        if (!c.role) return handleHello(c, m, hello, reply);
        const room = c.entry.room;
        if (c.role === 'player') {
          const p = room.players.get(c.playerId); if (!p) return;
          if (m.t === 'pos') { const corr = room.updatePos(p, { x: Number(m.x), y: Number(m.y), dir: m.d, moving: m.m }); if (corr) reply({ t: 'corr', ...corr }); }
          else if (m.t === 'open') room.openLocker(p, Number(m.l));
          else if (m.t === 'answer') room.answer(p, { nonce: m.nonce, choice: m.c });
          else if (m.t === 'cancel') room.cancelQuestion(p);
          else if (m.t === 'emote') room.emote(p, m.e);
          else if (m.t === 'avatar') room.setAvatar(p, m.a);
        }
      } catch (e) {
        if (e instanceof GameError) reply({ t: 'err', code: e.code, message: e.message, about: m.t });
        else log('ws error', e);
      }
    });
    ws.on('close', () => {
      clearTimeout(hello);
      if (c.entry) {
        c.entry.conns.delete(c);
        if (c.role === 'player') { const p = c.entry.room.players.get(c.playerId); if (p && ![...c.entry.conns].some((o) => o.playerId === p.id)) { p.connected = false; if (p.pending) c.entry.room.cancelQuestion(p); } }
      }
    });
  });

  function handleHello(c, m, hello, reply) {
    if (m.t !== 'hello') return;
    let entry; try { entry = getEntry(String(m.code || '')); } catch (e) { reply({ t: 'fatal', code: e.code, message: e.message }); c.ws.close(); return; }
    if (entry.conns.size >= MAX_CONNS_PER_ROOM) { reply({ t: 'fatal', code: 'busy', message: 'Too many connections to this room.' }); c.ws.close(); return; }
    const room = entry.room;
    if (m.role === 'host') {
      if (!room.isHost(String(m.token || ''))) { reply({ t: 'fatal', code: 'bad_token', message: 'Teacher token is not valid.' }); c.ws.close(); return; }
      c.role = 'host';
    } else {
      let p; try { p = room.auth(String(m.playerId || ''), String(m.secret || '')); } catch (e) { reply({ t: 'fatal', code: e.code, message: e.message }); c.ws.close(); return; }
      for (const o of entry.conns) if (o.playerId === p.id) o.ws.close(); // newest tab wins
      c.role = 'player'; c.playerId = p.id; p.connected = true; p.lastSeen = now();
    }
    clearTimeout(hello);
    c.entry = entry; entry.conns.add(c);
    const p = c.playerId ? room.players.get(c.playerId) : null;
    reply({ t: 'welcome', role: c.role, code: room.code, you: p ? { n: p.num, name: p.callsign, crew: p.crew, x: p.x, y: p.y, avatar: p.avatar } : null, phase: room.phase, paused: room.paused, results: room.phase === 'results' ? (c.role === 'host' ? room.hostResults() : room.publicResults()) : null, demo: room.demo, minutes: room.settings.minutes });
    if (p && p.pending) room.cancelQuestion(p);
    if (c.role === 'host') reply(room.hostStats());
  }

  server.on('close', () => clearInterval(ticker));
  server.rooms = rooms;
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT || 8787); const host = process.env.HOST || '0.0.0.0';
  const server = createServer({ port, joinBaseUrl: process.env.JOIN_BASE_URL || '' });
  server.listen(port, host, () => {
    console.log(`\nSuksanari: AFTER HOURS — Night Crew. Server on ${host}:${port}`);
    console.log(`  Teacher (this computer): http://localhost:${port}/host.html`);
    console.log(`  Question pack editor:   http://localhost:${port}/editor.html`);
    const lan = lanAddresses();
    if (lan.length) lan.forEach((a) => console.log(`  Phones on the same Wi-Fi: http://${a}:${port}/play.html`));
    else console.log('  No network address found. Phones cannot reach "localhost" — connect this computer to the classroom Wi-Fi.');
    console.log('  LAN only — not reachable from the internet.\n');
  });
}
