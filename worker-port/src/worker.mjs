import { Room, GameError, makeRoomCode, safeEqual } from './game.mjs';

const SMALL_BODY = 4 * 1024;
const PACK_BODY = Math.floor(3.2 * 1024 * 1024);
const MAX_CONNS = 60;
const MAX_FRAME = 16 * 1024;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;
const STATE_KEY = 'room-state-v1';
const META_KEY = 'room-meta-v1';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});
const errResponse = (e) => e instanceof GameError
  ? json({ error: e.code, message: e.message }, e.status)
  : (console.error(e), json({ error: 'server_error', message: 'Unexpected server error.' }, 500));

async function bodyObject(request, limit) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw new GameError(413, 'too_large', 'Request body too large.');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) throw new GameError(413, 'too_large', 'Request body too large.');
  if (!bytes.byteLength) return {};
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new GameError(400, 'bad_json', 'Body must be a JSON object.'); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/info' && request.method === 'GET') {
        return json({ joinBaseUrl: url.origin, lanAddresses: [], port: 443, cloudflare: true, audio: ['day', 'night'] });
      }
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const payload = await bodyObject(request, PACK_BODY);
        for (let i = 0; i < 8; i++) {
          const code = makeRoomCode();
          const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
          const init = await stub.fetch('https://room.internal/init', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, ...payload })
          });
          if (init.status === 409) continue;
          return new Response(init.body, init);
        }
        throw new GameError(503, 'code_collision', 'Could not allocate a room code. Try again.');
      }
      if (url.pathname === '/ws') {
        const code = (url.searchParams.get('room') || url.searchParams.get('code') || '').toUpperCase();
        if (!/^[A-Z0-9]{5}$/.test(code)) throw new GameError(400, 'bad_room', 'Room code required.');
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
      }
      const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{5})(?:\/|$)/);
      if (m) return env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase())).fetch(request);
      if (url.pathname.startsWith('/api/')) throw new GameError(404, 'not_found', 'Unknown API route.');
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'no-referrer');
      headers.set('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (e) { return errResponse(e); }
  }
};

