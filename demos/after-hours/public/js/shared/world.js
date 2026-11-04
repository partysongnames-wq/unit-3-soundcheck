// The school world, shared by the server (authority, zombies, bots) and every client (rendering, local movement).
// Positions are in tile units (floats). Tile (x, y) covers [x, x+1) × [y, y+1).
export const W = 42;
export const H = 28;

export const SPEED = { player: 4.2, boots: 6.0, zombified: 3.5, sleepy: 2.5, zombieChase: 2.75, zombieWander: 1.4 };
export const RADIUS = 0.3;

// Walkable floor codes and solid object codes
const FLOORS = new Set([',', '.', ':', ';', '=', '_', 'p', 'o', 'c', 'k', 'd', 'm']);
export const SOLIDS = new Set(['#', 'f', 'T', 'B', 'D', 'K', '~', 'G', 'L', 'b', 'P', 'F', 'X', 'S', 'V', 'Y', 'C', 'Q', 'W']);

// Layout loosely follows the real Suksanari campus (north at the top): Gym NW, Maths along the north,
// Audio-Visual on the east, English classrooms on the west with the canteen beside them, the big covered
// court in the middle, Thai class SW, then security, car park, garden and the front gate in the south.
export const ROOMS = {
  GYM: { name: 'Gym', wall: '#ffc29a', face: '#e98a52', floor: '=' },
  MATH: { name: 'Maths', wall: '#e6c3a5', face: '#9c5b3c', floor: ':' },
  AV: { name: 'Karaoke & AV', wall: '#c9b6ff', face: '#7a5ad6', floor: 'd' },
  ENG: { name: 'English', wall: '#f7e6a8', face: '#e3a23a', floor: ':' },
  CAN: { name: 'Canteen', wall: '#fff3dc', face: '#d6453b', floor: '_' },
  THAI: { name: 'Thai', wall: '#efb7a3', face: '#a44f39', floor: ':' }
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
  for (let x = 0; x < W; x++) { set(x, 0, 'f'); set(x, H - 1, 'f'); }
  for (let y = 0; y < H; y++) { set(0, y, 'f'); set(W - 1, y, 'f'); }
  // walkways first, buildings on top
  fill(1, 6, 40, 8, '.');        // north walkway (under Maths, above court)
  fill(8, 8, 8, 21, '.');        // west walkway between English and canteen
  fill(15, 6, 15, 19, '.');      // court west edge
  fill(34, 6, 34, 19, '.');      // court east edge
  fill(8, 18, 34, 19, '.');      // south walkway
  fill(1, 21, 13, 21, 'p');      // path to Thai class
  mkRoom('GYM', 1, 1, 10, 7, [[5, 7], [6, 7], [10, 4]]);
  mkRoom('MATH', 12, 1, 33, 5, [[16, 5], [17, 5], [27, 5], [28, 5]]);
  mkRoom('AV', 35, 1, 40, 17, [[35, 6], [35, 7], [35, 13], [35, 14]]);
  mkRoom('ENG', 1, 9, 7, 20, [[7, 11], [7, 12], [7, 17], [7, 18]]);
  mkRoom('CAN', 9, 9, 14, 17, [[11, 9], [12, 9], [14, 11], [14, 12], [14, 15], [14, 16]]);
  mkRoom('THAI', 1, 22, 11, 26, [[6, 22], [7, 22], [11, 24]]);
  // the big covered court (assembly area) — blue court floor, roof columns at the corners
  fill(16, 7, 33, 17, 'k');
  for (const [x, y] of [[16, 7], [33, 7], [16, 17], [33, 17], [24, 7], [25, 17]]) set(x, y, 'C');
  fill(24, 12, 25, 13, 'G');     // generator in the middle of the court
  // south: security hut, car park, garden, front gate
  fill(17, 20, 33, 26, 'c');
  fill(15, 20, 16, 20, 'S');
  for (const x of [19, 21, 23, 27, 29, 31]) set(x, 22, 'V');
  for (const x of [20, 24, 30]) set(x, 25, 'V');
  set(33, 20, 'F');
  for (let x = 19; x <= 22; x++) set(x, H - 1, 'X');
  // furniture
  for (const x of [3, 4, 7, 8]) set(x, 2, 'b');
  for (const x of [15, 18, 21, 25, 29, 31]) set(x, 3, 'D');
  // Audio-visual room = karaoke room: stage with speakers at the top, disco floor, sofas
  // stage at the BOTTOM of the room, facing north (like the real room); audience + sofas in the top half
  fill(36, 14, 39, 16, 'm'); set(36, 16, 'Q'); set(39, 16, 'Q');
  for (const x of [37, 38]) { set(x, 6, 'b'); set(x, 9, 'b'); }
  for (const y of [11, 14, 17]) { set(3, y, 'D'); set(5, y, 'D'); }
  for (const y of [11, 14]) for (const x of [10, 11, 12]) set(x, y, 'K');
  for (const x of [3, 5, 7, 9]) set(x, 24, 'D');
  set(2, 10, 'P'); set(13, 2, 'P');
  // garden trees + palms along the road
  for (const [x, y] of [[13, 23], [16, 24], [14, 26], [12, 25], [36, 21], [39, 24], [37, 26]]) set(x, y, 'T');
  for (const [x, y] of [[35, 19], [38, 19], [40, 22], [35, 24], [12, 20]]) set(x, y, 'Y');
  // lockers (question stations)
  const lockers = [];
  const L = (x, y) => { set(x, y, 'L'); lockers.push({ id: lockers.length, x: x + 0.5, y: y + 0.5, tx: x, ty: y }); };
  set(4, 19, 'W'); // English teacher's desk: Word Builder
  L(2, 6); L(20, 4); L(23, 2); L(32, 2); L(39, 3); L(39, 12); L(2, 13); L(2, 19); L(13, 16); L(2, 23); L(10, 25);
  L(17, 8); L(32, 8); L(17, 16); L(32, 16); L(33, 24); L(15, 23); L(11, 6);
  return { g, room, lockers };
}

