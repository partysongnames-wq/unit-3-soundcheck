// Shared campus map for Suksanari: AFTER HOURS.
// Fictionalised school layout (no real floor plan, no emblem).
// Grid coordinates are isometric: gx grows to the lower-right, gy to the lower-left.
// gx/gy = building centre; sx/sy = where crews and hordes stand (open ground in front of it).

export const NODES = {
  MUSIC:   { id: 'MUSIC',   name: 'Music & Dance Room', short: 'Music Room', gx: 1.0, gy: 1.0, sx: 2.3, sy: 0.65, kind: 'building', w: 1.4, d: 1.0, h: 1.0, roof: 'thai' },
  CANTEEN: { id: 'CANTEEN', name: 'Canteen',            short: 'Canteen',    gx: 0.7, gy: 5.0, sx: 1.95, sy: 4.35, kind: 'building', w: 1.6, d: 1.2, h: 0.7, roof: 'flat' },
  HALL:    { id: 'HALL',    name: 'Assembly Hall',      short: 'Hall',       gx: 5.8, gy: 0.9, sx: 4.6, sy: 2.1, kind: 'building', w: 1.3, d: 1.7, h: 1.3, roof: 'thai' },
  LIB:     { id: 'LIB',     name: 'Library',            short: 'Library',    gx: 3.2, gy: 3.4, sx: 4.2, sy: 4.4, kind: 'building', w: 1.2, d: 1.2, h: 1.2, roof: 'flat' },
  GEN:     { id: 'GEN',     name: 'Generator Shed',     short: 'Generator',  gx: 6.0, gy: 4.5, sx: 6.85, sy: 5.35, kind: 'generator', w: 0.9, d: 0.9, h: 0.6, roof: 'flat' },
  CLASS:   { id: 'CLASS',   name: 'Classroom Block',    short: 'Classrooms', gx: 2.6, gy: 7.6, sx: 4.15, sy: 7.15, kind: 'building', w: 2.0, d: 1.1, h: 1.6, roof: 'flat' },
  SCI:     { id: 'SCI',     name: 'Science Wing',       short: 'Science',    gx: 7.6, gy: 3.4, sx: 8.55, sy: 4.8, kind: 'building', w: 1.1, d: 2.0, h: 1.5, roof: 'flat' },
  COURT:   { id: 'COURT',   name: 'Flag Court',         short: 'Flag Court', gx: 7.1, gy: 7.1, kind: 'yard' },
  GATE:    { id: 'GATE',    name: 'Front Gate',         short: 'Gate',       gx: 8.6, gy: 8.6, kind: 'gate' },
  FIELD:   { id: 'FIELD',   name: 'Back Field',         short: 'Back Field', gx: -1.2, gy: 1.6, kind: 'spawn' },
  BIKES:   { id: 'BIKES',   name: 'Bike Shed',          short: 'Bike Shed',  gx: 1.6, gy: -1.2, kind: 'spawn' }
};

export const EDGES = [
  ['MUSIC', 'LIB'], ['MUSIC', 'CANTEEN'], ['MUSIC', 'HALL'],
  ['CANTEEN', 'LIB'], ['HALL', 'LIB'],
  ['CANTEEN', 'CLASS'], ['HALL', 'SCI'],
  ['LIB', 'GEN'], ['CLASS', 'GEN'], ['SCI', 'GEN'],
  ['CLASS', 'COURT'], ['SCI', 'COURT'], ['GEN', 'COURT'],
  ['COURT', 'GATE'],
  ['FIELD', 'CANTEEN'], ['FIELD', 'MUSIC'], ['BIKES', 'HALL'], ['BIKES', 'MUSIC']
];

export const CREWS = [
  { id: 0, name: 'Lantern', color: '#ffb547', start: 'MUSIC' },
  { id: 1, name: 'Comet',   color: '#5fd4ff', start: 'CANTEEN' },
  { id: 2, name: 'Orchid',  color: '#ff7eb6', start: 'HALL' },
  { id: 3, name: 'Fern',    color: '#8ef07a', start: 'LIB' }
];

// Fuses hidden in buildings at the start of the mission.
export const FUSE_START = { CLASS: 2, SCI: 2, CANTEEN: 1, HALL: 1 };

export const ZOMBIE_SPAWNS = ['FIELD', 'BIKES'];

export const COSTS = { move: 1, collect: 2, barricade: 1, rescue: 2, hold: 0 };
export const BARRICADE_ROUNDS = 3;
export const CORNER_MAX_ROUNDS = 2;
export const MAX_HORDES = 5;

export function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export function neighbours(id) {
  const out = [];
  for (const [a, b] of EDGES) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

export function fusesNeeded(questionCount, activeCrews) {
  const n = Math.round(questionCount / 3);
  return Math.max(1, Math.min(Math.max(1, activeCrews), n));
}
