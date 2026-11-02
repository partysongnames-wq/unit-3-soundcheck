// Authoritative game engine for Suksanari: AFTER HOURS.
// Pure logic: no I/O. The server wraps this with HTTP; tests drive it directly.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  NODES, CREWS, FUSE_START, ZOMBIE_SPAWNS, COSTS, BARRICADE_ROUNDS, CORNER_MAX_ROUNDS,
  MAX_HORDES, edgeKey, neighbours, fusesNeeded
} from '../public/js/shared/map-data.js';
import { validatePack, publicQuestion } from '../public/js/shared/packs.js';

export const MAX_PLAYERS = 40;
export const PHASES = ['lobby', 'question', 'reveal', 'vote', 'resolve', 'extraction', 'debrief'];
export const CONNECTED_MS = 30_000;
const CALLSIGN_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,15}$/;
const BLOCKED_WORDS = /(fuck|shit|bitch|sex|porn|cunt|dick)/i;
const EXTRACTION_MS = 11_000;
const AUTO_REVEAL_MS = 16_000;
const AUTO_RESOLVE_MS = 8_000;

export class GameError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const token = (bytes) => randomBytes(bytes).toString('hex');
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ2346789';
export function makeRoomCode(rng = Math.random) {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return s;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function normaliseCallsign(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!CALLSIGN_RE.test(s) || BLOCKED_WORDS.test(s)) return null;
  return s;
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};

export class Room {
  /**
   * @param {object} opts { code, pack, settings, now, rng, demoBots }
   */
  constructor({ code, pack, settings = {}, now = Date.now, rng = Math.random, demoBots = 0, connectedMs = CONNECTED_MS }) {
    const v = validatePack(pack);
    if (!v.ok) throw new GameError(400, 'bad_pack', `Pack is invalid: ${v.errors.slice(0, 3).join(' ')}`);
    this.code = code;
    this.hostToken = token(24);
    // Snapshot: deep copy & freeze so editor changes can never mutate a running room.
    this.pack = deepFreeze(JSON.parse(JSON.stringify(v.pack)));
    this.now = now; this.rng = rng; this.connectedMs = connectedMs;
    this.settings = {
      questionSeconds: clampInt(settings.questionSeconds, 15, 120, 40),
      voteSeconds: clampInt(settings.voteSeconds, 10, 60, 20),
      autoAdvance: !!settings.autoAdvance
    };
    this.createdAt = now(); this.lastActivity = now();
    this.players = new Map();
    this.version = 1; this.epoch = 1;
    this.waiters = new Set();
    this.demo = demoBots > 0;
    this.connectedSig = '';
    this.resetMission();
    for (let i = 0; i < Math.min(demoBots, MAX_PLAYERS); i++) this.addBot(i);
  }

  // ---------- lifecycle ----------
  resetMission() {
    this.phase = 'lobby';
    this.paused = false; this.pausedRemaining = null;
    this.roundIndex = -1; this.deadline = null; this.phaseStartedAt = this.now();
    this.answers = new Map(); this.eligible = new Set(); this.votes = new Map();
    this.crewOptions = []; this.results = []; this.lastReveal = null;
    this.mission = null; this.summary = null; this.eventSeq = 0;
  }