const built = build();
export const GRID = built.g.map((r) => r.join(''));
export const ROOM_OF = built.room;
export const LOCKERS = built.lockers;
export const GENERATOR = { x: 25, y: 13, r: 1.9 };
export const WORD_DESK = { x: 4.5, y: 19.5, tx: 4, ty: 19 };
export const KITTEN_SPAWNS = [[14.5, 22.5], [11.5, 15.5], [26.5, 23.5], [37.5, 20.5]];
export const KITTENS = [{ name: 'Mango', coat: 0 }, { name: 'Nori', coat: 1 }, { name: 'Mochi', coat: 2 }, { name: 'Tiger', coat: 3 }];
export const GATE = { x: 21, y: 27 };

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

// Lamp posts (decoration + dusk lighting)
export const LAMPS = [[11.5, 8.4], [20, 6.3], [30, 6.3], [15.3, 12], [34.3, 11], [9.6, 18.3], [22, 18.3], [30, 18.3], [18, 20.3], [33.5, 26.3], [8.3, 15]];

export const SPAWNS = [[22.5, 15.5], [27.5, 15.5], [24.5, 15.8], [21.5, 10.5], [28.5, 10.5], [23, 16.4], [26.5, 16.4], [20.5, 14]];
export const ZOMBIE_SPAWNS = [[5.5, 4.5], [23.5, 3.5], [37.5, 11.5], [4.5, 15.5], [5.5, 25.5], [26, 24], [14.5, 24.5], [11.5, 12.5]];

export const CREWS = [
  { id: 0, name: 'Lantern', color: '#ff9f1c', light: '#ffd08a' },
  { id: 1, name: 'Comet', color: '#2ec4ff', light: '#a8e6ff' },
  { id: 2, name: 'Orchid', color: '#ff5fa2', light: '#ffc0dc' },
  { id: 3, name: 'Fern', color: '#3ddc84', light: '#b4f5d0' }
];

export const INTERACT_DIST = 1.15;

// ---- timetable event zones (which room each school-bell event happens in) ----
function roomRect(id) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ROOM_OF[y][x] === id) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0: x0 + 1, y0: y0 + 1, x1: x1, y1: y1 }; // interior, half-open [x0, x1) in tile units
}
export const ZONES = {
  lunch: { rects: [roomRect('CAN')], icon: '🍜', name: 'Canteen' },
  karaoke: { rects: [roomRect('AV')], icon: '🎤', name: 'Karaoke room' },
  garden: { rects: [{ x0: 12, y0: 20, x1: 17, y1: 27 }], icon: '🌸', name: 'Garden' },
  pe: { rects: [roomRect('GYM')], icon: '🏃', name: 'Gym' },
  quiz: { rects: [roomRect('ENG'), roomRect('THAI')], icon: '📚', name: 'English & Thai rooms' }
};
export function inZone(kind, x, y) { const z = ZONES[kind]; return !!z && z.rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1); }
export function zoneCenter(kind) { const r = ZONES[kind].rects[0]; return [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]; }
export const isStage = (x, y) => tileAt(Math.floor(x), Math.floor(y)) === 'm';
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
