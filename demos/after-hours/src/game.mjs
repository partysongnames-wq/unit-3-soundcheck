// Real-time game engine for SnR Daywalkers (Suksanari).
// Pure logic, no sockets. The server calls tick() ~20×/s and forwards messages produced via `this.out`.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  LOCKERS, GENERATOR, SPAWNS, ZOMBIE_SPAWNS, SPEED, CREWS, INTERACT_DIST,
  collides, move, path, dist, walkableTiles, isWalkableTile, ROOM_OF, ZONES, inZone, zoneCenter, isStage,
  WORD_DESK, KITTEN_SPAWNS, KITTENS
} from '../public/js/shared/world.js';
import { STARTER_VOCAB } from '../public/js/shared/packs.js';
import { validatePack, publicQuestion } from '../public/js/shared/packs.js';
import { cleanAvatar, randomAvatar, EMOTES } from '../public/js/shared/avatar.js';
import { createBrain, think } from '../public/js/shared/botbrain.js';

export const MAX_PLAYERS = 40;
export const CONNECTED_MS = 30_000;
const CALLSIGN_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,15}$/;
const BLOCKED = /(fuck|shit|bitch|sex|porn|cunt|dick|slut|whore)/i;
const COUNTDOWN_MS = 3500;
const OVERTIME_MS = 60_000;
const ZOMBIFIED_MS = 8000;
const INVULN_MS = 3000;
const BOOTS_MS = 8000;
const SHIELD_MS = 40_000;
const QUESTION_TIMEOUT_MS = 45_000;
const LOCKER_PLAYER_COOLDOWN_MS = 9000;
const LOOSE_FUSE_MS = 35_000;
const MAX_CARRY = 3;
const EVENTS = { lunch: 25_000, karaoke: 30_000, garden: 25_000, pe: 25_000, quiz: 25_000, party: 10_000, rain: 3000, lights: 15_000, golden: 20_000 };
const EVENT_POOL = ['lunch', 'karaoke', 'garden', 'pe', 'quiz', 'party', 'rain'];
const EVENT_TEXT = {
  lunch: '🍜 LUNCH TIME! Get to the CANTEEN for a snack: full power + speed!',
  karaoke: '🎤 KARAOKE HOUR! Stand on the stage in the Karaoke room to sing points for your crew!',
  garden: '🌸 QUIET TIME! Zombies can\'t enter the GARDEN — relax and recharge there.',
  pe: '🏃 PE LESSON! Run into the GYM for free speed boots!',
  quiz: '📚 POP QUIZ! Lockers in the English and Thai rooms give DOUBLE fuses!',
  party: 'ZOMBIE DANCE PARTY! They can\'t chase you — go go go!',
  rain: 'FUSE RAIN! Fuses are falling all over school!',
  lights: 'LIGHTS OUT! Stay close to your crew…', golden: 'GOLDEN LOCKERS! Correct answers give DOUBLE fuses!'
};
const HAPPY_DECAY_PER_S = 100 / 150;
const MAX_CATFOOD = 3;
const KITTEN_NAP_MS = 30_000;
const KITTEN_FOLLOW_MS = 25_000;
const FEED_POINTS = 2;
const WB_MS = 25_000;
const WB_COOLDOWN_MS = 45_000;
const WB_WORDS = 3;

export class GameError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const tok = (n) => randomBytes(n).toString('hex');
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ2346789';
export function makeRoomCode(rng = Math.random) { let s = ''; for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]; return s; }
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function normaliseCallsign(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  return CALLSIGN_RE.test(s) && !BLOCKED.test(s) ? s : null;
}
const clampInt = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const BOT_NAMES = ['Sleepy Ghost', 'Mochi Cat', 'Jelly Bean', 'Star Fox', 'Pudding', 'Comet Kid', 'Lotus Pop', 'Mango Moon', 'Pixel Puff', 'Boba Bat', 'Cloud Nine', 'Sunny Owl', 'Kiwi Spark', 'Taro Cake', 'Nova Bun', 'Peach Fizz'];

export const TEAM_OPTIONS = [0, 2, 3, 4]; // 0 = solo
export const GOAL_OPTIONS = [0, 20, 30, 50, 80];
export function cleanSettings(s = {}) {
  const teams = TEAM_OPTIONS.includes(Number(s.teams)) ? Number(s.teams) : 4;
  const goal = GOAL_OPTIONS.includes(Number(s.goal)) ? Number(s.goal) : 0;
  return { minutes: clampInt(s.minutes, 1, 15, 8), teams, goal, night: s.night === undefined ? true : !!s.night };
}
export const NIGHT_MS = 30_000;
const NIGHT_WARN_MS = 5000;
const ENERGY_DRAIN_PER_S = 100 / 75; // a full power meter lasts ~75 s without answering

export class Room {
  constructor({ code, pack, settings = {}, now = Date.now, rng = Math.random, demoBots = 0, connectedMs = CONNECTED_MS, out = () => {} }) {
    const v = validatePack(pack);
    if (!v.ok) throw new GameError(400, 'bad_pack', `Pack is invalid: ${v.errors.slice(0, 3).join(' ')}`);
    this.code = code; this.hostToken = tok(24);
    this.pack = deepFreeze(JSON.parse(JSON.stringify(v.pack)));
    this.qById = new Map(this.pack.questions.map((q) => [q.id, q]));
    this.now = now; this.rng = rng; this.connectedMs = connectedMs; this.out = out;
    this.settings = cleanSettings(settings);
    this.viewToken = tok(16); // read-only teacher phone view
    this.players = new Map(); this.byNum = new Map(); this.nextNum = 1;
    this.lastActivity = now(); this.lastTick = now();
    this.rosterVersion = 1; this.demo = demoBots > 0;
    this.reset(true);
    for (let i = 0; i < Math.min(demoBots, MAX_PLAYERS); i++) this.addBot(i);
  }

  // ---------------- lifecycle ----------------
  reset(initial = false) {
    this.phase = 'lobby'; this.paused = false; this.gt = 0; // game clock (ms), runs only while playing
    this.endsAt = 0; this.countdownEnds = 0; this.overtime = false;
    this.zombies = []; this.loose = []; this.nextLooseId = 1;
    this.scores = [0, 0, 0, 0];
    this.event = null; this.nextEventAt = 0; this.eventOrder = []; this.night = null; this.nights = []; this.nightWarned = false;
    this.kittens = KITTENS.map((k, i) => ({ id: i, ...k, x: KITTEN_SPAWNS[i][0], y: KITTEN_SPAWNS[i][1], route: [], repathAt: 0, sleepUntil: 0, follow: null, dir: 1 }));
    this.qstats = new Map(); this.feed = []; this.results = null; this.epoch = (this.epoch || 0) + 1;
    if (!initial) {
      for (const p of this.players.values()) this.resetPlayer(p, true);
      this.rosterVersion++;
      this.emitAll({ t: 'phase', phase: 'lobby' });
    }
  }