  get roundId() { return `e${this.epoch}r${this.roundIndex}`; }
  get totalRounds() { return this.pack.questions.length; }
  touch() { this.lastActivity = this.now(); }
  // Version bump; waiting long-polls are released in a batch (at most every 150 ms) to bound traffic.
  bump() {
    this.version++;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const ws = [...this.waiters]; this.waiters.clear();
      for (const w of ws) w();
    }, 150);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  isHost(t) { return safeEqual(t, this.hostToken); }

  isConnected(p) { return p.bot || (this.now() - p.lastSeen) < this.connectedMs; }

  crewMembers(c) { return [...this.players.values()].filter((p) => p.crew === c); }

  activeCrewIds() {
    if (this.mission) return this.mission.crews.filter((c) => c.active).map((c) => c.id);
    return CREWS.map((c) => c.id).filter((id) => this.crewMembers(id).length > 0);
  }

  pickCrew() {
    let pool = CREWS.map((c) => c.id);
    if (this.mission) {
      const act = this.mission.crews.filter((c) => c.active).map((c) => c.id);
      if (act.length) pool = act;
    }
    let best = pool[0]; let bestN = Infinity;
    for (const id of pool) {
      const n = this.crewMembers(id).length;
      if (n < bestN) { best = id; bestN = n; }
    }
    return best;
  }

  // ---------- players ----------
  join({ callsign, playerId, secret } = {}) {
    this.touch();
    if (playerId !== undefined || secret !== undefined) {
      const p = typeof playerId === 'string' ? this.players.get(playerId) : null;
      if (p && !p.bot && safeEqual(secret, p.secret)) {
        p.lastSeen = this.now();
        this.bump();
        return { player: p, reconnected: true };
      }
      if (!callsign) throw new GameError(401, 'bad_identity', 'Saved identity not recognised. Join again with a callsign.');
    }
    const name = normaliseCallsign(callsign);
    if (!name) throw new GameError(400, 'bad_callsign', 'Callsign must be 2-16 letters/numbers (no real names).');
    const humans = [...this.players.values()];
    if (humans.length >= MAX_PLAYERS) throw new GameError(409, 'room_full', `Room is full (${MAX_PLAYERS} players).`);
    if (humans.some((p) => p.callsign.toLowerCase() === name.toLowerCase())) {
      throw new GameError(409, 'callsign_taken', 'That callsign is taken. Try another.');
    }
    const p = {
      id: token(8), secret: token(16), callsign: name, crew: this.pickCrew(),
      joinedAt: this.now(), lastSeen: this.now(), bot: false
    };
    this.players.set(p.id, p);
    // Late join during a question: you may answer it, and you count from now on.
    if (this.phase === 'question') this.eligible.add(p.id);
    this.bump();
    return { player: p, reconnected: false };
  }

  addBot(i) {
    const p = {
      id: token(8), secret: token(16), callsign: `DEMO-${String(i + 1).padStart(2, '0')}`,
      crew: this.pickCrew(), joinedAt: this.now(), lastSeen: this.now(), bot: true,
      skill: 0.45 + this.rng() * 0.45, delay: 0
    };
    this.players.set(p.id, p);
  }

  authPlayer(playerId, secret) {
    const p = typeof playerId === 'string' ? this.players.get(playerId) : null;
    if (!p || p.bot || !safeEqual(secret, p.secret)) throw new GameError(401, 'bad_identity', 'Unknown player. Rejoin the room.');
    p.lastSeen = this.now();
    return p;
  }

  seen(p) { p.lastSeen = this.now(); }

  // ---------- answers & votes ----------
  submitAnswer(p, { roundId, choice }) {
    this.touch();
    if (this.phase !== 'question') throw new GameError(409, 'wrong_phase', 'Answers are closed right now.');
    if (roundId !== this.roundId) throw new GameError(409, 'stale_round', 'That question has already finished.');
    if (this.paused) throw new GameError(409, 'paused', 'The game is paused.');
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new GameError(400, 'bad_choice', 'Choose A, B, C or D.');
    if (this.answers.has(p.id)) {
      if (this.answers.get(p.id) === choice) return { duplicate: true, choice };
      throw new GameError(409, 'already_answered', 'Your answer is already locked in.');
    }
    this.eligible.add(p.id);
    this.answers.set(p.id, choice);
    this.bump();
    this.checkAllAnswered();
    return { duplicate: false, choice };
  }

  submitVote(p, { roundId, option }) {
    this.touch();
    if (this.phase !== 'vote') throw new GameError(409, 'wrong_phase', 'Voting is closed right now.');
    if (roundId !== this.roundId) throw new GameError(409, 'stale_round', 'That vote has already finished.');
    if (this.paused) throw new GameError(409, 'paused', 'The game is paused.');
    const crew = this.mission.crews[p.crew];
    if (!crew || !crew.active) throw new GameError(409, 'no_crew', 'Your crew is not on the map this mission.');
    const opts = this.crewOptions[p.crew] || [];
    const opt = opts.find((o) => o.id === option);
    if (!opt) throw new GameError(400, 'bad_option', 'That action is not available.');
    if (!opt.affordable) throw new GameError(409, 'unaffordable', 'Your crew does not have enough power cells for that.');
    this.votes.set(p.id, option);
    this.bump();
    this.checkAllVoted();
    return { option };
  }

  connectedEligible() {
    return [...this.eligible].map((id) => this.players.get(id)).filter((p) => p && this.isConnected(p));
  }

  checkAllAnswered() {
    if (this.phase !== 'question' || this.paused) return;
    const pending = this.connectedEligible().filter((p) => !this.answers.has(p.id));
    if (this.answers.size > 0 && pending.length === 0) this.closeQuestion('all_answered');
  }

  checkAllVoted() {
    if (this.phase !== 'vote' || this.paused) return;
    const voters = [...this.players.values()].filter((p) => this.isConnected(p) && this.mission.crews[p.crew]?.active);
    if (voters.length > 0 && voters.every((p) => this.votes.has(p.id))) this.closeVote('all_voted');
  }

  // ---------- host controls ----------
  hostAction(action) {
    this.touch();
    switch (action) {
      case 'start':
        if (this.phase !== 'lobby') throw new GameError(409, 'wrong_phase', 'Mission already started.');
        if (this.players.size === 0) throw new GameError(409, 'no_players', 'Wait for at least one player to join.');
        this.startMission();
        this.openQuestion(0);
        break;
      case 'reveal':
        if (this.phase !== 'question') throw new GameError(409, 'wrong_phase', 'Reveal only works during a question.');
        this.closeQuestion('teacher');
        break;
      case 'next':
        if (this.phase === 'question') this.closeQuestion('teacher');
        else if (this.phase === 'reveal') this.openVote();
        else if (this.phase === 'vote') this.closeVote('teacher');
        else if (this.phase === 'resolve') this.afterResolve();
        else if (this.phase === 'extraction') this.toDebrief();
        else throw new GameError(409, 'wrong_phase', 'Nothing to advance.');
        break;
      case 'pause':
        if (this.paused) return;
        if (['lobby', 'debrief'].includes(this.phase)) throw new GameError(409, 'wrong_phase', 'Nothing to pause.');
        this.paused = true;
        this.pausedRemaining = this.deadline ? Math.max(0, this.deadline - this.now()) : null;
        this.deadline = null;
        break;
      case 'resume':
        if (!this.paused) return;
        this.paused = false;
        if (this.pausedRemaining !== null) this.deadline = this.now() + Math.max(3000, this.pausedRemaining);
        else this.phaseStartedAt = this.now();
        this.pausedRemaining = null;
        break;
      case 'end':
        if (this.phase === 'lobby') throw new GameError(409, 'wrong_phase', 'Mission has not started.');
        if (this.phase === 'extraction' || this.phase === 'debrief') return;
        if (this.phase === 'question') this.closeQuestion('teacher', true);
        this.paused = false;
        this.toExtraction();
        break;
      case 'reset':
        this.epoch++;
        this.resetMission();
        break;
      default:
        throw new GameError(400, 'bad_action', 'Unknown action.');
    }
    this.bump();
  }

  // ---------- mission ----------
  startMission() {
    const crews = CREWS.map((c) => {
      const members = this.crewMembers(c.id).length;
      return { id: c.id, node: c.start, energy: 1, carrying: false, cornered: false, corneredRounds: 0, active: members > 0, atGate: false };
    });
    // Too few players for some crews? Rebalance so every player is in an active crew.
    const active = crews.filter((c) => c.active).length;
    this.mission = {
      crews,
      fuses: { ...FUSE_START },
      installed: 0,
      needed: fusesNeeded(this.totalRounds, active),
      power: false,
      hordes: ZOMBIE_SPAWNS.map((n, i) => ({ id: i, node: n, prev: n })),
      nextHordeId: ZOMBIE_SPAWNS.length,
      barricades: [],
      events: [], log: []
    };
  }

  openQuestion(i) {
    this.phase = 'question';
    this.roundIndex = i;
    this.answers = new Map(); this.votes = new Map(); this.crewOptions = [];
    this.eligible = new Set([...this.players.values()].filter((p) => this.isConnected(p)).map((p) => p.id));
    this.phaseStartedAt = this.now();
    this.deadline = this.now() + this.settings.questionSeconds * 1000;
    this.paused = false; this.pausedRemaining = null;
    for (const p of this.players.values()) if (p.bot) p.delay = this.now() + 2000 + this.rng() * 9000;
  }

  closeQuestion(reason, silent = false) {
    if (this.phase !== 'question') return;
    const q = this.pack.questions[this.roundIndex];
    const crewRes = CREWS.map((c) => {
      const crew = this.mission.crews[c.id];
      if (!crew.active) return { crew: c.id, active: false, correct: 0, counted: 0, accuracy: null, gained: 0 };
      // Counted = eligible members who answered, plus eligible members still connected (non-answer = not correct).
      // Disconnected non-answerers and players who joined after the question closed are not counted.
      let counted = 0; let correct = 0;
      for (const id of this.eligible) {
        const p = this.players.get(id);
        if (!p || p.crew !== c.id) continue;
        const answered = this.answers.has(id);
        if (!answered && !this.isConnected(p)) continue;
        counted++;
        if (answered && this.answers.get(id) === q.correct) correct++;
      }
      const accuracy = counted ? correct / counted : null;
      const gained = accuracy === null ? 0 : Math.round(accuracy * 2);
      return { crew: c.id, active: true, correct, counted, accuracy, gained };
    });
    for (const r of crewRes) if (r.active) this.mission.crews[r.crew].energy = Math.min(9, this.mission.crews[r.crew].energy + r.gained);
    const counts = [0, 0, 0, 0];
    for (const ch of this.answers.values()) counts[ch]++;
    const classCounted = crewRes.reduce((s, r) => s + r.counted, 0);
    const classCorrect = crewRes.reduce((s, r) => s + r.correct, 0);
    const res = { round: this.roundIndex, questionId: q.id, correct: q.correct, counts, classCorrect, classCounted, crews: crewRes, reason };
    this.results[this.roundIndex] = res;
    this.lastReveal = res;
    if (silent) return;
    this.phase = 'reveal';
    this.phaseStartedAt = this.now();
    this.deadline = this.settings.autoAdvance ? this.now() + AUTO_REVEAL_MS : null;
    this.bump();
  }

  openVote() {
    this.phase = 'vote';
    this.votes = new Map();
    this.crewOptions = this.mission.crews.map((c) => (c.active ? this.optionsFor(c) : []));
    this.phaseStartedAt = this.now();
    this.deadline = this.now() + this.settings.voteSeconds * 1000;
    for (const p of this.players.values()) if (p.bot) p.delay = this.now() + 1500 + this.rng() * 5000;
  }

  optionsFor(crew) {
    const m = this.mission; const opts = [];
    const add = (id, kind, label, cost, extra = {}) => opts.push({ id, kind, label, cost, affordable: crew.energy >= cost, ...extra });
    const hordeAt = (n) => m.hordes.some((h) => h.node === n);
    if (crew.cornered) {
      add('repel', 'repel', 'Barricade & push the horde back', COSTS.barricade);
      add('hold', 'hold', 'Signal for help and hold on', 0);
      return opts;
    }
    if (crew.node === 'GATE') {
      add('hold', 'hold', 'Hold the gate until dawn', 0);
      add('move:COURT', 'move', 'Go back to the Flag Court', COSTS.move, { target: 'COURT' });
      return opts;
    }
    if ((m.fuses[crew.node] || 0) > 0 && !crew.carrying) add('collect', 'collect', `Search the ${NODES[crew.node].short} for a fuse`, COSTS.collect);
    for (const n of neighbours(crew.node)) {
      if (NODES[n].kind === 'spawn') continue;
      if (n === 'GATE' && !m.power) continue;
      const danger = hordeAt(n);
      const why = n === 'GEN' && crew.carrying ? ' (install fuse)' : (n === 'GATE' ? ' (escape route)' : '');
      add(`move:${n}`, 'move', `Move to the ${NODES[n].short}${why}${danger ? ' — horde there!' : ''}`, COSTS.move, { target: n, danger });
    }
    for (const other of m.crews) {
      if (other.id === crew.id || !other.active || !other.cornered) continue;
      if (other.node === crew.node || neighbours(crew.node).includes(other.node)) {
        add(`rescue:${other.id}`, 'rescue', `Rescue Crew ${CREWS[other.id].name}`, COSTS.rescue, { target: other.node, crew: other.id });
      }
    }
    const threat = this.threatEdge(crew.node);
    if (threat && !m.barricades.some((b) => b.key === edgeKey(crew.node, threat))) {
      add(`barricade:${threat}`, 'barricade', `Barricade the path to the ${NODES[threat].short}`, COSTS.barricade, { target: threat });
    }
    add('hold', 'hold', 'Hold position and keep watch', 0);
    return opts;
  }

  // Edge from `node` along which the nearest horde would arrive.
  threatEdge(node) {
    let best = null; let bestD = Infinity;
    for (const h of this.mission.hordes) {
      const path = this.path(h.node, node, true);
      if (path && path.length >= 2 && path.length - 1 < bestD) { bestD = path.length - 1; best = path[path.length - 2]; }
    }
    return bestD <= 3 ? best : null;
  }

  // BFS shortest path from a to b; zombies cannot cross barricades or enter a powered gate.
  path(a, b, forZombie = false) {
    if (a === b) return [a];
    const prev = new Map([[a, null]]); const queue = [a];
    while (queue.length) {
      const cur = queue.shift();
      for (const n of neighbours(cur)) {
        if (prev.has(n)) continue;
        if (forZombie) {
          if (this.mission.barricades.some((x) => x.key === edgeKey(cur, n))) continue;
          if (n === 'GATE') continue;
        }
        prev.set(n, cur);
        if (n === b) {
          const out = [n]; let c = cur;
          while (c !== null) { out.unshift(c); c = prev.get(c); }
          return out;
        }
        queue.push(n);
      }
    }
    return null;
  }

  tally(crewId) {
    const opts = this.crewOptions[crewId] || [];
    const counts = new Map(opts.map((o) => [o.id, 0]));
    for (const [pid, opt] of this.votes) {
      const p = this.players.get(pid);
      if (p && p.crew === crewId && counts.has(opt)) counts.set(opt, counts.get(opt) + 1);
    }
    let best = null; let bestN = 0;
    for (const o of opts) { const n = counts.get(o.id); if (n > bestN && o.affordable) { best = o; bestN = n; } }
    if (!best) best = opts.find((o) => o.id === 'hold') || opts[0];
    return { winner: best, counts: Object.fromEntries(counts) };
  }

  closeVote() {
    if (this.phase !== 'vote') return;
    const m = this.mission; const ev = []; const roundNo = this.roundIndex;
    const decisions = [];
    // 1. crew actions in crew order
    for (const crew of m.crews) {
      if (!crew.active) continue;
      const { winner, counts } = this.tally(crew.id);
      decisions.push({ crew: crew.id, option: winner.id, label: winner.label, counts });
      if (!winner || crew.energy < winner.cost) { ev.push({ t: 'hold', crew: crew.id }); continue; }
      crew.energy -= winner.cost;
      const [kind, arg] = winner.id.split(':');
      if (kind === 'move') {
        const from = crew.node; crew.node = arg;
        ev.push({ t: 'move', crew: crew.id, from, to: arg });
        this.afterArrive(crew, ev);
      } else if (kind === 'collect') {
        m.fuses[crew.node]--; crew.carrying = true;
        ev.push({ t: 'collect', crew: crew.id, node: crew.node });
      } else if (kind === 'barricade') {
        m.barricades.push({ key: edgeKey(crew.node, arg), a: crew.node, b: arg, rounds: BARRICADE_ROUNDS });
        ev.push({ t: 'barricade', crew: crew.id, a: crew.node, b: arg });
      } else if (kind === 'repel') {
        this.repel(crew.node, ev, crew.id);
        crew.cornered = false; crew.corneredRounds = 0;
        ev.push({ t: 'freed', crew: crew.id, by: crew.id });
      } else if (kind === 'rescue') {
        const target = m.crews[Number(arg)];
        if (target && target.cornered) {
          const from = crew.node;
          if (from !== target.node) { crew.node = target.node; ev.push({ t: 'move', crew: crew.id, from, to: target.node }); }
          this.repel(target.node, ev, crew.id);
          target.cornered = false; target.corneredRounds = 0;
          ev.push({ t: 'freed', crew: target.id, by: crew.id });
          this.afterArrive(crew, ev);
        }
      } else {
        ev.push({ t: 'hold', crew: crew.id });
      }
    }
    // 2. hordes advance (from round 2; each horde moves every other round)
    if (roundNo >= 1) {
      m.hordes.forEach((h, idx) => {
        if ((roundNo + idx) % 2 !== 0) return;
        if (m.crews.some((c) => c.active && c.cornered && c.node === h.node)) return;
        const targets = m.crews.filter((c) => c.active && c.node !== 'GATE');
        let bestPath = null;
        for (const c of targets) {
          const p = this.path(h.node, c.node, true);
          if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
        }
        if (bestPath && bestPath.length >= 2) {
          h.prev = h.node; h.node = bestPath[1];
          ev.push({ t: 'horde', h: h.id, from: h.prev, to: h.node });
        } else if (targets.length) {
          ev.push({ t: 'blocked', h: h.id, node: h.node });
        }
      });
    }
    // 3. cornering
    for (const c of m.crews) {
      if (!c.active || c.node === 'GATE' || c.cornered) continue;
      if (m.hordes.some((h) => h.node === c.node)) {
        c.cornered = true; c.corneredRounds = 0;
        const lost = c.energy > 0 ? 1 : 0; c.energy -= lost;
        ev.push({ t: 'cornered', crew: c.id, node: c.node, lost });
      }
    }
    // 4. timers: barricades decay, hordes lose interest after a while (no dead ends)
    m.barricades.forEach((b) => b.rounds--);
    const expired = m.barricades.filter((b) => b.rounds <= 0);
    m.barricades = m.barricades.filter((b) => b.rounds > 0);
    for (const b of expired) ev.push({ t: 'barricade_gone', a: b.a, b: b.b });
    for (const c of m.crews) {
      if (!c.cornered) continue;
      c.corneredRounds++;
      if (c.corneredRounds > CORNER_MAX_ROUNDS) {
        this.repel(c.node, ev, null);
        c.cornered = false; c.corneredRounds = 0;
        ev.push({ t: 'freed', crew: c.id, by: null });
      }
    }
    // 5. reinforcements
    if ([3, 6, 9].includes(roundNo) && m.hordes.length < MAX_HORDES && roundNo < this.totalRounds - 1) {
      const node = ZOMBIE_SPAWNS[(roundNo / 3) % 2];
      const h = { id: m.nextHordeId++, node, prev: node };
      m.hordes.push(h);
      ev.push({ t: 'spawn', h: h.id, node });
    }
    m.events = ev;
    m.decisions = decisions;
    m.log.push({ round: roundNo, events: ev, decisions });
    this.eventSeq++;
    this.phase = 'resolve';
    this.phaseStartedAt = this.now();
    this.deadline = this.settings.autoAdvance ? this.now() + AUTO_RESOLVE_MS : null;
    this.bump();
  }

  afterArrive(crew, ev) {
    const m = this.mission;
    if (crew.node === 'GEN' && crew.carrying) {
      crew.carrying = false; m.installed++;
      ev.push({ t: 'install', crew: crew.id, installed: m.installed });
      if (!m.power && m.installed >= m.needed) { m.power = true; ev.push({ t: 'power' }); }
    }
    if (crew.node === 'GATE') { crew.atGate = true; ev.push({ t: 'gate', crew: crew.id }); }
    else crew.atGate = false;
  }

  // Push every horde on `node` back one step (to where it came from, else a neighbour without crews) and barricade.
  repel(node, ev, byCrew) {
    const m = this.mission;
    for (const h of m.hordes.filter((x) => x.node === node)) {
      const occupied = new Set(m.crews.filter((c) => c.active).map((c) => c.node));
      let back = h.prev !== node && !occupied.has(h.prev) ? h.prev : null;
      if (!back) back = neighbours(node).find((n) => n !== 'GATE' && !occupied.has(n)) || ZOMBIE_SPAWNS[h.id % 2];
      const from = h.node; h.node = back; h.prev = back;
      ev.push({ t: 'repel', h: h.id, from, to: back, by: byCrew });
      if (byCrew !== null && neighbours(node).includes(back)) {
        const key = edgeKey(node, back);
        if (!m.barricades.some((b) => b.key === key)) m.barricades.push({ key, a: node, b: back, rounds: 2 });
      }
    }
  }

  afterResolve() {
    if (this.roundIndex + 1 >= this.totalRounds) this.toExtraction();
    else this.openQuestion(this.roundIndex + 1);
  }

  toExtraction() {
    const m = this.mission;
    const active = m.crews.filter((c) => c.active);
    const atGate = active.filter((c) => c.node === 'GATE').length;
    const counted = this.results.reduce((s, r) => s + (r ? r.classCounted : 0), 0);
    const correct = this.results.reduce((s, r) => s + (r ? r.classCorrect : 0), 0);
    const classAccuracy = counted ? correct / counted : 0;
    const stars = (m.power ? 1 : 0) + (active.length && atGate === active.length ? 1 : 0) + (classAccuracy >= 0.7 ? 1 : 0);
    const crewStats = CREWS.map((c) => {
      const rs = this.results.filter(Boolean).map((r) => r.crews[c.id]).filter((x) => x && x.counted);
      const cc = rs.reduce((s, x) => s + x.correct, 0); const cn = rs.reduce((s, x) => s + x.counted, 0);
      return { crew: c.id, active: m.crews[c.id].active, accuracy: cn ? cc / cn : null, atGate: m.crews[c.id].node === 'GATE', node: m.crews[c.id].node };
    });
    const perQuestion = this.results.filter(Boolean).map((r) => ({ round: r.round, accuracy: r.classCounted ? r.classCorrect / r.classCounted : null }));
    this.summary = {
      power: m.power, installed: m.installed, needed: m.needed, atGate, activeCrews: active.length,
      classAccuracy, stars, crewStats, perQuestion, roundsPlayed: this.results.filter(Boolean).length,
      outcome: m.power && atGate === active.length ? 'full' : (m.power ? 'gate' : 'fence')
    };
    this.phase = 'extraction';
    this.phaseStartedAt = this.now();
    this.deadline = this.now() + EXTRACTION_MS;
  }

  toDebrief() { this.phase = 'debrief'; this.deadline = null; this.phaseStartedAt = this.now(); }

  // ---------- clock ----------
  tick() {
    const now = this.now();
    // connected-set changes should reach the host's indicators
    const sig = [...this.players.values()].map((p) => (this.isConnected(p) ? 1 : 0)).join('');
    if (sig !== this.connectedSig) { this.connectedSig = sig; this.bump(); }
    if (this.paused) return;
    if (this.demo) this.tickBots(now);
    if (this.phase === 'question') {
      if (this.deadline && now >= this.deadline) this.closeQuestion('timer');
      else this.checkAllAnswered();
    } else if (this.phase === 'vote') {
      if (this.deadline && now >= this.deadline) this.closeVote('timer');
      else this.checkAllVoted();
    } else if (this.deadline && now >= this.deadline) {
      if (this.phase === 'reveal') { this.openVote(); this.bump(); }
      else if (this.phase === 'resolve') { this.afterResolve(); this.bump(); }
      else if (this.phase === 'extraction') { this.toDebrief(); this.bump(); }
    }
  }

  // Goal-directed choice used by DEMO bots and automated simulations (never shown to students).
  planOption(crewId) {
    const m = this.mission; const crew = m.crews[crewId];
    const opts = (this.crewOptions[crewId] || []).filter((o) => o.affordable);
    const byId = (id) => opts.find((o) => o.id === id);
    if (!opts.length) return null;
    if (crew.cornered) return byId('repel') || byId('hold');
    const rescue = opts.find((o) => o.kind === 'rescue'); if (rescue) return rescue;
    const carried = m.crews.filter((c) => c.carrying).length;
    const stillNeeded = m.needed - m.installed - carried;
    if (byId('collect') && stillNeeded > 0) return byId('collect');
    let goal = null;
    if (crew.node === 'GATE') return byId('hold');
    if (crew.carrying) goal = 'GEN';
    else if (m.power) goal = 'GATE';
    else if (stillNeeded > 0) {
      let best = null;
      for (const [n, k] of Object.entries(m.fuses)) {
        if (k <= 0) continue;
        const p = this.path(crew.node, n);
        if (p && (!best || p.length < best.length)) best = p;
      }
      goal = best ? best[best.length - 1] : 'COURT';
    } else goal = 'COURT';
    if (goal && goal !== crew.node) {
      const p = this.path(crew.node, goal);
      const step = p && p[1];
      const mv = byId(`move:${step}`);
      if (mv && !mv.danger) return mv;
    }
    const bar = opts.find((o) => o.kind === 'barricade'); if (bar) return bar;
    return byId('hold');
  }

  tickBots(now) {
    for (const p of this.players.values()) {
      if (!p.bot || now < p.delay) continue;
      if (this.phase === 'question' && !this.answers.has(p.id)) {
        const q = this.pack.questions[this.roundIndex];
        const choice = this.rng() < p.skill ? q.correct : Math.floor(this.rng() * 4);
        this.answers.set(p.id, choice); this.eligible.add(p.id); this.bump();
      } else if (this.phase === 'vote' && !this.votes.has(p.id) && this.mission.crews[p.crew]?.active) {
        const opts = (this.crewOptions[p.crew] || []).filter((o) => o.affordable);
        const plan = this.planOption(p.crew);
        const pick = plan && this.rng() < 0.8 ? plan : opts[Math.floor(this.rng() * opts.length)];
        if (pick) { this.votes.set(p.id, pick.id); this.bump(); }
      }
    }
  }

  // ---------- views ----------
  view({ player = null, host = false } = {}) {
    const now = this.now();
    const q = this.roundIndex >= 0 ? this.pack.questions[this.roundIndex] : null;
    const showQ = q && ['question', 'reveal', 'vote', 'resolve'].includes(this.phase);
    const revealed = ['reveal', 'vote', 'resolve'].includes(this.phase) && this.lastReveal && this.lastReveal.round === this.roundIndex;
    const players = [...this.players.values()];
    const crews = CREWS.map((c) => {
      const mem = players.filter((p) => p.crew === c.id);
      const mc = this.mission ? this.mission.crews[c.id] : null;
      const elig = mem.filter((p) => this.eligible.has(p.id));
      return {
        id: c.id, name: c.name, color: c.color,
        members: mem.length, connected: mem.filter((p) => this.isConnected(p)).length,
        answered: this.phase === 'question' ? elig.filter((p) => this.answers.has(p.id)).length : null,
        expected: this.phase === 'question' ? elig.filter((p) => this.answers.has(p.id) || this.isConnected(p)).length : null,
        voted: this.phase === 'vote' ? mem.filter((p) => this.votes.has(p.id)).length : null,
        node: mc ? mc.node : c.start, energy: mc ? mc.energy : 0, carrying: mc ? mc.carrying : false,
        cornered: mc ? mc.cornered : false, active: mc ? mc.active : mem.length > 0,
        options: this.phase === 'vote' || this.phase === 'resolve' ? (this.crewOptions[c.id] || []) : [],
        tally: this.phase === 'vote' && host ? this.tally(c.id).counts : null
      };
    });
    const connectedEligible = this.phase === 'question' ? this.connectedEligible() : [];
    const out = {
      code: this.code, phase: this.phase, paused: this.paused, version: this.version, demo: this.demo,
      roundIndex: this.roundIndex, totalRounds: this.totalRounds, roundId: this.roundId,
      remainingMs: this.paused ? this.pausedRemaining : (this.deadline ? Math.max(0, this.deadline - now) : null),
      packTitle: this.pack.title,
      settings: { ...this.settings },
      playerCount: players.length, maxPlayers: MAX_PLAYERS,
      answeredCount: this.phase === 'question' ? this.answers.size : null,
      expectedCount: this.phase === 'question' ? new Set([...connectedEligible.map((p) => p.id), ...this.answers.keys()]).size : null,
      question: showQ ? publicQuestion(q) : null,
      reveal: revealed ? {
        correct: q.correct, explanation: q.explanation, counts: this.lastReveal.counts,
        classCorrect: this.lastReveal.classCorrect, classCounted: this.lastReveal.classCounted,
        crews: this.lastReveal.crews.map((r) => ({ crew: r.crew, active: r.active, accuracy: r.accuracy, gained: r.gained, counted: r.counted }))
      } : null,
      crews,
      mission: this.mission ? {
        fuses: { ...this.mission.fuses }, installed: this.mission.installed, needed: this.mission.needed, power: this.mission.power,
        hordes: this.mission.hordes.map((h) => ({ id: h.id, node: h.node })),
        barricades: this.mission.barricades.map((b) => ({ a: b.a, b: b.b, rounds: b.rounds })),
        events: this.phase === 'resolve' ? this.mission.events : [],
        decisions: this.phase === 'resolve' ? this.mission.decisions : [],
        eventSeq: this.eventSeq
      } : null,
      summary: ['extraction', 'debrief'].includes(this.phase) ? this.summary : null,
      vocab: this.pack.vocab
    };
    if (host) {
      out.roster = CREWS.map((c) => players.filter((p) => p.crew === c.id).map((p) => ({ callsign: p.callsign, connected: this.isConnected(p), bot: p.bot })));
    }
    if (player) {
      const myAns = this.phase === 'question' || revealed ? this.answers.get(player.id) : undefined;
      const res = revealed && myAns !== undefined ? myAns === q.correct : null;
      out.me = {
        id: player.id, callsign: player.callsign, crew: player.crew,
        answer: myAns === undefined ? null : myAns, correct: res,
        vote: this.phase === 'vote' ? (this.votes.get(player.id) || null) : null,
        eligible: this.eligible.has(player.id)
      };
    }
    return out;
  }
}

function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