export class GameRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;
    this.loading = null;
    this.frame = 0;
    this.timer = null;
    this.dirty = false;
    this.lastPersist = 0;
  }

  out = (to, message) => {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (to === 'all' || (to === 'host' && a.role === 'host') || (a.role === 'player' && a.playerId === to)) this.send(ws, text);
    }
    this.dirty = true;
  };

  async load() {
    if (this.room) return this.room;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const state = await this.ctx.storage.get(STATE_KEY);
      if (!state) return null;
      const room = new Room({ code: state.code, pack: state.pack, settings: state.settings, now: Date.now, out: this.out });
      for (const [k, v] of Object.entries(state)) room[k] = v;
      room.now = Date.now; room.out = this.out; room.rng = Math.random;
      room.qById = new Map(room.pack.questions.map((q) => [q.id, q]));
      room.players = room.players instanceof Map ? room.players : new Map(room.players || []);
      room.byNum = room.byNum instanceof Map ? room.byNum : new Map(room.byNum || []);
      room.qstats = room.qstats instanceof Map ? room.qstats : new Map(room.qstats || []);
      if (room.soloRanks && !(room.soloRanks instanceof Map)) room.soloRanks = new Map(room.soloRanks);
      for (const p of room.players.values()) {
        if (!(p.lockerCd instanceof Map)) p.lockerCd = new Map(p.lockerCd || []);
        p.happy ??= 40; p.catFood ??= 0; p.wb ??= null; p.wbCd ??= 0;
        p.karaoke ??= null; p.karaokeAttempted ??= false; p.karaokeResult ??= null; p.karaokeApproachAt ??= null;
        p.station ??= null; p.stationAttempts ??= []; p.passport ??= []; p.passportBonus ??= false;
        p.stats ||= {}; p.stats.fed ??= 0; p.stats.words ??= 0;
        if (p.wb && !(p.wb.done instanceof Map)) p.wb.done = new Map(p.wb.done || []);
      }
      if (room.event) {
        if (!(room.event.claimed instanceof Set)) room.event.claimed = new Set(room.event.claimed || []);
        if (!(room.event.timers instanceof Map)) room.event.timers = new Map(room.event.timers || []);
        if (!(room.event.sung instanceof Map)) room.event.sung = new Map(room.event.sung || []);
      }
      const gap = Math.max(0, Date.now() - Number(room.lastTick || Date.now()));
      if ((room.phase === 'play' || room.phase === 'countdown') && !room.paused) room.gt += gap;
      room.lastTick = Date.now();
      this.room = room;
      return room;
    })();
    try { return await this.loading; } finally { this.loading = null; }
  }

  state() {
    const skip = new Set(['now', 'rng', 'out', 'qById', 'walkable']);
    const state = {};
    for (const [k, v] of Object.entries(this.room)) if (!skip.has(k) && typeof v !== 'function') state[k] = v;
    return state;
  }

  async persist(force = false) {
    if (!this.room || (!force && !this.dirty && Date.now() - this.lastPersist < 1000)) return;
    await this.ctx.storage.put(STATE_KEY, this.state());
    this.lastPersist = Date.now(); this.dirty = false;
    if (this.room.phase === 'play' || this.room.phase === 'countdown') await this.ctx.storage.setAlarm(Date.now() + 10_000);
    else await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, this.room.lastActivity + ROOM_IDLE_MS));
  }

  send(ws, text) {
    try { if (ws.readyState === WebSocket.OPEN && (ws.bufferedAmount || 0) < 512 * 1024) ws.send(text); } catch {}
  }

  ensureTicker() {
    if (this.timer || !this.room) return;
    const step = async () => {
      this.timer = null;
      if (!this.room) return;
      try {
        const now = Date.now();
        for (const ws of this.ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() || {};
          if (!a.role && now - Number(a.connectedAt || now) > 5000) ws.close(1008, 'hello timeout');
        }
        this.room.tick(); this.frame++;
        if (this.frame % 2 === 0) this.broadcastFrame();
        if (this.frame % 20 === 0) this.broadcastHostStats();
        if (this.frame % 20 === 0) await this.persist();
      } catch (e) { console.error('tick', e); }
      const active = this.room.phase === 'play' || this.room.phase === 'countdown';
      if (this.ctx.getWebSockets().length || active) this.timer = setTimeout(step, 50);
      else await this.persist(true);
    };
    this.timer = setTimeout(step, 50);
  }

  broadcastFrame() {
    const snap = JSON.stringify(this.room.snapshot());
    let roster = null;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.rosterV !== this.room.rosterVersion) {
        roster ||= JSON.stringify({ t: 'roster', v: this.room.rosterVersion, list: this.room.roster() });
        this.send(ws, roster); a.rosterV = this.room.rosterVersion; ws.serializeAttachment(a);
      }
      this.send(ws, snap);
    }
  }

  broadcastHostStats() {
    const stats = JSON.stringify(this.room.hostStats());
    for (const ws of this.ctx.getWebSockets()) if ((ws.deserializeAttachment() || {}).role === 'host') this.send(ws, stats);
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/init' && request.method === 'POST') {
        if (await this.ctx.storage.get(META_KEY)) throw new GameError(409, 'exists', 'Room already exists.');
        const b = await bodyObject(request, PACK_BODY);
        const demoBots = b.demo ? Math.max(1, Math.min(20, Number(b.demoBots) || 14)) : 0;
        this.room = new Room({ code: b.code, pack: b.pack, settings: b.settings || {}, now: Date.now, demoBots, practice: b.practice === true, out: this.out });
        await this.ctx.storage.put(META_KEY, { code: b.code, createdAt: Date.now() });
        await this.persist(true);
        this.ensureTicker();
        return json({ code: b.code, hostToken: this.room.hostToken, viewToken: this.room.viewToken, packTitle: this.room.pack.title }, 201);
      }
      const room = await this.load();
      if (!room) throw new GameError(404, 'no_room', 'Room not found. Check the code on the big screen.');
      if (url.pathname === '/ws') return this.upgrade(request);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'api' || parts[1] !== 'rooms') throw new GameError(404, 'not_found', 'Unknown route.');
      if (parts[3] === 'join' && request.method === 'POST') {
        const b = await bodyObject(request, SMALL_BODY);
        const { player, reconnected } = room.join({ callsign: b.callsign, avatar: b.avatar, playerId: b.playerId, secret: b.secret });
        this.dirty = true; await this.persist(true); this.ensureTicker();
        return json({ playerId: player.id, secret: player.secret, num: player.num, callsign: player.callsign, crew: player.crew, avatar: player.avatar, reconnected });
      }
      if (parts[3] === 'host' && request.method === 'POST' && parts[4]) {
        if (!room.isHost(request.headers.get('x-host-token') || '')) throw new GameError(403, 'bad_token', 'Teacher token required.');
        room.hostAction(parts[4], await bodyObject(request, SMALL_BODY));
        this.dirty = true; await this.persist(true); this.ensureTicker();
        return json({ ok: true, phase: room.phase, paused: room.paused });
      }
      if (parts[3] === 'teacher' && request.method === 'GET') {
        const t = request.headers.get('x-view-token') || '', ht = request.headers.get('x-host-token') || '';
        if (!(t && safeEqual(t, room.viewToken)) && !room.isHost(ht)) throw new GameError(403, 'bad_token', 'Teacher view link is not valid.');
        room.touch(); return json({ code: room.code, ...room.teacherView() });
      }
      if (parts[3] === 'check' && request.method === 'GET') {
        if (!room.isHost(request.headers.get('x-host-token') || '')) throw new GameError(403, 'bad_token', 'Teacher token required.');
        return json({ ok: true, phase: room.phase });
      }
      throw new GameError(404, 'not_found', 'Unknown API route.');
    } catch (e) { return errResponse(e); }
  }

  upgrade(request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new GameError(426, 'upgrade_required', 'WebSocket upgrade required.');
    if (this.ctx.getWebSockets().length >= MAX_CONNS) throw new GameError(503, 'busy', 'Too many connections to this room.');
    const pair = new WebSocketPair(); const client = pair[0], server = pair[1];
    server.serializeAttachment({ role: null, playerId: null, rosterV: 0, tokens: 60, last: Date.now(), connectedAt: Date.now() });
    this.ctx.acceptWebSocket(server);
    this.ensureTicker();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const size = typeof raw === 'string' ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
    if (size > MAX_FRAME) return ws.close(1009, 'message too large');
    const room = await this.load(); if (!room) return ws.close(1008, 'room missing');
    const a = ws.deserializeAttachment() || {};
    const now = Date.now(); a.tokens = Math.min(60, Number(a.tokens || 0) + (now - Number(a.last || now)) * 0.06); a.last = now;
    if (a.tokens < 1) { ws.serializeAttachment(a); return; } a.tokens--;
    let m; try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    try {
      if (!a.role) {
        if (m.t !== 'hello') return;
        if (m.role === 'host') {
          if (!room.isHost(String(m.token || ''))) throw new GameError(403, 'bad_token', 'Teacher token is not valid.');
          a.role = 'host';
        } else {
          const p = room.auth(String(m.playerId || ''), String(m.secret || ''));
          for (const other of this.ctx.getWebSockets()) {
            const oa = other.deserializeAttachment() || {};
            if (oa.playerId === p.id && other !== ws) other.close(1000, 'newest tab wins');
          }
          a.role = 'player'; a.playerId = p.id; p.connected = true; p.lastSeen = Date.now(); this.dirty = true;
        }
        ws.serializeAttachment(a);
        const p = a.playerId ? room.players.get(a.playerId) : null;
        this.send(ws, JSON.stringify({ t: 'welcome', role: a.role, code: room.code, you: p ? { n: p.num, name: p.callsign, crew: p.crew, x: p.x, y: p.y, avatar: p.avatar } : null, phase: room.phase, paused: room.paused, results: room.phase === 'results' ? (a.role === 'host' ? room.hostResults() : room.publicResults()) : null, demo: room.demo, practice: room.practice, settings: room.settings, vocab: room.pack.vocab || [] }));
        if (p?.karaoke) room.advanceKaraoke(p);
        if (p && room.karaokeState(p)) this.send(ws, JSON.stringify(room.karaokeState(p)));
        if (p?.pending) room.cancelQuestion(p);
        if (p?.wb) room.endWordGame(p, 'reconnect');
        if (p?.station) room.endStation(p, 'reconnect');
        if (a.role === 'host') this.send(ws, JSON.stringify(room.hostStats()));
        this.ensureTicker(); await this.persist(); return;
      }
      if (a.role === 'player') {
        const p = room.players.get(a.playerId); if (!p) return;
        let reply = null;
        if (m.t === 'pos') reply = room.updatePos(p, { x: Number(m.x), y: Number(m.y), dir: m.d, moving: m.m });
        else if (m.t === 'open') room.openLocker(p, Number(m.l));
        else if (m.t === 'answer') room.answer(p, { nonce: m.nonce, choice: m.c });
        else if (m.t === 'cancel') room.cancelQuestion(p);
        else if (m.t === 'emote') room.emote(p, m.e);
        else if (m.t === 'feed') room.feedKitten(p, m.k);
        else if (m.t === 'wb_open') room.openWordGame(p);
        else if (m.t === 'wb_word') room.wordAnswer(p, { nonce: m.nonce, i: m.i, word: m.w });
        else if (m.t === 'wb_close') room.endWordGame(p, 'closed');
        else if (m.t === 'station_open') room.openStation(p, String(m.kind || ''), m.level);
        else if (m.t === 'station_answer') room.stationAnswer(p, { nonce: m.nonce, i: m.i, choice: m.c });
        else if (m.t === 'station_close') room.endStation(p, 'closed');
        else if (m.t === 'karaoke_open') room.openKaraoke(p);
        else if (m.t === 'karaoke_tap') room.karaokeTap(p, { nonce: m.nonce, lane: m.lane });
        else if (m.t === 'karaoke_close') room.endKaraoke(p, 'closed');
        else if (m.t === 'karaoke_ack') p.karaokeResult = null;
        else if (m.t === 'karaoke_sync' && p.karaoke) this.send(ws, JSON.stringify({ t: 'karaoke_clock', elapsed: room.gt - p.karaoke.start }));
        else if (m.t === 'avatar') room.setAvatar(p, m.a);
        if (reply) this.send(ws, JSON.stringify({ t: 'corr', ...reply }));
        this.dirty = true; this.ensureTicker();
      }
      ws.serializeAttachment(a);
    } catch (e) {
      if (e instanceof GameError) this.send(ws, JSON.stringify({ t: a.role ? 'err' : 'fatal', code: e.code, message: e.message, about: m.t }));
      if (!a.role) ws.close(1008, 'authentication failed');
    }
  }

  async webSocketClose(ws) {
    const room = await this.load(); if (!room) return;
    const a = ws.deserializeAttachment() || {};
    if (a.role === 'player') {
      const p = room.players.get(a.playerId);
      const stillOpen = this.ctx.getWebSockets().some((o) => o !== ws && (o.deserializeAttachment() || {}).playerId === a.playerId);
      if (p && !stillOpen) { p.connected = false; if (p.pending) room.cancelQuestion(p); if (p.wb) room.endWordGame(p, 'left'); if (p.station) room.endStation(p, 'left'); this.dirty = true; }
    }
    await this.persist(true);
  }
  async webSocketError(ws) { await this.webSocketClose(ws); }

  async alarm() {
    const room = await this.load(); if (!room) return;
    if (room.phase === 'play' || room.phase === 'countdown') { this.ensureTicker(); await this.persist(true); return; }
    if (!this.ctx.getWebSockets().length && Date.now() - room.lastActivity >= ROOM_IDLE_MS) {
      this.room = null; await this.ctx.storage.deleteAll(); return;
    }
    await this.ctx.storage.setAlarm(Date.now() + Math.min(5 * 60_000, Math.max(1000, room.lastActivity + ROOM_IDLE_MS - Date.now())));
  }
}