  resetPlayer(p, respawn) {
    p.fuses = []; p.shieldUntil = 0; p.bootsUntil = 0; p.zombieUntil = 0; p.invulnUntil = 0;
    p.pending = null; p.lockerCd = new Map(); p.emote = null; p.streak = 0;
    p.stats = { answered: 0, correct: 0, delivered: 0, golden: 0, cures: 0, bestStreak: 0 };
    p.score = 0; p.energy = 100; p.happy = 40; p.lastAnswerAt = this.gt || 0; p.catFood = 0; p.wb = null; p.wbCd = 0;
    p.stats.fed = 0; p.stats.words = 0;
    p.queue = this.shuffle(this.pack.questions.map((q) => q.id));
    if (respawn) { const [x, y] = this.spawnPoint(); p.x = x; p.y = y; }
  }

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  spawnPoint() { const s = SPAWNS[Math.floor(this.rng() * SPAWNS.length)]; return [s[0] + (this.rng() - 0.5) * 0.4, s[1] + (this.rng() - 0.5) * 0.4]; }
  isHost(t) { return safeEqual(t, this.hostToken); }
  touch() { this.lastActivity = this.now(); }
  online(p) { return p.bot || (p.connected && this.now() - p.lastSeen < this.connectedMs); }
  emitAll(msg) { this.out('all', msg); }
  emitTo(p, msg) { if (!p.bot) this.out(p.id, msg); }
  emitHost(msg) { this.out('host', msg); }
  pushFeed(text, kind = 'info', crew = null) { this.feed.push({ text, kind, crew, at: this.gt }); if (this.feed.length > 8) this.feed.shift(); this.emitAll({ t: 'feed', text, kind, crew }); }

  // ---------------- players ----------------
  crewSize(c) { let n = 0; for (const p of this.players.values()) if (p.crew === c) n++; return n; }
  get solo() { return this.settings.teams === 0; }
  crewPool() { return CREWS.slice(0, this.solo ? 4 : this.settings.teams); }
  pickCrew() { let best = 0, n = Infinity; for (const c of this.crewPool()) { const k = this.crewSize(c.id); if (k < n) { n = k; best = c.id; } } return best; }
  rebalance() {
    const pool = this.crewPool().map((c) => c.id); let i = 0;
    for (const p of [...this.players.values()].sort((a, b) => a.num - b.num)) p.crew = pool[i++ % pool.length];
    this.rosterVersion++;
  }
  scoreOf(p) { return this.solo ? p.score : this.scores[p.crew]; }

  join({ callsign, avatar, playerId, secret } = {}) {
    this.touch();
    if (playerId !== undefined || secret !== undefined) {
      const p = typeof playerId === 'string' ? this.players.get(playerId) : null;
      if (p && !p.bot && safeEqual(secret, p.secret)) {
        if (avatar) { p.avatar = cleanAvatar(avatar); this.rosterVersion++; }
        p.lastSeen = this.now();
        return { player: p, reconnected: true };
      }
      if (!callsign) throw new GameError(401, 'bad_identity', 'Saved player not found. Join again with a nickname.');
    }
    const name = normaliseCallsign(callsign);
    if (!name) throw new GameError(400, 'bad_callsign', 'Nickname must be 2–16 letters or numbers (not your real name).');
    if (this.players.size >= MAX_PLAYERS) throw new GameError(409, 'room_full', `Room is full (${MAX_PLAYERS} players).`);
    for (const p of this.players.values()) if (p.callsign.toLowerCase() === name.toLowerCase()) throw new GameError(409, 'callsign_taken', 'That nickname is taken. Try another!');
    const p = { id: tok(8), secret: tok(16), num: this.nextNum++, callsign: name, crew: this.pickCrew(), avatar: cleanAvatar(avatar || randomAvatar(this.rng)), bot: false, connected: false, lastSeen: this.now(), dir: 1, moving: false, lastPosAt: this.now() };
    this.resetPlayer(p, true);
    this.players.set(p.id, p); this.byNum.set(p.num, p); this.rosterVersion++;
    return { player: p, reconnected: false };
  }

  addBot(i) {
    const name = `${BOT_NAMES[i % BOT_NAMES.length]}${i >= BOT_NAMES.length ? ' ' + i : ''}`.slice(0, 16);
    const p = { id: tok(8), secret: tok(16), num: this.nextNum++, callsign: name, crew: this.pickCrew(), avatar: randomAvatar(this.rng), bot: true, connected: true, lastSeen: this.now(), dir: 1, moving: false, lastPosAt: this.now(), brain: createBrain(), skill: 0.55 + this.rng() * 0.35, answerAt: 0 };
    this.resetPlayer(p, true);
    this.players.set(p.id, p); this.byNum.set(p.num, p); this.rosterVersion++;
  }

  auth(playerId, secret) {
    const p = typeof playerId === 'string' ? this.players.get(playerId) : null;
    if (!p || p.bot || !safeEqual(secret, p.secret)) throw new GameError(401, 'bad_identity', 'Unknown player. Join again.');
    return p;
  }

  setAvatar(p, avatar) { p.avatar = cleanAvatar(avatar); this.rosterVersion++; }

  speedOf(p) { if (this.isZombie(p)) return SPEED.zombified; if (p.bootsUntil > this.gt) return SPEED.boots; if (p.energy <= 0) return SPEED.sleepy; return SPEED.player; }
  isZombie(p) { return p.zombieUntil > this.gt; }
  busy(p) { return !!(p.pending || p.wb); }

