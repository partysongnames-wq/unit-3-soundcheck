// Simple "player brain" used by DEMO bots on the server and by automated test clients.
// It only uses information a real player can see.
import { LOCKERS, GENERATOR, path, lockerStand, dist, INTERACT_DIST } from './world.js';

export function createBrain(rng = Math.random) {
  return { goal: null, route: [], repathAt: 0, lockerCooldown: new Map(), wanderUntil: 0 };
}

/**
 * Decide a movement vector for this tick.
 * @param me {x,y,fuses,zombified}
 * @param world {now, zombies:[{x,y}], lockerReady:(id)=>bool}
 * @returns {dx, dy, atLocker: id|null, atGenerator: bool}
 */
export function think(brain, me, world, rng = Math.random) {
  const now = world.now;
  const near = (x, y, d) => dist(me.x, me.y, x, y) < d;
  // choose goal
  const wantGen = me.fuses >= 2 || (me.fuses >= 1 && rng() < 0.01);
  if (!brain.goal || now > brain.repathAt || (wantGen && brain.goal.kind !== 'gen') || (world.eventGoal && brain.goal.kind !== 'event' && !wantGen)) {
    if (wantGen && !me.zombified) brain.goal = { kind: 'gen', x: GENERATOR.x + 0.0, y: GENERATOR.y + 1.4 };
    else if (world.eventGoal) brain.goal = { kind: 'event', x: world.eventGoal[0], y: world.eventGoal[1] };
    else {
      const options = LOCKERS.filter((l) => world.lockerReady(l.id) && (brain.lockerCooldown.get(l.id) || 0) < now);
      options.sort((a, b) => dist(me.x, me.y, a.x, a.y) - dist(me.x, me.y, b.x, b.y));
      const pick = options[Math.min(options.length - 1, Math.floor(rng() * Math.min(3, options.length)))];
      if (pick) { const s = lockerStand(pick); brain.goal = { kind: 'locker', id: pick.id, x: s[0], y: s[1] }; }
    }
    if (brain.goal) {
      const p = path(me.x, me.y, brain.goal.x, brain.goal.y);
      brain.route = p ? p.map(([x, y]) => [x + 0.5, y + 0.5]) : [];
    }
    brain.repathAt = now + 2500 + rng() * 1500;
  }
  let dx = 0, dy = 0;
  if (brain.route.length) {
    const [tx, ty] = brain.route[0];
    if (near(tx, ty, 0.25)) brain.route.shift();
    else { const d = dist(me.x, me.y, tx, ty); dx = (tx - me.x) / d; dy = (ty - me.y) / d; }
  }
  // flee a close zombie a little
  for (const z of world.zombies) {
    const d = dist(me.x, me.y, z.x, z.y);
    if (d < 1.6 && d > 0.01) { dx += (me.x - z.x) / d * 0.9; dy += (me.y - z.y) / d * 0.9; }
  }
  const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
  let atLocker = null;
  if (brain.goal && brain.goal.kind === 'locker') {
    const l = LOCKERS[brain.goal.id];
    if (near(l.x, l.y, INTERACT_DIST - 0.05)) { atLocker = l.id; brain.lockerCooldown.set(l.id, now + 12000); brain.goal = null; }
  }
  const atGenerator = near(GENERATOR.x, GENERATOR.y, GENERATOR.r);
  if (atGenerator && brain.goal && brain.goal.kind === 'gen') brain.goal = null;
  return { dx, dy, atLocker, atGenerator };
}
