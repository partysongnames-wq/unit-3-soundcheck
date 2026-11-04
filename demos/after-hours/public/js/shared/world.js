// The school world, shared by the server (authority, zombies, bots) and every client (rendering, local movement).
// Positions are in tile units (floats). Tile (x, y) covers [x, x+1) × [y, y+1).
export const W = 42;
export const H = 28;

export const SPEED = { player: 4.2, boots: 6.0, zombified: 3.5, zombieChase: 2.75, zombieWander: 1.4 };
export const RADIUS = 0.3;

// Walkable floor codes and solid object codes
const FLOORS = new Set([',', '.', ':', ';', '=', '_', 'p', 'o']);
export const SOLIDS = new Set(['#', 'f', 'T', 'B', 'D', 'K', '~', 'G', 'L', 'b', 'P', 'F', 'X']);

export const ROOMS = {
  LIB: { name: 'Library', wall: '#8fd9b6', face: '#5fb894', floor: ';' },
  ART: { name: 'Art & Music', wall: '#c9b6ff', face: '#9d86ea', floor: ':' },
  GYM: { name: 'Gym', wall: '#ffc29a', face: '#f29a66', floor: '=' },
  CLA: { name: 'Room 1', wall: '#9fd3ff', face: '#6fb1ea', floor: ':' },
  CLB: { name: 'Room 2', wall: '#ffb3d1', face: '#f07fab', floor: ':' },
  CAN: { name: 'Canteen', wall: '#ffe48a', face: '#f2c34f', floor: '_' }
};

function build() {
  const g = Array.from({ length: H }, () => Array(W).fill(','));
  const room = Array.from({ length: H }, () => Array(W).fill(''));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const mkRoom = (id, x0, y0, x1, y1, doors) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      set(x, y, edge ? '#' : ROOMS[id].floor); room[y][x] = id;
    }
    for (const [x, y] of doors) set(x, y, 'o');
  };
  // outer fence
  for (let x = 0; x < W; x++) { set(x, 0, 'f'); set(x, H - 1, 'f'); }
  for (let y = 0; y < H; y++) { set(0, y, 'f'); set(W - 1, y, 'f'); }
  mkRoom('LIB', 1, 1, 12, 9, [[6, 9], [7, 9]]);
  mkRoom('ART', 15, 1, 26, 8, [[20, 8], [21, 8]]);
  mkRoom('GYM', 29, 1, 40, 10, [[34, 10], [35, 10], [29, 6]]);
  mkRoom('CLA', 1, 16, 10, 25, [[5, 16], [6, 16]]);
  mkRoom('CLB', 12, 16, 20, 25, [[16, 16], [17, 16]]);
  mkRoom('CAN', 29, 16, 40, 25, [[33, 16], [34, 16], [29, 21]]);
  fill(1, 12, 40, 14, '.');          // main corridor
  fill(16, 9, 25, 11, '.');          // generator plaza
  fill(24, 15, 25, 26, 'p');         // courtyard path to the gate
  for (let x = 23; x <= 26; x++) set(x, H - 1, 'X'); // front gate
  // generator (2×2)
  fill(20, 10, 21, 11, 'G');
  // library shelves + plants
  for (const y of [3, 6]) for (const x of [3, 4, 5, 8, 9, 10]) set(x, y, 'B');
  set(2, 2, 'P'); set(11, 2, 'P');
  // art desks
  for (const y of [3, 5]) for (const x of [17, 18, 22, 23]) set(x, y, 'D');
  // gym benches
  for (const x of [31, 32, 33, 36, 37, 38]) set(x, 2, 'b');
  // classrooms
  for (const y of [18, 20, 22]) { for (const x of [3, 5, 7]) set(x, y, 'D'); for (const x of [14, 16, 18]) set(x, y, 'D'); }
  // canteen tables
  for (const y of [18, 22]) for (const x of [31, 32, 33, 36, 37, 38]) set(x, y, 'K');
  // courtyard
  fill(22, 20, 23, 21, '~');
  set(27, 17, 'F'); set(21, 17, 'b'); set(28, 20, 'b');
  // trees
  for (const [x, y] of [[13, 2], [14, 5], [13, 8], [27, 2], [28, 6], [27, 9], [2, 10], [30, 11], [39, 11], [22, 16], [27, 25], [22, 25], [14, 10]]) set(x, y, 'T');
  // lockers (question stations)
  const lockers = [];
  const L = (x, y) => { set(x, y, 'L'); lockers.push({ id: lockers.length, x: x + 0.5, y: y + 0.5, tx: x, ty: y }); };
  for (const x of [4, 10, 15, 27, 32, 38]) L(x, 12);
  for (const x of [8, 19, 30, 37]) L(x, 14);
  L(11, 7); L(25, 6); L(39, 8); L(2, 24); L(19, 24); L(39, 24); L(27, 22); L(21, 24);
  return { g, room, lockers };
}