  /** Client-reported movement, validated against speed and walls. Returns a correction or null. */
  updatePos(p, { x, y, dir, moving }) {
    p.lastSeen = this.now();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: p.x, y: p.y };
    if (this.busy(p) || this.paused || this.phase === 'countdown' || this.phase === 'results') {
      if (dist(x, y, p.x, p.y) > 0.05) return { x: p.x, y: p.y }; return null;
    }
    const t = this.now(); const dt = Math.min(0.6, Math.max(0.03, (t - p.lastPosAt) / 1000));
    const max = SPEED.boots * dt * 1.5 + 0.35;
    if (dist(x, y, p.x, p.y) > max || collides(x, y)) return { x: p.x, y: p.y };
    p.x = x; p.y = y; p.lastPosAt = t;
    p.dir = dir === -1 ? -1 : 1; p.moving = !!moving;
    return null;
  }

  emote(p, e) {
    if (!EMOTES.includes(e)) throw new GameError(400, 'bad_emote', 'Unknown emote.');
    if (p.emote && this.now() - p.emote.at < 900) return;
    p.emote = { e, at: this.now() };
  }

  // ---------------- lockers & questions ----------------
  openLocker(p, lockerId) {
    this.touch();
    if (this.phase !== 'play') throw new GameError(409, 'wrong_phase', this.phase === 'lobby' ? 'Lockers open when the game starts!' : 'Lockers are closed right now.');
    if (this.paused) throw new GameError(409, 'paused', 'The game is paused.');
    if (this.isZombie(p)) throw new GameError(409, 'zombified', 'Zombies can\'t open lockers — tag someone or wait it out!');
    if (this.busy(p)) throw new GameError(409, 'already_open', 'You already have a locker open.');
    const l = LOCKERS[lockerId];
    if (!l) throw new GameError(400, 'bad_locker', 'No such locker.');
    if (dist(p.x, p.y, l.x, l.y) > INTERACT_DIST + 0.25) throw new GameError(409, 'too_far', 'Walk up to the locker first.');
    if ((p.lockerCd.get(lockerId) || 0) > this.gt) throw new GameError(409, 'cooldown', 'You just used this locker. Try another one!');
    if (!p.queue.length) p.queue = this.shuffle(this.pack.questions.map((q) => q.id));
    const qid = p.queue.shift();
    p.pending = { qid, nonce: tok(6), lockerId, openedAt: this.gt, epoch: this.epoch };
    p.moving = false;
    const msg = { t: 'q', nonce: p.pending.nonce, locker: lockerId, question: publicQuestion(this.qById.get(qid)), golden: this.event && this.event.kind === 'golden' };
    this.emitTo(p, msg);
    return msg;
  }

  cancelQuestion(p) {
    if (!p.pending) return;
    p.queue.splice(Math.min(2, p.queue.length), 0, p.pending.qid);
    p.lockerCd.set(p.pending.lockerId, this.gt + 2500);
    p.pending = null; p.invulnUntil = Math.max(p.invulnUntil, this.gt + 1500);
  }

  answer(p, { nonce, choice }) {
    this.touch();
    if (!p.pending || typeof nonce !== 'string' || !safeEqual(nonce, p.pending.nonce)) throw new GameError(409, 'stale', 'That question is no longer open.');
    if (this.phase !== 'play') { p.pending = null; throw new GameError(409, 'wrong_phase', 'The round has ended.'); }
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new GameError(400, 'bad_choice', 'Choose A, B, C or D.');
    const q = this.qById.get(p.pending.qid); const lockerId = p.pending.lockerId;
    p.pending = null;
    const correct = choice === q.correct;
    const st = this.qstats.get(q.id) || { n: 0, c: 0 }; st.n++; if (correct) st.c++; this.qstats.set(q.id, st);
    p.stats.answered++; p.lastAnswerAt = this.gt;
    p.energy = Math.min(100, p.energy + (correct ? 45 : 25));
    if (correct) p.happy = Math.min(100, p.happy + 8);
    p.lockerCd.set(lockerId, this.gt + LOCKER_PLAYER_COOLDOWN_MS);
    p.invulnUntil = Math.max(p.invulnUntil, this.gt + 1500);
    let loot = null;
    if (correct) {
      p.stats.correct++; p.streak++; p.stats.bestStreak = Math.max(p.stats.bestStreak, p.streak);
      this.lastLocker = lockerId; loot = this.rollLoot(p); this.lastLocker = undefined;
      if (p.streak > 0 && p.streak % 3 === 0 && p.fuses.length < MAX_CARRY) { p.fuses.push(1); loot.combo = true; }
    } else {
      p.streak = 0;
      p.queue.splice(Math.min(3, p.queue.length), 0, q.id); // try it again a bit later
    }
    const res = { t: 'res', correct, choice, correctIndex: q.correct, explanation: q.explanation, loot, streak: p.streak };
    this.emitTo(p, res);
    if (correct) this.emitAll({ t: 'fx', k: 'loot', n: p.num, item: loot.item });
    return res;
  }

  rollLoot(p) {
    const lr = this.lastLocker !== undefined ? LOCKERS[this.lastLocker] : null;
    const quizRoom = lr && this.event && this.event.kind === 'quiz' && ['ENG', 'THAI'].includes(ROOM_OF[lr.ty][lr.tx]);
    const golden = !!((this.event && this.event.kind === 'golden') || quizRoom);
    const room = MAX_CARRY - p.fuses.length;
    const table = [];
    if (room > 0) table.push(['fuse', 50], ['gold', 9]);
    table.push(['boots', 14], ['shield', 14], ['zap', 13]);
    if (p.catFood < MAX_CATFOOD) table.push(['catfood', 14]);
    let r = this.rng() * table.reduce((s, x) => s + x[1], 0); let item = table[0][0];
    for (const [k, w] of table) { if ((r -= w) <= 0) { item = k; break; } }
    const loot = { item, golden };
    if (this.night && p.fuses.length < MAX_CARRY - (item === 'fuse' || item === 'gold' ? 1 : 0)) { p.fuses.push(1); loot.moon = true; } // night bonus fuse
    if (item === 'fuse') { p.fuses.push(golden ? 2 : 1); }
    else if (item === 'gold') { p.fuses.push(golden ? 4 : 2); p.stats.golden++; }
    else if (item === 'boots') p.bootsUntil = this.gt + BOOTS_MS;
    else if (item === 'catfood') p.catFood = Math.min(MAX_CATFOOD, p.catFood + 1);
    else if (item === 'shield') p.shieldUntil = this.gt + SHIELD_MS;
    else if (item === 'zap') {
      let hit = 0; for (const z of this.zombies) if (dist(z.x, z.y, p.x, p.y) < 6) { z.stunUntil = this.gt + 5000; hit++; }
      loot.hit = hit; this.emitAll({ t: 'fx', k: 'zap', x: p.x, y: p.y });
    }
    return loot;
  }

  // ---------------- host controls ----------------
  hostAction(action, body = {}) {
    this.touch();
    switch (action) {
      case 'settings': {
        if (this.phase !== 'lobby') throw new GameError(409, 'wrong_phase', 'Change the mode in the lobby, before starting.');
        const before = this.settings.teams;
        this.settings = cleanSettings({ ...this.settings, ...(body && typeof body === 'object' ? body : {}) });
        if (before !== this.settings.teams) this.rebalance();
        this.emitAll({ t: 'mode', settings: this.settings });
        break;
      }
      case 'start':
        if (this.phase !== 'lobby') throw new GameError(409, 'wrong_phase', 'Already started.');
        if (this.players.size === 0) throw new GameError(409, 'no_players', 'Wait for at least one player.');
        for (const p of this.players.values()) { this.resetPlayer(p, true); }
        this.phase = 'countdown'; this.countdownEnds = this.gt + COUNTDOWN_MS; this.paused = false;
        this.emitAll({ t: 'phase', phase: 'countdown' });
        break;
      case 'pause': if (this.phase === 'play' || this.phase === 'countdown') { this.paused = true; this.emitAll({ t: 'phase', phase: this.phase, paused: true }); } else throw new GameError(409, 'wrong_phase', 'Nothing to pause.'); break;
      case 'resume': if (this.paused) { this.paused = false; this.lastTick = this.now(); this.emitAll({ t: 'phase', phase: this.phase, paused: false }); } break;
      case 'addtime': if (this.phase !== 'play') throw new GameError(409, 'wrong_phase', 'Only during the game.'); this.endsAt += 60_000; if (this.endsAt - this.gt > OVERTIME_MS) this.overtime = false; break;
      case 'end': if (this.phase === 'play' || this.phase === 'countdown') this.finish(); else throw new GameError(409, 'wrong_phase', 'The game is not running.'); break;
      case 'reset': this.reset(); break;
      default: throw new GameError(400, 'bad_action', 'Unknown action.');
    }
  }

  startPlay() {
    this.phase = 'play';
    this.endsAt = this.gt + this.settings.minutes * 60_000;
    this.nextEventAt = this.gt + 35_000;
    this.eventOrder = this.shuffle([...EVENT_POOL]);
    const n = Math.min(12, 4 + Math.ceil(this.players.size / 5));
    this.zombies = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = ZOMBIE_SPAWNS[i % ZOMBIE_SPAWNS.length];
      this.zombies.push({ id: i, x: x + (this.rng() - 0.5) * 0.5, y, route: [], repathAt: 0, stunUntil: this.gt + 4000 + i * 500, chasing: false, dir: 1 });
    }
    for (const p of this.players.values()) p.invulnUntil = this.gt + 6000; // safe start
    const total = this.settings.minutes * 60_000;
    this.nights = !this.settings.night ? [] : (total >= 3 * 60_000 ? [0.35, 0.7] : [0.35]).map((f) => this.gt + Math.round(total * f));
    this.night = null; this.nightWarned = false;
    this.emitAll({ t: 'phase', phase: 'play' });
    this.pushFeed('The lights are out! Open lockers, find fuses, power the generator!', 'big');
  }

  finish() {
    this.phase = 'results'; this.paused = false;
    for (const p of this.players.values()) { if (p.pending) p.pending = null; p.wb = null; }
    const rank = (arr) => { let place = 0, last = null; arr.forEach((c, i) => { if (c.score !== last) { place = i + 1; last = c.score; } c.place = place; }); return arr; };
    const order = this.solo ? [] : rank(this.crewPool().map((c) => ({ crew: c.id, score: this.scores[c.id], members: this.crewSize(c.id) })).filter((c) => c.members > 0).sort((a, b) => b.score - a.score));
    const solo = this.solo ? rank([...this.players.values()].map((p) => ({ n: p.num, name: p.callsign, score: p.score, crew: p.crew })).sort((a, b) => b.score - a.score)) : [];
    this.soloRanks = new Map(solo.map((x) => [x.n, x.place]));
    let n = 0, c = 0; for (const s of this.qstats.values()) { n += s.n; c += s.c; }
    const perQuestion = this.pack.questions.map((q, i) => { const s = this.qstats.get(q.id) || { n: 0, c: 0 }; return { i, id: q.id, prompt: q.prompt, n: s.n, c: s.c, acc: s.n ? s.c / s.n : null, correct: q.correct, explanation: q.explanation, options: q.options }; });
    const hardest = perQuestion.filter((q) => q.n >= 2).sort((a, b) => a.acc - b.acc).slice(0, 3);
    this.results = { mode: this.settings.teams, crews: order, top: solo.slice(0, 5), answers: n, correct: c, accuracy: n ? c / n : 0, perQuestion: perQuestion.map(({ i, n: nn, acc }) => ({ i, n: nn, acc })), hardest, players: this.players.size };
    this.emitAll({ t: 'phase', phase: 'results' });
    this.emitAll({ t: 'results', results: this.publicResults() });
    this.emitHost({ t: 'results', results: this.hostResults() });
    for (const p of this.players.values()) this.emitTo(p, { t: 'mystats', stats: p.stats, badges: this.badges(p), score: p.score, place: this.solo ? this.soloRanks.get(p.num) : null, of: this.players.size, accuracy: p.stats.answered ? p.stats.correct / p.stats.answered : null });
  }

  hostResults() { return this.results && { ...this.publicResults(), hardest: this.results.hardest }; }
  publicResults() { const r = this.results; return r && { mode: r.mode, top: r.top, crews: r.crews, answers: r.answers, correct: r.correct, accuracy: r.accuracy, perQuestion: r.perQuestion, players: r.players }; }

  badges(p) {
    const s = p.stats; const b = [];
    if (s.answered >= 4 && s.correct / s.answered >= 0.8) b.push({ id: 'sharp', name: 'Sharp Mind', icon: '🧠' });
    if (s.bestStreak >= 3) b.push({ id: 'combo', name: 'Combo Star', icon: '🔥' });
    if (s.delivered >= 5) b.push({ id: 'power', name: 'Power Runner', icon: '⚡' });
    if (s.golden >= 1) b.push({ id: 'gold', name: 'Golden Find', icon: '🌟' });
    if (s.cures >= 1) b.push({ id: 'tag', name: 'Tag Master', icon: '🧟' });
    if (s.fed >= 1) b.push({ id: 'cat', name: 'Cat Friend', icon: '🐱' });
    if (s.words >= 3) b.push({ id: 'words', name: 'Word Wizard', icon: '📝' });
    if (!b.length && s.answered >= 1) b.push({ id: 'brave', name: 'Brave Explorer', icon: '🔦' });
    return b;
  }

  // ---------------- simulation ----------------
  tick() {
    const t = this.now(); const dtMs = Math.min(120, Math.max(0, t - this.lastTick)); this.lastTick = t;
    if (this.paused || this.phase === 'lobby' || this.phase === 'results') { if (this.phase === 'lobby') this.tickBots(dtMs, true); return; }
    this.gt += dtMs;
    if (this.phase === 'countdown') { if (this.gt >= this.countdownEnds) this.startPlay(); return; }
    const dt = dtMs / 1000;
    // questions timing out
    for (const p of this.players.values()) if (p.pending && this.gt - p.pending.openedAt > QUESTION_TIMEOUT_MS) { this.cancelQuestion(p); this.emitTo(p, { t: 'qclose', reason: 'timeout' }); }
    this.tickBots(dtMs, false);
    for (const p of this.players.values()) if (!this.busy(p) && this.online(p)) { const was = p.energy; p.energy = Math.max(0, p.energy - ENERGY_DRAIN_PER_S * dt); if (was > 0 && p.energy === 0) this.emitTo(p, { t: 'sleepy' }); }
    this.tickZombies(dt);
    this.tickTags();
    this.tickItems();
    this.tickEvents();
    this.tickRooms(dt);
    this.tickKittens(dt);
    for (const p of this.players.values()) if (p.wb && this.gt >= p.wb.endsAt) this.endWordGame(p, 'time');
    for (const p of this.players.values()) p.happy = Math.max(0, (p.happy ?? 40) - HAPPY_DECAY_PER_S * dt);
    if (!this.overtime && this.endsAt - this.gt <= OVERTIME_MS) { this.overtime = true; this.pushFeed('FINAL MINUTE — every fuse counts DOUBLE!', 'big'); this.emitAll({ t: 'fx', k: 'overtime' }); }
    if (this.gt >= this.endsAt) this.finish();
  }

  playersInWorld() { return [...this.players.values()].filter((p) => this.online(p)); }

  tickZombies(dt) {
    const party = this.event && this.event.kind === 'party';
    const targets = this.playersInWorld().filter((p) => !this.isZombie(p) && !this.busy(p));
    for (const z of this.zombies) {
      if (party || z.stunUntil > this.gt) { z.chasing = false; continue; }
      let best = null, bd = this.night ? 8.5 : 6.5;
      for (const p of targets) { const d = dist(z.x, z.y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
      z.chasing = !!best;
      if (this.gt >= z.repathAt || (best && !z.route.length)) {
        let gx, gy;
        if (best) { gx = best.x; gy = best.y; z.repathAt = this.gt + 450; }
        else { const tiles = this.walkable || (this.walkable = walkableTiles()); const [tx, ty] = tiles[Math.floor(this.rng() * tiles.length)]; gx = tx + 0.5; gy = ty + 0.5; z.repathAt = this.gt + 4000 + this.rng() * 3000; if (dist(gx, gy, z.x, z.y) > 10) { z.repathAt = 0; continue; } }
        const r = path(z.x, z.y, gx, gy, 600);
        z.route = r ? r.map(([x, y]) => [x + 0.5, y + 0.5]) : [];
      }
      const speed = (z.chasing ? SPEED.zombieChase : SPEED.zombieWander) * (this.night ? 1.18 : this.event && this.event.kind === 'lights' ? 1.1 : 1);
      let tx, ty;
      if (best && bd < 1.2) { tx = best.x; ty = best.y; }
      else if (z.route.length) { [tx, ty] = z.route[0]; if (dist(z.x, z.y, tx, ty) < 0.15) { z.route.shift(); continue; } }
      else continue;
      const d = dist(z.x, z.y, tx, ty) || 1; const step = Math.min(d, speed * dt);
      const [nx, ny] = move(z.x, z.y, (tx - z.x) / d * step, (ty - z.y) / d * step, 0.28);
      if (Math.abs(nx - z.x) > 0.001) z.dir = nx > z.x ? 1 : -1;
      if (this.event && this.event.kind === 'garden' && inZone('garden', nx, ny)) { z.route = []; z.repathAt = 0; continue; }
      z.x = nx; z.y = ny;
    }
  }

  dropFuses(p) {
    for (const v of p.fuses) {
      let x = p.x, y = p.y;
      for (let k = 0; k < 6; k++) { const a = this.rng() * Math.PI * 2, r = 0.5 + this.rng() * 0.9; const cx = p.x + Math.cos(a) * r, cy = p.y + Math.sin(a) * r; if (!collides(cx, cy, 0.2)) { x = cx; y = cy; break; } }
      this.loose.push({ id: this.nextLooseId++, x, y, v, until: this.gt + LOOSE_FUSE_MS, from: p.crew });
    }
    p.fuses = [];
  }

  zombify(p, by) {
    if (p.shieldUntil > this.gt) { p.shieldUntil = 0; p.invulnUntil = this.gt + 1500; this.emitAll({ t: 'fx', k: 'block', n: p.num }); return false; }
    p.zombieUntil = this.gt + ZOMBIFIED_MS; p.invulnUntil = 0; p.streak = p.streak; p.bootsUntil = 0;
    this.dropFuses(p);
    this.emitAll({ t: 'fx', k: 'tag', n: p.num, by });
    return true;
  }

  tickTags() {
    const ps = this.playersInWorld();
    const canBeTagged = (p) => !this.isZombie(p) && !this.busy(p) && p.invulnUntil <= this.gt;
    for (const z of this.zombies) {
      if (z.stunUntil > this.gt || (this.event && this.event.kind === 'party')) continue;
      for (const p of ps) {
        if (!canBeTagged(p) || dist(z.x, z.y, p.x, p.y) > 0.6) continue;
        this.zombify(p, 'zombie'); z.stunUntil = this.gt + 1800;
        break;
      }
    }
    // zombified players pass it on to players from OTHER crews (playground tag)
    for (const zp of ps) {
      if (!this.isZombie(zp)) continue;
      for (const p of ps) {
        if (p === zp || (!this.solo && p.crew === zp.crew) || !canBeTagged(p) || dist(zp.x, zp.y, p.x, p.y) > 0.6) continue;
        if (this.zombify(p, zp.num)) {
          zp.zombieUntil = 0; zp.invulnUntil = this.gt + INVULN_MS; zp.stats.cures++;
          this.emitAll({ t: 'fx', k: 'cure', n: zp.num });
        } else { zp.invulnUntil = this.gt + 600; }
        break;
      }
    }
    for (const p of ps) if (p.zombieUntil && p.zombieUntil <= this.gt && p.zombieUntil > this.gt - 100) { p.invulnUntil = this.gt + INVULN_MS; }
  }

  tickItems() {
    const ps = this.playersInWorld();
    this.loose = this.loose.filter((f) => f.until > this.gt);
    for (const f of this.loose) {
      if (f.taken) continue;
      for (const p of ps) {
        if (this.isZombie(p) || p.fuses.length >= MAX_CARRY || dist(p.x, p.y, f.x, f.y) > 0.75) continue;
        p.fuses.push(f.v); f.taken = true; this.emitAll({ t: 'fx', k: 'pickup', n: p.num }); break;
      }
    }
    this.loose = this.loose.filter((f) => !f.taken);
    for (const p of ps) {
      if (!p.fuses.length || this.isZombie(p) || dist(p.x, p.y, GENERATOR.x, GENERATOR.y) > GENERATOR.r) continue;
      const happyBonus = p.happy >= 70 ? 1 : 0;
      const pts = p.fuses.reduce((s, v) => s + v, 0) * (this.overtime ? 2 : 1) + happyBonus;
      p.happy = Math.min(100, p.happy + 5);
      if (this.solo) p.score += pts; else this.scores[p.crew] += pts;
      p.stats.delivered += pts; p.fuses = [];
      this.emitAll({ t: 'fx', k: 'deliver', n: p.num, crew: p.crew, pts });
      this.pushFeed(this.solo ? `${p.callsign} powered up +${pts}!` : `${p.callsign} powered up +${pts} for Crew ${CREWS[p.crew].name}!`, 'good', p.crew);
      if (this.settings.goal && this.scoreOf(p) >= this.settings.goal && this.phase === 'play') { this.pushFeed(this.solo ? `${p.callsign} reached ${this.settings.goal}!` : `Crew ${CREWS[p.crew].name} reached ${this.settings.goal}!`, 'big', p.crew); this.finish(); return; }
    }
  }

  startEvent(kind) {
    this.event = { kind, endsAt: this.gt + EVENTS[kind], claimed: new Set(), timers: new Map(), sung: new Map() };
    if (kind === 'garden') for (const z of this.zombies) if (inZone('garden', z.x, z.y)) { const [x, y] = ZOMBIE_SPAWNS[z.id % ZOMBIE_SPAWNS.length]; z.x = x; z.y = y; z.route = []; }
  }

  // Timetable room rewards — "be in the right place at the right time"
  tickRooms(dt) {
    const ev = this.event; if (!ev) return;
    for (const p of this.playersInWorld()) {
      const zom = this.isZombie(p);
      if (ev.kind === 'lunch' && !zom && !ev.claimed.has(p.id) && inZone('lunch', p.x, p.y)) {
        ev.claimed.add(p.id); p.catFood = Math.min(MAX_CATFOOD, p.catFood + 1); p.energy = 100; p.bootsUntil = Math.max(p.bootsUntil, this.gt + 5000); p.happy = Math.min(100, p.happy + 30);
        this.emitAll({ t: 'fx', k: 'snack', n: p.num });
      }
      if (ev.kind === 'pe' && !zom && !ev.claimed.has(p.id) && inZone('pe', p.x, p.y)) {
        const t = (ev.timers.get(p.id) || 0) + dt * 1000; ev.timers.set(p.id, t);
        if (t >= 2000) { ev.claimed.add(p.id); p.bootsUntil = Math.max(p.bootsUntil, this.gt + 10_000); p.happy = Math.min(100, p.happy + 25); this.emitAll({ t: 'fx', k: 'pe', n: p.num }); }
      }
      if (ev.kind === 'karaoke' && !zom && isStage(p.x, p.y)) {
        const t = (ev.timers.get(p.id) || 0) + dt * 1000; ev.timers.set(p.id, t);
        const sung = ev.sung.get(p.id) || 0;
        if (t >= 3000 && sung < 4) {
          ev.timers.set(p.id, 0); ev.sung.set(p.id, sung + 1);
          if (this.solo) p.score += 1; else this.scores[p.crew] += 1;
          p.stats.delivered += 1; p.happy = Math.min(100, p.happy + 10); p.emote = { e: 'sing', at: this.now() };
          this.emitAll({ t: 'fx', k: 'sing', n: p.num, crew: p.crew, pts: 1 });
        }
      }
      if (ev.kind === 'garden' && inZone('garden', p.x, p.y)) {
        p.happy = Math.min(100, p.happy + 6 * dt); p.energy = Math.min(100, p.energy + 4 * dt);
        if (zom) p.zombieUntil = Math.max(this.gt, p.zombieUntil - dt * 2000); // turn back 3× faster in the garden
      }
    }
  }

  // ---------------- school kittens ----------------
  feedKitten(p, kid) {
    this.touch();
    if (this.phase !== 'play' || this.paused) throw new GameError(409, 'wrong_phase', 'You can feed kittens during the game.');
    if (this.isZombie(p)) throw new GameError(409, 'zombified', 'Kittens are scared of zombies! Turn back first.');
    const k = this.kittens[Number(kid)]; if (!k) throw new GameError(400, 'bad_kitten', 'No such kitten.');
    if (dist(p.x, p.y, k.x, k.y) > 1.6) throw new GameError(409, 'too_far', 'Get closer to the kitten.');
    if (p.catFood <= 0) throw new GameError(409, 'no_food', 'You need cat food 🐟 — get it from lockers or at lunch time.');
    if (k.sleepUntil > this.gt) throw new GameError(409, 'napping', `${k.name} is full and napping. Try another kitten!`);
    p.catFood--; k.sleepUntil = this.gt + KITTEN_NAP_MS; k.follow = { id: p.id, num: p.num, until: this.gt + KITTEN_FOLLOW_MS };
    if (this.solo) p.score += FEED_POINTS; else this.scores[p.crew] += FEED_POINTS;
    p.stats.delivered += FEED_POINTS; p.stats.fed++; p.happy = Math.min(100, p.happy + 20);
    this.emitAll({ t: 'fx', k: 'purr', n: p.num, crew: p.crew, pts: FEED_POINTS, kitten: k.id });
    this.pushFeed(`${p.callsign} fed ${k.name} the kitten 🐱 +${FEED_POINTS}!`, 'good', p.crew);
    return { ok: true };
  }

  tickKittens(dt) {
    for (const k of this.kittens) {
      let tx = null, ty = null, speed = 1.0;
      if (k.follow) {
        const p = this.players.get(k.follow.id);
        if (!p || this.gt > k.follow.until || !this.online(p)) k.follow = null;
        else { const d = dist(k.x, k.y, p.x, p.y); if (d > 0.9) { tx = p.x - 0.5 * (p.dir || 1); ty = p.y + 0.2; speed = Math.min(6, 2 + d * 1.5); } }
      }
      if (!k.follow && k.sleepUntil <= this.gt) {
        if (!k.route.length && this.gt >= k.repathAt) {
          const home = KITTEN_SPAWNS[k.id];
          const gx = home[0] + (this.rng() - 0.5) * 6, gy = home[1] + (this.rng() - 0.5) * 5;
          if (isWalkableTile(Math.floor(gx), Math.floor(gy))) { const r = path(k.x, k.y, gx, gy, 300); k.route = r ? r.slice(0, 10).map(([x, y]) => [x + 0.5, y + 0.5]) : []; }
          k.repathAt = this.gt + 2500 + this.rng() * 4000;
        }
        if (k.route.length) { [tx, ty] = k.route[0]; if (dist(k.x, k.y, tx, ty) < 0.12) { k.route.shift(); tx = null; } }
      }
      if (tx === null) continue;
      const d = dist(k.x, k.y, tx, ty) || 1; const st = Math.min(d, speed * dt);
      const [nx, ny] = move(k.x, k.y, (tx - k.x) / d * st, (ty - k.y) / d * st, 0.2);
      if (Math.abs(nx - k.x) > 0.001) k.dir = nx > k.x ? 1 : -1;
      k.x = nx; k.y = ny;
    }
  }

  // ---------------- Word Builder (English teacher's desk) ----------------
  wordList() {
    const fromPack = (this.pack.vocab || []).filter((v) => /^[a-z]{3,12}$/i.test(v.word));
    return fromPack.length >= 3 ? fromPack : STARTER_VOCAB;
  }
  openWordGame(p) {
    this.touch();
    if (this.phase !== 'play' || this.paused) throw new GameError(409, 'wrong_phase', 'The word game opens during the game.');
    if (this.isZombie(p)) throw new GameError(409, 'zombified', 'Zombies can\'t spell! Turn back first.');
    if (this.busy(p)) throw new GameError(409, 'already_open', 'Finish what you\'re doing first.');
    if (dist(p.x, p.y, WORD_DESK.x, WORD_DESK.y) > INTERACT_DIST + 0.25) throw new GameError(409, 'too_far', 'Walk up to the teacher\'s desk first.');
    if (p.wbCd > this.gt) throw new GameError(409, 'cooldown', `The word game is resting. Come back in ${Math.ceil((p.wbCd - this.gt) / 1000)} s!`);
    const words = this.shuffle(this.wordList().slice()).slice(0, WB_WORDS);
    const scramble = (w) => { const a = w.toLowerCase().split(''); for (let i = 0; i < 8; i++) { this.shuffle(a); if (a.join('') !== w.toLowerCase()) break; } return a; };
    p.wb = { nonce: tok(6), words: words.map((v) => v.word.toLowerCase()), done: new Map(), endsAt: this.gt + WB_MS, double: !!(this.event && this.event.kind === 'quiz'), points: 0 };
    p.moving = false;
    const msg = { t: 'wb', nonce: p.wb.nonce, ms: WB_MS, double: p.wb.double, items: words.map((v) => ({ clue: v.clue, letters: scramble(v.word), len: v.word.length })) };
    this.emitTo(p, msg);
    return msg;
  }
  wordAnswer(p, { nonce, i, word }) {
    if (!p.wb || typeof nonce !== 'string' || !safeEqual(nonce, p.wb.nonce)) throw new GameError(409, 'stale', 'That word game has finished.');
    const idx = Number(i); if (!Number.isInteger(idx) || idx < 0 || idx >= p.wb.words.length) throw new GameError(400, 'bad_word', 'No such word.');
    if (p.wb.done.has(idx)) throw new GameError(409, 'already_answered', 'You already answered that word.');
    const guess = typeof word === 'string' ? word.trim().toLowerCase().slice(0, 20) : '';
    const answer = p.wb.words[idx]; const ok = guess === answer;
    p.wb.done.set(idx, ok);
    if (ok) {
      const pts = p.wb.double ? 2 : 1; p.wb.points += pts; p.stats.words++;
      if (this.solo) p.score += pts; else this.scores[p.crew] += pts;
      p.stats.delivered += pts; p.happy = Math.min(100, p.happy + 6); p.energy = Math.min(100, p.energy + 10);
    }
    const res = { t: 'wb_res', i: idx, ok, answer };
    this.emitTo(p, res);
    if (p.wb.done.size === p.wb.words.length) this.endWordGame(p, 'done');
    return res;
  }
  endWordGame(p, reason) {
    if (!p.wb) return;
    const pts = p.wb.points; p.wb = null; p.wbCd = this.gt + WB_COOLDOWN_MS; p.invulnUntil = Math.max(p.invulnUntil, this.gt + 1500);
    this.emitTo(p, { t: 'wb_end', reason, points: pts, cooldown: WB_COOLDOWN_MS });
    if (pts) { this.emitAll({ t: 'fx', k: 'words', n: p.num, crew: p.crew, pts }); this.pushFeed(`${p.callsign} spelled words for +${pts} 📝`, 'good', p.crew); }
  }

  tickNight() {
    if (this.night && this.gt >= this.night.endsAt) {
      this.night = null; this.emitAll({ t: 'night', stage: 'end' });
      this.nights = this.nights.filter((t) => t >= this.gt + 15_000); // always some daylight between nights
      this.pushFeed('☀️ Morning! The sun is back.', 'event');
    }
    const next = this.nights[0];
    if (next === undefined || this.night) return;
    if (!this.nightWarned && this.gt >= next - NIGHT_WARN_MS) { this.nightWarned = true; this.emitAll({ t: 'night', stage: 'warn', ms: next - this.gt }); }
    if (this.gt >= next) {
      this.nights.shift(); this.nightWarned = false;
      if (this.event) { this.event = null; this.emitAll({ t: 'event', kind: null }); }
      this.night = { endsAt: this.gt + NIGHT_MS };
      this.emitAll({ t: 'night', stage: 'start', ms: NIGHT_MS });
      this.pushFeed('🌙 NIGHT FALLS! Zombies are faster — but correct answers give a bonus fuse!', 'event');
    }
  }

  tickEvents() {
    this.tickNight();
    if (this.event && this.gt >= this.event.endsAt) { this.event = null; this.emitAll({ t: 'event', kind: null }); }
    const nightSoon = this.night || (this.nights[0] !== undefined && this.nights[0] - this.gt < 20_000);
    if (!this.event && !nightSoon && this.gt >= this.nextEventAt && this.endsAt - this.gt > OVERTIME_MS + 15_000) {
      const kind = this.eventOrder.shift() || 'rain'; if (!this.eventOrder.length) this.eventOrder = this.shuffle([...EVENT_POOL]);
      this.startEvent(kind);
      this.nextEventAt = this.gt + 38_000 + this.rng() * 17_000;
      const label = EVENT_TEXT[kind];
      this.pushFeed(label, 'event');
      this.emitAll({ t: 'event', kind, ms: EVENTS[kind] });
      if (kind === 'rain') {
        const tiles = this.walkable || (this.walkable = walkableTiles());
        for (let i = 0; i < 8; i++) { const [x, y] = tiles[Math.floor(this.rng() * tiles.length)]; this.loose.push({ id: this.nextLooseId++, x: x + 0.5, y: y + 0.5, v: 1, until: this.gt + LOOSE_FUSE_MS, from: null }); }
      }
    }
  }

  tickBots(dtMs, lobby) {
    const dt = dtMs / 1000;
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      if (p.pending) {
        if (this.gt >= p.answerAt) { const q = this.qById.get(p.pending.qid); const ch = this.rng() < p.skill ? q.correct : (q.correct + 1 + Math.floor(this.rng() * 3)) % 4; try { this.answer(p, { nonce: p.pending.nonce, choice: ch }); } catch { p.pending = null; } }
        continue;
      }
      const lockerReady = (id) => (p.lockerCd.get(id) || 0) <= this.gt;
      const d = think(p.brain, { x: p.x, y: p.y, fuses: lobby ? 0 : p.fuses.length, zombified: this.isZombie(p) }, { now: this.now(), zombies: this.zombies, lockerReady, eventGoal: !lobby && this.event && ZONES[this.event.kind] && p.num % 2 === 0 ? (this.event.kind === 'karaoke' ? [37.5, 15] : zoneCenter(this.event.kind)) : null }, this.rng);
      const sp = this.speedOf(p) * dt * (lobby ? 0.5 : 0.9);
      const [nx, ny] = move(p.x, p.y, d.dx * sp, d.dy * sp);
      p.moving = Math.hypot(nx - p.x, ny - p.y) > 0.001; if (Math.abs(nx - p.x) > 0.001) p.dir = nx > p.x ? 1 : -1;
      p.x = nx; p.y = ny;
      if (!lobby && d.atLocker !== null && !this.isZombie(p)) {
        try { this.openLocker(p, d.atLocker); p.answerAt = this.gt + 2500 + this.rng() * 4000; } catch { /* cooldown etc. */ }
      }
      if (!lobby && p.catFood > 0) for (const k of this.kittens) if (k.sleepUntil <= this.gt && dist(p.x, p.y, k.x, k.y) < 1.4) { try { this.feedKitten(p, k.id); } catch { /* not now */ } break; }
      if (lobby && this.rng() < 0.002) p.emote = { e: EMOTES[Math.floor(this.rng() * EMOTES.length)], at: this.now() };
    }
  }

  // ---------------- views ----------------
  roster() {
    return [...this.players.values()].map((p) => ({ n: p.num, name: p.callsign, crew: p.crew, avatar: p.avatar, bot: p.bot }));
  }

  /** Compact world snapshot broadcast ~10×/s. Contains no answers. */
  snapshot() {
    const now = this.now(); const g = this.gt;
    const ps = [];
    for (const p of this.players.values()) {
      if (!this.online(p)) continue;
      let f = 0;
      if (p.moving) f |= 1; if (p.dir < 0) f |= 2; if (this.isZombie(p)) f |= 4; if (p.shieldUntil > g) f |= 8;
      if (p.bootsUntil > g) f |= 16; if (this.busy(p)) f |= 32; if (p.invulnUntil > g) f |= 64; if (p.fuses.some((v) => v >= 2)) f |= 128; if (p.energy <= 0) f |= 256;
      const em = p.emote && now - p.emote.at < 2500 ? p.emote.e : 0;
      ps.push([p.num, Math.round(p.x * 100), Math.round(p.y * 100), f, p.fuses.length, em, p.score, Math.round(p.energy), Math.round(p.happy), p.catFood]);
    }
    return {
      t: 's', ph: this.phase, pa: this.paused ? 1 : 0, rv: this.rosterVersion, md: this.settings.teams, gl: this.settings.goal,
      tl: this.phase === 'play' ? Math.max(0, this.endsAt - g) : this.phase === 'countdown' ? Math.max(0, this.countdownEnds - g) : 0,
      ot: this.overtime ? 1 : 0, nt: this.night ? Math.max(0, this.night.endsAt - g) : 0, ev: this.event ? [this.event.kind, Math.max(0, this.event.endsAt - g)] : 0,
      sc: this.scores, p: ps,
      k: this.kittens.map((k) => [Math.round(k.x * 100), Math.round(k.y * 100), (k.sleepUntil > g ? 1 : 0) | (k.follow ? 2 : 0) | (k.dir < 0 ? 4 : 0), k.follow ? k.follow.num : 0]),
      z: this.zombies.map((z) => [Math.round(z.x * 100), Math.round(z.y * 100), (z.chasing ? 1 : 0) | (z.stunUntil > g ? 2 : 0) | (z.dir < 0 ? 4 : 0)]),
      f: this.loose.map((f) => [f.id, Math.round(f.x * 100), Math.round(f.y * 100), f.v])
    };
  }

  hostStats() {
    let n = 0, c = 0; for (const s of this.qstats.values()) { n += s.n; c += s.c; }
    const crews = CREWS.map((cr) => ({ id: cr.id, members: this.crewSize(cr.id), online: [...this.players.values()].filter((p) => p.crew === cr.id && this.online(p)).length }));
    const hardest = this.pack.questions.map((q, i) => { const s = this.qstats.get(q.id) || { n: 0, c: 0 }; return { i, n: s.n, acc: s.n ? s.c / s.n : null }; }).filter((x) => x.n >= 2).sort((a, b) => a.acc - b.acc).slice(0, 3);
    const idle = this.phase === 'play' ? [...this.players.values()].filter((p) => this.online(p) && !p.pending && this.gt - p.lastAnswerAt > 60_000).length : 0;
    return { t: 'stats', answers: n, correct: c, accuracy: n ? c / n : null, players: this.players.size, crews, hardest, settings: this.settings, idle, demo: this.demo, packTitle: this.pack.title, questions: this.pack.questions.length };
  }
}

