// "Attract mode": a local pretend game used behind the title and setup screens (no server involved).
import { WorldView } from './render.js';
import { SPAWNS, ZOMBIE_SPAWNS, LOCKERS, move, walkableTiles, path } from './shared/world.js';
import { randomAvatar } from './shared/avatar.js';
import { createBrain, think } from './shared/botbrain.js';

export function startAttract(canvas, { reduced = false, count = 14 } = {}) {
  const view = new WorldView(canvas, { mode: 'title', reduced });
  const names = ['Mochi', 'Lotus', 'Boba', 'Kiwi', 'Nova', 'Mango', 'Pixel', 'Sunny', 'Taro', 'Peach', 'Comet', 'Bunny', 'Star', 'Jelly', 'Coco', 'Luna'];
  const bots = Array.from({ length: count }, (_, i) => { const s = SPAWNS[i % SPAWNS.length]; return { n: i + 1, x: s[0] + Math.random(), y: s[1] + (Math.random() - 0.5), dir: 1, moving: false, brain: createBrain(), fuses: i % 4 === 0 ? 1 : 0, em: 0 }; });
  view.setRoster(bots.map((b, i) => ({ n: b.n, name: names[i % names.length], crew: i % 4, avatar: randomAvatar() })));
  const tiles = walkableTiles();
  const zs = ZOMBIE_SPAWNS.slice(0, 6).map(([x, y]) => ({ x, y, route: [], dir: 1 }));
  let last = performance.now(); let alive = true; const scores = [3, 5, 2, 4];
  const step = () => {
    if (!alive) return;
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!reduced) {
      for (const b of bots) {
        const d = think(b.brain, b, { now, zombies: zs, lockerReady: () => true });
        const [nx, ny] = move(b.x, b.y, d.dx * 3 * dt, d.dy * 3 * dt);
        b.moving = Math.hypot(nx - b.x, ny - b.y) > 0.001; if (Math.abs(nx - b.x) > 0.001) b.dir = nx > b.x ? 1 : -1; b.x = nx; b.y = ny;
        if (d.atLocker !== null) b.fuses = Math.min(2, b.fuses + 1);
        if (d.atGenerator && b.fuses) { scores[(b.n - 1) % 4] += b.fuses; b.fuses = 0; view.fx({ k: 'deliver', n: b.n, crew: (b.n - 1) % 4, pts: 1 }); }
        if (Math.random() < 0.002) b.em = ['wave', 'dance', 'heart', 'laugh', 'star'][Math.floor(Math.random() * 5)];
        if (b.em && Math.random() < 0.01) b.em = 0;
      }
      for (const z of zs) {
        if (!z.route.length) { const [tx, ty] = tiles[Math.floor(Math.random() * tiles.length)]; const r = path(z.x, z.y, tx + 0.5, ty + 0.5, 500); z.route = r ? r.slice(0, 12).map(([x, y]) => [x + 0.5, y + 0.5]) : []; }
        if (z.route.length) { const [tx, ty] = z.route[0]; const d = Math.hypot(tx - z.x, ty - z.y); if (d < 0.1) z.route.shift(); else { const s = Math.min(d, 1.2 * dt); const nx = z.x + (tx - z.x) / d * s; z.dir = nx > z.x ? 1 : -1; z.x = nx; z.y += (ty - z.y) / d * s; } }
      }
    }
    view.push({ ph: 'play', pa: 0, sc: scores, ev: 0, p: bots.map((b) => [b.n, Math.round(b.x * 100), Math.round(b.y * 100), (b.moving ? 1 : 0) | (b.dir < 0 ? 2 : 0), b.fuses, b.em]), z: zs.map((z) => [Math.round(z.x * 100), Math.round(z.y * 100), z.dir < 0 ? 4 : 0]), f: [] });
    setTimeout(step, 100);
  };
  step();
  void LOCKERS;
  return { stop() { alive = false; view.destroy(); }, view };
}