const built = build();
export const GRID = built.g.map((r) => r.join(''));
export const ROOM_OF = built.room;
export const LOCKERS = built.lockers;
export const GENERATOR = { x: 21, y: 11, r: 1.9 };
export const GATE = { x: 25, y: 27 };

export const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 'f' : GRID[y][x]);
export const isSolidTile = (x, y) => SOLIDS.has(tileAt(x, y));
export const isWalkableTile = (x, y) => FLOORS.has(tileAt(x, y));

export function collides(x, y, r = RADIUS) {
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) if (isSolidTile(tx, ty)) return true;
  }
  return false;
}

/** Move a circle with axis-separated sliding collision. */
export function move(x, y, dx, dy, r = RADIUS) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!collides(x + sx, y, r)) x += sx;
    if (!collides(x, y + sy, r)) y += sy;
  }
  return [x, y];
}

/** BFS on tiles. Returns array of [tx, ty] from start (exclusive) to goal (inclusive), or null. */
export function path(fx, fy, gx, gy, maxNodes = W * H) {
  const s = Math.floor(fy) * W + Math.floor(fx); const t = Math.floor(gy) * W + Math.floor(gx);
  if (s === t) return [];
  const prev = new Int32Array(W * H).fill(-1); prev[s] = s;
  const q = [s]; let head = 0;
  while (head < q.length && head < maxNodes) {
    const c = q[head++]; const cx = c % W, cy = (c / W) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (!isWalkableTile(nx, ny)) continue;
      const n = ny * W + nx; if (prev[n] !== -1) continue;
      prev[n] = c;
      if (n === t) { const out = []; let k = n; while (k !== s) { out.push([k % W, (k / W) | 0]); k = prev[k]; } return out.reverse(); }
      q.push(n);
    }
  }
  return null;
}

export function walkableTiles() {
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isWalkableTile(x, y)) out.push([x, y]);
  return out;
}

/** A walkable tile next to a locker, used by bots to stand at it. */
export function lockerStand(l) {
  for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (isWalkableTile(l.tx + ox, l.ty + oy)) return [l.tx + ox + 0.5, l.ty + oy + 0.5];
  return null;
}

export const SPAWNS = [[24.5, 13.5], [23.5, 13.2], [25.5, 13.8], [22.5, 12.6], [26.5, 12.6], [24.5, 15.5], [25.5, 16.5], [23, 14.4]];
export const ZOMBIE_SPAWNS = [[34.5, 6.5], [6.5, 5.5], [35, 20.5], [4.5, 21.5], [15.5, 21.5], [20.5, 4.5], [37.5, 4.5], [3.5, 8]];

export const CREWS = [
  { id: 0, name: 'Lantern', color: '#ff9f1c', light: '#ffd08a' },
  { id: 1, name: 'Comet', color: '#2ec4ff', light: '#a8e6ff' },
  { id: 2, name: 'Orchid', color: '#ff5fa2', light: '#ffc0dc' },
  { id: 3, name: 'Fern', color: '#3ddc84', light: '#b4f5d0' }
];

export const INTERACT_DIST = 1.15;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