Room.prototype.teacherView = function teacherView() {
  const list = [...this.players.values()].map((p) => ({
    name: p.callsign, crew: p.crew, online: this.online(p), bot: p.bot,
    answered: p.stats.answered, correct: p.stats.correct, delivered: p.stats.delivered,
    sinceAnswerS: this.phase === 'play' ? Math.round((this.gt - p.lastAnswerAt) / 1000) : null,
    status: !this.online(p) ? 'offline' : p.pending ? 'answering' : p.wb ? 'word game' : this.isZombie(p) ? 'zombie' : p.energy <= 0 ? 'sleepy' : 'exploring'
  }));
  list.sort((a, b) => (b.sinceAnswerS ?? 0) - (a.sinceAnswerS ?? 0) || a.answered - b.answered);
  let n = 0, c = 0; for (const s of this.qstats.values()) { n += s.n; c += s.c; }
  return { phase: this.phase, paused: this.paused, timeLeft: this.phase === 'play' ? Math.max(0, this.endsAt - this.gt) : 0, settings: this.settings, answers: n, accuracy: n ? c / n : null, players: list,
    questions: this.pack.questions.map((q, i) => { const s = this.qstats.get(q.id) || { n: 0, c: 0 }; return { i, prompt: q.prompt, n: s.n, acc: s.n ? s.c / s.n : null }; }) };
};

function deepFreeze(o) { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; }
export { isWalkableTile };
