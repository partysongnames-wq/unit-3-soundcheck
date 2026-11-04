// All artwork is drawn in code: tiles, furniture, avatars, zombies, items and effects.
import { AVATAR } from './shared/avatar.js';
import { ROOMS, ROOM_OF, GRID, W, H, tileAt, GENERATOR } from './shared/world.js';

export const INK = '#2b2340';
const TAU = Math.PI * 2;
function rnd(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
export function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function fs(c, fill, stroke, lw) { if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export { shade };

const FLOOR_OF_ROOM = (x, y) => { const id = ROOM_OF[y] && ROOM_OF[y][x]; return id ? ROOMS[id].floor : '.'; };

// ---------------------------------------------------------------- tiles
export function drawFloor(c, code, x, y, S) {
  const px = x * S, py = y * S; const r = rnd(x * 73 + y * 151 + 7);
  if (code === 'o') code = FLOOR_OF_ROOM(x, y);
  switch (code) {
    case ',': {
      c.fillStyle = (x + y) % 2 ? '#8bdc6e' : '#86d769'; c.fillRect(px, py, S, S);
      c.fillStyle = '#6fc457';
      for (let i = 0; i < 4; i++) { const gx = px + r() * S, gy = py + r() * S; c.fillRect(gx, gy, S * 0.04, S * 0.11); c.fillRect(gx + S * 0.05, gy + S * 0.03, S * 0.04, S * 0.08); }
      if (r() < 0.22) { const fx = px + S * (0.2 + r() * 0.6), fy = py + S * (0.2 + r() * 0.6); c.fillStyle = r() < 0.5 ? '#ffffff' : '#ff9ccc'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(fx + Math.cos(k * 1.26) * S * 0.05, fy + Math.sin(k * 1.26) * S * 0.05, S * 0.04, 0, TAU); c.fill(); } c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(fx, fy, S * 0.035, 0, TAU); c.fill(); }
      break;
    }
    case '.': c.fillStyle = (x + y) % 2 ? '#fbf3e6' : '#f4e8d4'; c.fillRect(px, py, S, S); c.strokeStyle = 'rgba(160,130,90,0.18)'; c.lineWidth = Math.max(1, S * 0.02); c.strokeRect(px, py, S, S); break;
    case ':': {
      c.fillStyle = '#f0c088'; c.fillRect(px, py, S, S); c.strokeStyle = '#d9a064'; c.lineWidth = Math.max(1, S * 0.03);
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(px, py + i * S / 4); c.lineTo(px + S, py + i * S / 4); c.stroke(); }
      const off = (y % 2) * 0.5; c.beginPath(); c.moveTo(px + S * (0.3 + off) % S, py); c.lineTo(px + S * (0.3 + off) % S, py + S / 4); c.stroke();
      break;
    }
    case ';': c.fillStyle = '#5cc7b8'; c.fillRect(px, py, S, S); c.fillStyle = '#79d6c8'; c.beginPath(); c.moveTo(px + S / 2, py + S * 0.15); c.lineTo(px + S * 0.85, py + S / 2); c.lineTo(px + S / 2, py + S * 0.85); c.lineTo(px + S * 0.15, py + S / 2); c.closePath(); c.fill(); break;
    case '=': c.fillStyle = (x % 2) ? '#f7b867' : '#f2ae5c'; c.fillRect(px, py, S, S); c.strokeStyle = 'rgba(150,80,20,0.15)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + S / 2, py); c.lineTo(px + S / 2, py + S); c.stroke(); break;
    case '_': c.fillStyle = (x + y) % 2 ? '#fbfbf7' : '#e9e9e2'; c.fillRect(px, py, S, S); c.fillStyle = 'rgba(120,120,110,0.12)'; c.fillRect(px + S * (0.2 + r() * 0.5), py + S * (0.2 + r() * 0.5), S * 0.08, S * 0.08); break;
    case 'd': { const cols = ['#b48cff', '#ff8fc8', '#7fc8ff', '#ffd36b']; c.fillStyle = cols[(x + y * 2) % 4]; c.fillRect(px, py, S, S); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(px + S * 0.08, py + S * 0.08, S * 0.84, S * 0.84); c.fillStyle = cols[(x + y * 2) % 4]; c.fillRect(px + S * 0.16, py + S * 0.16, S * 0.68, S * 0.68); break; }
    case 'm': { c.fillStyle = '#5a3a8a'; c.fillRect(px, py, S, S); c.strokeStyle = '#7b55b5'; c.lineWidth = Math.max(1, S * 0.03); for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(px, py + i * S / 4); c.lineTo(px + S, py + i * S / 4); c.stroke(); } if (tileAt(x, y - 1) !== 'm' && tileAt(x, y - 1) !== 'Q') { c.fillStyle = '#ffd23f'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(px + S * (0.12 + i * 0.25), py + S * 0.08, S * 0.06, 0, TAU); c.fill(); } } break; }
    case 'k': { c.fillStyle = '#3f8fe0'; c.fillRect(px, py, S, S); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(px, py + S * 0.1, S, S * 0.12); break; }
    case 'c': { c.fillStyle = (x + y) % 2 ? '#c9c6c0' : '#c3c0ba'; c.fillRect(px, py, S, S); c.fillStyle = 'rgba(90,85,80,0.12)'; for (let i = 0; i < 3; i++) c.fillRect(px + r() * S, py + r() * S, S * 0.05, S * 0.05); break; }
    case 'p': c.fillStyle = '#86d769'; c.fillRect(px, py, S, S); c.fillStyle = '#f2dfb1'; rr(c, px + S * 0.06, py + S * 0.06, S * 0.88, S * 0.88, S * 0.25); fs(c, '#f2dfb1', '#d9bf86', Math.max(1, S * 0.03)); break;
    default: c.fillStyle = '#86d769'; c.fillRect(px, py, S, S);
  }
}

function wallColors(x, y) { const id = ROOM_OF[y] && ROOM_OF[y][x]; return id ? ROOMS[id] : { wall: '#e8dcff', face: '#b9a7ee' }; }

export function drawWall(c, x, y, S) {
  const px = x * S, py = y * S; const col = wallColors(x, y);
  const below = tileAt(x, y + 1); const faceVisible = below !== '#';
  const topH = faceVisible ? S * 0.5 : S;
  c.fillStyle = col.wall; c.fillRect(px, py, S, topH);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(px, py, S, S * 0.08);
  if (faceVisible) {
    c.fillStyle = col.face; c.fillRect(px, py + topH, S, S - topH);
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(px, py + S - S * 0.08, S, S * 0.08);
    if ((x * 7 + y) % 3 === 0) { // little window with warm light
      rr(c, px + S * 0.22, py + topH + S * 0.08, S * 0.56, S * 0.28, S * 0.06); fs(c, '#fff1b8', INK, Math.max(1, S * 0.03));
      c.strokeStyle = INK; c.lineWidth = Math.max(1, S * 0.025); c.beginPath(); c.moveTo(px + S * 0.5, py + topH + S * 0.08); c.lineTo(px + S * 0.5, py + topH + S * 0.36); c.stroke();
    }
  }
  c.strokeStyle = shade(col.face, -0.35); c.lineWidth = Math.max(1, S * 0.03);
  if (tileAt(x - 1, y) !== '#') { c.beginPath(); c.moveTo(px, py); c.lineTo(px, py + S); c.stroke(); }
  if (tileAt(x + 1, y) !== '#') { c.beginPath(); c.moveTo(px + S, py); c.lineTo(px + S, py + S); c.stroke(); }
  if (tileAt(x, y - 1) !== '#') { c.beginPath(); c.moveTo(px, py); c.lineTo(px + S, py); c.stroke(); }
  if (faceVisible) { c.beginPath(); c.moveTo(px, py + S); c.lineTo(px + S, py + S); c.stroke(); }
}

export function drawObject(c, code, x, y, S) {
  const px = x * S, py = y * S; const lw = Math.max(1, S * 0.05); const r = rnd(x * 31 + y * 17);
  const under = code === 'Q' ? 'm' : ROOM_OF[y][x] ? FLOOR_OF_ROOM(x, y) : (code === 'V' || code === 'F' ? 'c' : code === 'S' ? '.' : ',');
  if (code !== 'G' && code !== '~') drawFloor(c, under, x, y, S);
  switch (code) {
    case 'f': {
      c.fillStyle = '#86d769'; c.fillRect(px, py, S, S);
      c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = lw * 0.6;
      for (let i = 0; i < 3; i++) { const bx = px + S * (0.08 + i * 0.32); c.beginPath(); c.moveTo(bx, py + S * 0.85); c.lineTo(bx, py + S * 0.3); c.lineTo(bx + S * 0.1, py + S * 0.18); c.lineTo(bx + S * 0.2, py + S * 0.3); c.lineTo(bx + S * 0.2, py + S * 0.85); c.closePath(); c.fill(); c.stroke(); }
      c.fillRect(px, py + S * 0.45, S, S * 0.08);
      break;
    }
    case 'X': {
      c.fillStyle = '#c7a14a'; c.fillRect(px, py + S * 0.15, S, S * 0.1); c.fillRect(px, py + S * 0.75, S, S * 0.1);
      c.fillStyle = '#e8c45f'; for (let i = 0; i < 4; i++) c.fillRect(px + S * (0.08 + i * 0.25), py + S * 0.05, S * 0.08, S * 0.9);
      break;
    }
    case 'T': {
      const pink = (x * 3 + y) % 4 === 0;
      c.fillStyle = 'rgba(30,60,30,0.25)'; c.beginPath(); c.ellipse(px + S / 2, py + S * 0.85, S * 0.45, S * 0.16, 0, 0, TAU); c.fill();
      rr(c, px + S * 0.43, py + S * 0.45, S * 0.14, S * 0.42, S * 0.05); fs(c, '#9a6a3f', INK, lw * 0.7);
      const g1 = pink ? '#ff9fd0' : '#4fbf5a', g2 = pink ? '#ffc6e4' : '#7fdc6b';
      for (const [ox, oy, rad] of [[0.5, 0.36, 0.38], [0.28, 0.48, 0.24], [0.72, 0.48, 0.24]]) { c.beginPath(); c.arc(px + S * ox, py + S * oy, S * rad, 0, TAU); fs(c, g1, INK, lw * 0.8); }
      c.beginPath(); c.arc(px + S * 0.42, py + S * 0.28, S * 0.15, 0, TAU); c.fillStyle = g2; c.fill();
      if (pink) { c.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(px + S * (0.25 + r() * 0.5), py + S * (0.2 + r() * 0.35), S * 0.035, 0, TAU); c.fill(); } }
      break;
    }
    case 'B': {
      rr(c, px + S * 0.04, py + S * 0.02, S * 0.92, S * 0.9, S * 0.08); fs(c, '#a8693c', INK, lw);
      const cols = ['#ff6b8b', '#ffd23f', '#3ddc84', '#2ec4ff', '#8f6bff', '#ff9f1c'];
      for (const sy of [0.1, 0.5]) { for (let i = 0; i < 6; i++) { c.fillStyle = cols[(i + x + (sy > 0.2 ? 2 : 0)) % 6]; c.fillRect(px + S * (0.12 + i * 0.13), py + S * (sy + (i % 3) * 0.02), S * 0.1, S * 0.32 - (i % 3) * S * 0.02); } c.fillStyle = '#7d4a26'; c.fillRect(px + S * 0.08, py + S * (sy + 0.33), S * 0.84, S * 0.05); }
      break;
    }
    case 'D': {
      c.fillStyle = 'rgba(0,0,0,0.12)'; rr(c, px + S * 0.12, py + S * 0.3, S * 0.8, S * 0.62, S * 0.1); c.fill();
      rr(c, px + S * 0.08, py + S * 0.18, S * 0.84, S * 0.5, S * 0.1); fs(c, '#ffe2b0', INK, lw);
      rr(c, px + S * 0.25, py + S * 0.68, S * 0.5, S * 0.24, S * 0.08); fs(c, ['#ff9ccc', '#8fd0ff', '#b9a7ff'][(x + y) % 3], INK, lw * 0.8);
      rr(c, px + S * 0.18, py + S * 0.26, S * 0.3, S * 0.22, S * 0.03); fs(c, '#ffffff', INK, lw * 0.5);
      c.strokeStyle = '#ff6b8b'; c.lineWidth = lw; c.beginPath(); c.moveTo(px + S * 0.6, py + S * 0.3); c.lineTo(px + S * 0.82, py + S * 0.42); c.stroke();
      break;
    }
    case 'K': {
      const left = tileAt(x - 1, y) === 'K', right = tileAt(x + 1, y) === 'K';
      c.fillStyle = '#ff9ccc'; rr(c, px + (left ? -1 : S * 0.06), py + S * 0.2, S + (left ? 1 : -S * 0.06) - (right ? 0 : S * 0.06), S * 0.6, left || right ? 2 : S * 0.1); fs(c, '#ffd6ea', INK, lw);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(px + S * 0.5, py + S * 0.5, S * 0.14, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.5; c.stroke();
      c.fillStyle = ['#ffd23f', '#3ddc84', '#ff6b8b'][(x + y) % 3]; c.beginPath(); c.arc(px + S * 0.5, py + S * 0.5, S * 0.07, 0, TAU); c.fill();
      break;
    }
    case 'b': {
      rr(c, px + S * 0.05, py + S * 0.3, S * 0.9, S * 0.22, S * 0.06); fs(c, '#d99456', INK, lw);
      rr(c, px + S * 0.05, py + S * 0.56, S * 0.9, S * 0.16, S * 0.06); fs(c, '#c27f43', INK, lw);
      break;
    }
    case 'P': {
      rr(c, px + S * 0.3, py + S * 0.55, S * 0.4, S * 0.35, S * 0.08); fs(c, '#ff8a5c', INK, lw);
      for (const a of [-0.9, -0.3, 0.3, 0.9]) { c.beginPath(); c.ellipse(px + S * 0.5 + Math.sin(a) * S * 0.2, py + S * 0.38, S * 0.1, S * 0.24, a, 0, TAU); fs(c, '#3fbf62', INK, lw * 0.7); }
      break;
    }
    case 'F': {
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(px + S / 2, py + S * 0.85, S * 0.25, S * 0.1, 0, 0, TAU); c.fill();
      c.fillStyle = '#d8d8e8'; c.fillRect(px + S * 0.46, py - S * 1.2, S * 0.08, S * 2.05);
      c.beginPath(); c.moveTo(px + S * 0.54, py - S * 1.15); c.quadraticCurveTo(px + S * 1.0, py - S * 1.0, px + S * 1.4, py - S * 0.95); c.lineTo(px + S * 0.54, py - S * 0.65); c.closePath(); fs(c, '#ff5fa2', INK, lw * 0.7);
      c.beginPath(); c.arc(px + S / 2, py - S * 1.22, S * 0.07, 0, TAU); fs(c, '#ffd23f', INK, lw * 0.5);
      break;
    }
    case 'C': {
      c.fillStyle = '#3f8fe0'; c.fillRect(px, py, S, S);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(px + S * 0.6, py + S * 0.65, S * 0.3, S * 0.12, 0, 0, TAU); c.fill();
      rr(c, px + S * 0.32, py + S * 0.1, S * 0.36, S * 0.6, S * 0.08); fs(c, '#d9dde8', INK, lw * 0.8);
      c.fillStyle = '#ffffff'; c.fillRect(px + S * 0.38, py + S * 0.14, S * 0.07, S * 0.5);
      break;
    }
    case 'S': {
      const right = tileAt(x + 1, y) === 'S';
      if (!right) { const px0 = px - S; void px0; }
      if (!right) { const px = (x - 1) * S; rr(c, px + S * 0.08, py + S * 0.1, S * 1.84, S * 0.8, S * 0.12); fs(c, '#e8edf5', INK, lw);
        rr(c, px + S * 0.25, py + S * 0.25, S * 0.6, S * 0.35, S * 0.06); fs(c, '#9fd6ff', INK, lw * 0.6);
        rr(c, px + S * 1.05, py + S * 0.3, S * 0.6, S * 0.5, S * 0.06); fs(c, '#6f8fbf', INK, lw * 0.6);
        c.fillStyle = INK; c.font = `900 ${S * 0.2}px "Trebuchet MS", Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SECURITY', px + S, py + S * 0.78); }
      break;
    }
    case 'V': {
      const cols = ['#ffffff', '#e04848', '#4d7fe0', '#2b2d42', '#c9c9d6', '#f2c14e'];
      const col = cols[(x * 7 + y * 3) % cols.length];
      c.fillStyle = 'rgba(0,0,0,0.2)'; rr(c, px + S * 0.14, py + S * 0.12, S * 0.78, S * 0.86, S * 0.2); c.fill();
      rr(c, px + S * 0.1, py + S * 0.06, S * 0.8, S * 0.86, S * 0.22); fs(c, col, INK, lw);
      rr(c, px + S * 0.2, py + S * 0.2, S * 0.6, S * 0.22, S * 0.08); fs(c, '#a9d8ff', INK, lw * 0.6);
      rr(c, px + S * 0.22, py + S * 0.62, S * 0.56, S * 0.16, S * 0.06); fs(c, '#a9d8ff', INK, lw * 0.6);
      c.fillStyle = '#ffd23f'; c.fillRect(px + S * 0.16, py + S * 0.08, S * 0.12, S * 0.06); c.fillRect(px + S * 0.72, py + S * 0.08, S * 0.12, S * 0.06);
      break;
    }
    case 'Q': {
      c.fillStyle = '#5a3a8a'; c.fillRect(px, py, S, S);
      rr(c, px + S * 0.14, py + S * 0.04, S * 0.72, S * 0.92, S * 0.1); fs(c, '#2b2340', INK, lw);
      for (const [cy, r] of [[0.3, 0.16], [0.68, 0.22]]) { c.beginPath(); c.arc(px + S / 2, py + S * cy, S * r, 0, TAU); fs(c, '#4b4470', '#9b8cff', lw * 0.6); c.beginPath(); c.arc(px + S / 2, py + S * cy, S * r * 0.4, 0, TAU); c.fillStyle = '#9b8cff'; c.fill(); }
      break;
    }
    case 'Y': {
      c.fillStyle = 'rgba(30,60,30,0.25)'; c.beginPath(); c.ellipse(px + S / 2, py + S * 0.88, S * 0.4, S * 0.13, 0, 0, TAU); c.fill();
      c.strokeStyle = '#9a6a3f'; c.lineWidth = S * 0.13; c.lineCap = 'round'; c.beginPath(); c.moveTo(px + S * 0.5, py + S * 0.85); c.quadraticCurveTo(px + S * 0.42, py + S * 0.4, px + S * 0.55, py + S * 0.05); c.stroke();
      c.strokeStyle = INK; c.lineWidth = lw * 0.6; c.stroke();
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; c.beginPath(); c.ellipse(px + S * 0.55 + Math.cos(a) * S * 0.28, py + S * 0.05 + Math.sin(a) * S * 0.16, S * 0.34, S * 0.1, a, 0, TAU); fs(c, i % 2 ? '#3fae4f' : '#58c95e', INK, lw * 0.5); }
      break;
    }
    default: break;
  }
}

/** World decorations drawn over a chunk in world coordinates (canvas clipping keeps them cheap). */
export function drawDecor(c, S) {
  const lw = Math.max(1, S * 0.05);
  // gym court lines (Gym interior 2..9 × 2..6)
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(1.5, S * 0.06);
  c.strokeRect(2.3 * S, 3.3 * S, 7.4 * S, 3.4 * S); c.beginPath(); c.arc(6 * S, 5 * S, 0.9 * S, 0, TAU); c.stroke();
  // the big covered court: white boundary, yellow/orange key areas, centre circle around the generator
  c.lineWidth = Math.max(1.5, S * 0.07); c.strokeStyle = '#ffffff';
  c.strokeRect(16.6 * S, 7.6 * S, 16.8 * S, 9.8 * S);
  c.beginPath(); c.moveTo(25 * S, 7.6 * S); c.lineTo(25 * S, 11.3 * S); c.moveTo(25 * S, 14.7 * S); c.lineTo(25 * S, 17.4 * S); c.stroke();
  c.beginPath(); c.arc(25 * S, 13 * S, 2.4 * S, 0, TAU); c.stroke();
  for (const [kx, dir] of [[16.6, 1], [33.4, -1]]) {
    c.fillStyle = 'rgba(255,196,60,0.85)'; c.fillRect(Math.min(kx * S, (kx + dir * 3.2) * S), 10.6 * S, 3.2 * S, 4.8 * S);
    c.strokeRect(Math.min(kx * S, (kx + dir * 3.2) * S), 10.6 * S, 3.2 * S, 4.8 * S);
    c.beginPath(); c.arc((kx + dir * 3.2) * S, 13 * S, 1.2 * S, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); c.stroke();
  }
  // the 100-year memorial sign hanging at the north end of the court
  plaque(c, 'อนุสรณ์ ๑๐๐ ปี', 20.5 * S, 7.5 * S, S, '#6b3f22', '#f2d48a');
  // car park lines
  c.strokeStyle = '#f2c230'; c.lineWidth = Math.max(1.5, S * 0.06);
  for (let x = 18; x <= 33; x += 2) { c.beginPath(); c.moveTo(x * S, 21.6 * S); c.lineTo(x * S, 23.4 * S); c.moveTo(x * S, 24.6 * S); c.lineTo(x * S, 26.4 * S); c.stroke(); }
  c.beginPath(); c.moveTo(17.3 * S, 24 * S); c.lineTo(33.7 * S, 24 * S); c.setLineDash([S * 0.4, S * 0.3]); c.stroke(); c.setLineDash([]);
  // canteen: red food-stall banners running down the LEFT wall (stall numbers + food), like the real stall row
  const ban = ['🍜', '🍗', '🍛', '🍝'];
  for (let i = 0; i < 4; i++) {
    const by = (10.05 + i * 1.7) * S; const bx = 9.4 * S; const bw = 0.62 * S, bh = 1.5 * S;
    rr(c, bx, by, bw, bh, S * 0.07); fs(c, '#c8302c', INK, lw * 0.6);
    c.fillStyle = '#ffd23f'; c.font = `900 ${S * 0.24}px "Trebuchet MS", Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(11 + i), bx + bw / 2, by + S * 0.25);
    c.font = `${S * 0.34}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.fillText(ban[i], bx + bw / 2, by + S * 0.85);
    c.fillStyle = '#ffffff'; c.fillRect(bx + S * 0.12, by + bh - S * 0.22, bw - S * 0.24, S * 0.06);
  }
  // canteen wall fans
  for (const fy of [12.5, 15.5]) { c.beginPath(); c.arc(13.55 * S, fy * S, S * 0.22, 0, TAU); fs(c, '#2b2d42', INK, lw * 0.5); c.fillStyle = '#9aa0b5'; for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(13.55 * S + Math.cos(k * 2.1) * S * 0.12, fy * S + Math.sin(k * 2.1) * S * 0.12, S * 0.1, S * 0.05, k * 2.1, 0, TAU); c.fill(); } }
  // school name on the English building (front building colours: cream with orange balconies)
  plaque(c, 'โรงเรียนศึกษานารี', 4 * S, 8.55 * S, S, '#fff7df', '#9c5b3c');
  // karaoke stage: big screen on the back wall and a microphone stand
  rr(c, 37.02 * S, 16.12 * S, 1.96 * S, 0.76 * S, S * 0.1); fs(c, '#151032', INK, lw);
  c.beginPath(); c.moveTo(37.5 * S, 15.4 * S); c.lineTo(37.5 * S, 14.5 * S); c.strokeStyle = '#c9c9dd'; c.lineWidth = Math.max(1.5, S * 0.06); c.stroke();
  c.beginPath(); c.ellipse(37.5 * S, 15.42 * S, 0.18 * S, 0.06 * S, 0, 0, TAU); c.fillStyle = '#c9c9dd'; c.fill();
  c.beginPath(); c.arc(37.5 * S, 14.42 * S, 0.11 * S, 0, TAU); fs(c, '#2b2340', '#c9c9dd', lw * 0.6);
  // room + area labels
  const labels = [['Gym', 5.5, 1.95], ['Maths', 22.5, 1.95], ['Karaoke & AV', 37.5, 2.35], ['English', 4, 9.95], ['Canteen', 11.5, 17.0], ['Thai', 6, 22.95], ['Car park', 25, 20.6], ['Garden', 14.5, 21.6], ['Assembly Court', 29.5, 16.6]];
  for (const [t, lx, ly] of labels) sign(c, t, lx * S, ly * S, S);
}

function plaque(c, text, x, y, S, bg, fg) {
  const f = Math.max(8, S * 0.3); c.font = `800 ${f}px "Noto Sans Thai", "Leelawadee UI", Tahoma, "Trebuchet MS", sans-serif`;
  const w = c.measureText(text).width + f * 1.2; rr(c, x - w / 2, y - f * 0.7, w, f * 1.4, f * 0.2); fs(c, bg, INK, Math.max(1, S * 0.04));
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + f * 0.05);
}

function sign(c, text, x, y, S) {
  const f = Math.max(11, Math.min(20, S * 0.52)); c.font = `900 ${f}px "Trebuchet MS", "Arial Rounded MT Bold", Arial, sans-serif`;
  const w = c.measureText(text).width + f; rr(c, x - w / 2, y - f * 0.62, w, f * 1.24, f * 0.4); fs(c, '#ffffff', INK, Math.max(1, S * 0.04));
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + f * 0.04);
}

/** Render a rectangle of the static map (tiles x0..x1, y0..y1) into ctx with tile size S. */
export function renderStatic(c, S, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const code = tileAt(x, y);
    if (code === '#') drawWall(c, x, y, S);
    else if ('fTBDKbPXFSVYCQ'.includes(code)) drawObject(c, code, x, y, S);
    else if (code === 'L' || code === 'G' || code === '~') drawFloor(c, code === 'L' ? (ROOM_OF[y][x] ? FLOOR_OF_ROOM(x, y) : (tileAt(x, y + 1) === 'k' || tileAt(x, y - 1) === 'k' ? 'k' : tileAt(x - 1, y) === 'c' ? 'c' : '.')) : (code === 'G' ? 'k' : ','), x, y, S);
    else drawFloor(c, code, x, y, S);
  }
  drawDecor(c, S);
  // flag pole is tall: redraw so it overlaps tiles above
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tileAt(x, y) === 'F') drawObject(c, 'F', x, y, S);
}

// ---------------------------------------------------------------- dynamic props
export function drawLocker(c, x, y, S, state, t) {
  // x,y = tile centre in px. state: 'ready' | 'cooldown' | 'golden' | 'sleep'
  const lw = Math.max(1, S * 0.05);
  rr(c, x - S * 0.4, y - S * 0.62, S * 0.8, S * 1.08, S * 0.1); fs(c, state === 'golden' ? '#ffd23f' : '#6aa8ff', INK, lw);
  rr(c, x - S * 0.32, y - S * 0.54, S * 0.64, S * 0.92, S * 0.06); fs(c, state === 'golden' ? '#ffe680' : '#8cc0ff', null);
  c.fillStyle = INK; for (let i = 0; i < 3; i++) c.fillRect(x - S * 0.18, y - S * 0.44 + i * S * 0.08, S * 0.36, S * 0.03);
  rr(c, x + S * 0.14, y - S * 0.05, S * 0.08, S * 0.2, S * 0.03); fs(c, '#ffffff', INK, lw * 0.5);
  if (state === 'sleep') return;
  const bob = Math.sin(t * 3 + x) * S * 0.08; const by = y - S * 1.05 + bob;
  if (state !== 'cooldown') {
    const g = c.createRadialGradient(x, by, 1, x, by, S * 0.6); g.addColorStop(0, state === 'golden' ? 'rgba(255,220,80,0.7)' : 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, by, S * 0.6, 0, TAU); c.fill();
  }
  c.beginPath(); c.arc(x, by, S * 0.28, 0, TAU); fs(c, state === 'cooldown' ? '#cfcadf' : state === 'golden' ? '#ffd23f' : '#ffffff', INK, lw);
  c.fillStyle = state === 'cooldown' ? '#8a84a3' : '#ff5fa2'; c.font = `900 ${S * 0.36}px "Trebuchet MS", Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(state === 'cooldown' ? '…' : '?', x, by + S * 0.02);
}

export function drawGenerator(c, S, t, total, flash) {
  const x = GENERATOR.x * S, y = GENERATOR.y * S; const lw = Math.max(1.5, S * 0.06);
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x, y + S * 0.9, S * 1.1, S * 0.3, 0, 0, TAU); c.fill();
  rr(c, x - S * 0.95, y - S * 0.7, S * 1.9, S * 1.6, S * 0.25); fs(c, '#6d6a9c', INK, lw);
  rr(c, x - S * 0.95, y - S * 0.7, S * 1.9, S * 0.45, S * 0.25); fs(c, '#8b88c2', INK, lw);
  // glass tube
  const lvl = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2)) * Math.min(1, 0.3 + total / 30);
  rr(c, x - S * 0.32, y - S * 1.3, S * 0.64, S * 1.6, S * 0.3); fs(c, 'rgba(200,240,255,0.55)', INK, lw);
  c.save(); rr(c, x - S * 0.3, y - S * 1.28, S * 0.6, S * 1.56, S * 0.28); c.clip();
  const gy = y + S * 0.28 - S * 1.5 * lvl;
  const g = c.createLinearGradient(0, gy, 0, y + S * 0.3); g.addColorStop(0, '#fff6a0'); g.addColorStop(1, '#ffb703');
  c.fillStyle = g; c.fillRect(x - S * 0.4, gy, S * 0.8, S * 2);
  c.restore();
  c.fillStyle = INK; c.beginPath(); c.moveTo(x + S * 0.06, y - S * 1.0); c.lineTo(x - S * 0.12, y - S * 0.55); c.lineTo(x + S * 0.02, y - S * 0.55); c.lineTo(x - S * 0.06, y - S * 0.2); c.lineTo(x + S * 0.14, y - S * 0.7); c.lineTo(x, y - S * 0.7); c.closePath(); c.fill();
  const cols = ['#ff9f1c', '#2ec4ff', '#ff5fa2', '#3ddc84'];
  cols.forEach((col, i) => { const lx = x - S * 0.68 + i * S * 0.45 + (i > 1 ? S * 0.18 : 0); c.beginPath(); c.arc(lx, y + S * 0.48, S * 0.13, 0, TAU); fs(c, col, INK, lw * 0.6); });
  if (flash > 0) { c.globalAlpha = flash; const fg = c.createRadialGradient(x, y - S * 0.4, 2, x, y - S * 0.4, S * 3); fg.addColorStop(0, 'rgba(255,240,140,0.9)'); fg.addColorStop(1, 'rgba(255,240,140,0)'); c.fillStyle = fg; c.beginPath(); c.arc(x, y - S * 0.4, S * 3, 0, TAU); c.fill(); c.globalAlpha = 1; }
  c.fillStyle = '#ffffff'; c.font = `900 ${S * 0.26}px "Trebuchet MS", Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.strokeStyle = INK; c.lineWidth = S * 0.08; c.strokeText('GENERATOR', x, y + S * 1.15); c.fillText('GENERATOR', x, y + S * 1.15);
}

export function drawFuse(c, x, y, S, v, t) {
  const bob = Math.sin(t * 4 + x * 0.1) * S * 0.06; y += bob;
  const gold = v >= 2; const lw = Math.max(1, S * 0.05);
  const g = c.createRadialGradient(x, y, 1, x, y, S * 0.55); g.addColorStop(0, gold ? 'rgba(255,230,90,0.8)' : 'rgba(255,240,150,0.6)'); g.addColorStop(1, 'rgba(255,240,150,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, S * 0.55, 0, TAU); c.fill();
  rr(c, x - S * 0.17, y - S * 0.28, S * 0.34, S * 0.56, S * 0.12); fs(c, gold ? '#ffc400' : '#ffe14d', INK, lw);
  rr(c, x - S * 0.09, y - S * 0.36, S * 0.18, S * 0.09, S * 0.03); fs(c, '#c9c9dd', INK, lw * 0.6);
  c.fillStyle = INK; c.beginPath(); c.moveTo(x + S * 0.05, y - S * 0.18); c.lineTo(x - S * 0.08, y + S * 0.03); c.lineTo(x, y + S * 0.03); c.lineTo(x - S * 0.05, y + S * 0.18); c.lineTo(x + S * 0.08, y - S * 0.04); c.lineTo(x, y - S * 0.04); c.closePath(); c.fill();
  if (gold) { c.fillStyle = '#ffffff'; star(c, x + S * 0.2, y - S * 0.25, S * 0.09, t * 3); }
}

export function star(c, x, y, r, rot = 0) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2; const rad = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  c.closePath(); c.fill();
}

// ---------------------------------------------------------------- characters
/**
 * Draw an avatar standing with feet at (x, y). S = tile size in px.
 * o: { avatar, t, moving, dir, zombie, shield, boots, thinking, blink, fuses, gold, emote, alpha, name, crewColor, scale }
 */
export function drawAvatar(c, x, y, S, o) {
  const a = o.avatar; const k = (o.scale || 1) * S; const lw = Math.max(1, Math.min(k * 0.045, 3.4));
  const t = o.t || 0; const ph = o.moving ? t * 12 : 0;
  const bob = o.moving ? Math.abs(Math.sin(ph)) * k * 0.06 : Math.sin(t * 2.2 + (o.seed || 0)) * k * 0.012;
  const skin = o.zombie ? '#a9e27f' : AVATAR.skin[a.skin];
  const hairC = AVATAR.hairColor[a.hairColor]; const oc = AVATAR.outfitColor[a.outfitColor];
  const outfit = AVATAR.outfit[a.outfit]; const hair = AVATAR.hair[a.hair]; const acc = AVATAR.acc[a.acc]; const face = AVATAR.face[a.face];
  c.save(); if (o.alpha !== undefined) c.globalAlpha = o.alpha;
  // shadow
  c.fillStyle = 'rgba(30,20,60,0.22)'; c.beginPath(); c.ellipse(x, y, k * 0.26, k * 0.08, 0, 0, TAU); c.fill();
  if (o.boots) { c.strokeStyle = 'rgba(80,200,255,0.8)'; c.lineWidth = lw * 1.4; for (let i = 0; i < 3; i++) { const ly = y - k * (0.2 + i * 0.15); c.beginPath(); c.moveTo(x - o.dir * k * 0.35, ly); c.lineTo(x - o.dir * k * (0.6 + (i % 2) * 0.1), ly); c.stroke(); } }
  c.translate(x, y - bob); c.scale(o.dir < 0 ? -1 : 1, 1);
  if (o.emote === 'dance') c.rotate(Math.sin(t * 10) * 0.18);
  // legs
  const legSwing = o.moving ? Math.sin(ph) * k * 0.07 : 0;
  const legC = outfit === 'dress' || outfit === 'uniform' ? skin : outfit === 'sporty' ? skin : '#3b3a66';
  for (const [lx, sw] of [[-0.09, legSwing], [0.09, -legSwing]]) { rr(c, k * lx - k * 0.055, -k * 0.24 + sw * 0.3, k * 0.11, k * 0.24, k * 0.05); fs(c, legC, INK, lw); rr(c, k * lx - k * 0.07, -k * 0.04 + sw * 0.3, k * 0.15, k * 0.07, k * 0.035); fs(c, outfit === 'sporty' ? '#ffffff' : '#3a2f4f', INK, lw * 0.8); }
  // body
  const bodyTop = -k * 0.62, bodyH = k * 0.42;
  const armSwing = o.moving ? Math.sin(ph) * 0.5 : 0;
  const arm = (side, sw) => {
    c.save(); c.translate(side * k * 0.2, bodyTop + k * 0.08); c.rotate(o.zombie ? -1.45 + side * 0.12 : (o.emote === 'wave' && side > 0 ? -2.6 + Math.sin(t * 14) * 0.4 : sw * side));
    rr(c, -k * 0.045, 0, k * 0.09, k * 0.27, k * 0.045); fs(c, outfit === 'sporty' || outfit === 'dress' ? skin : (outfit === 'uniform' ? '#ffffff' : oc), INK, lw);
    c.beginPath(); c.arc(0, k * 0.28, k * 0.05, 0, TAU); fs(c, skin, INK, lw * 0.8); c.restore();
  };
  arm(-1, armSwing);
  if (outfit === 'uniform') {
    rr(c, -k * 0.2, bodyTop, k * 0.4, k * 0.26, k * 0.1); fs(c, '#ffffff', INK, lw);
    c.beginPath(); c.moveTo(-k * 0.2, bodyTop + k * 0.22); c.lineTo(k * 0.2, bodyTop + k * 0.22); c.lineTo(k * 0.26, bodyTop + bodyH); c.lineTo(-k * 0.26, bodyTop + bodyH); c.closePath(); fs(c, '#2f3f8f', INK, lw);
    c.fillStyle = oc; c.beginPath(); c.moveTo(0, bodyTop + k * 0.05); c.lineTo(-k * 0.08, bodyTop + k * 0.0); c.lineTo(-k * 0.08, bodyTop + k * 0.1); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, bodyTop + k * 0.05); c.lineTo(k * 0.08, bodyTop); c.lineTo(k * 0.08, bodyTop + k * 0.1); c.closePath(); c.fill();
  } else if (outfit === 'dress') {
    c.beginPath(); c.moveTo(-k * 0.16, bodyTop); c.lineTo(k * 0.16, bodyTop); c.lineTo(k * 0.3, bodyTop + bodyH); c.quadraticCurveTo(0, bodyTop + bodyH + k * 0.05, -k * 0.3, bodyTop + bodyH); c.closePath(); fs(c, oc, INK, lw);
    c.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-k * 0.12 + i * k * 0.12, bodyTop + k * 0.3, k * 0.025, 0, TAU); c.fill(); }
  } else {
    rr(c, -k * 0.2, bodyTop, k * 0.4, bodyH, k * 0.12); fs(c, outfit === 'overalls' ? '#ffffff' : oc, INK, lw);
    if (outfit === 'hoodie') { rr(c, -k * 0.11, bodyTop + k * 0.22, k * 0.22, k * 0.1, k * 0.04); fs(c, shade(oc, -0.15), INK, lw * 0.6); c.strokeStyle = '#ffffff'; c.lineWidth = lw; c.beginPath(); c.moveTo(-k * 0.04, bodyTop + k * 0.03); c.lineTo(-k * 0.05, bodyTop + k * 0.13); c.moveTo(k * 0.04, bodyTop + k * 0.03); c.lineTo(k * 0.05, bodyTop + k * 0.13); c.stroke(); }
    if (outfit === 'sporty') { c.fillStyle = '#ffffff'; c.fillRect(-k * 0.2, bodyTop + k * 0.14, k * 0.4, k * 0.06); rr(c, -k * 0.2, bodyTop + bodyH - k * 0.1, k * 0.4, k * 0.12, k * 0.04); fs(c, shade(oc, -0.3), INK, lw); }
    if (outfit === 'overalls') { rr(c, -k * 0.17, bodyTop + k * 0.14, k * 0.34, bodyH - k * 0.12, k * 0.08); fs(c, oc, INK, lw); c.fillStyle = oc; c.fillRect(-k * 0.14, bodyTop, k * 0.05, k * 0.16); c.fillRect(k * 0.09, bodyTop, k * 0.05, k * 0.16); c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(-k * 0.11, bodyTop + k * 0.16, k * 0.025, 0, TAU); c.arc(k * 0.11, bodyTop + k * 0.16, k * 0.025, 0, TAU); c.fill(); }
    if (outfit === 'jacket') { c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-k * 0.06, bodyTop); c.lineTo(k * 0.06, bodyTop); c.lineTo(k * 0.03, bodyTop + bodyH); c.lineTo(-k * 0.03, bodyTop + bodyH); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke(); }
  }
  arm(1, -armSwing);
  // head
  const hy = bodyTop - k * 0.22; const hr = k * 0.27;
  // back hair
  c.fillStyle = hairC; c.strokeStyle = INK; c.lineWidth = lw;
  if (hair === 'long') { rr(c, -hr * 1.05, hy - hr * 0.3, hr * 2.1, hr * 1.9, hr * 0.6); fs(c, hairC, INK, lw); }
  if (hair === 'ponytail') { c.beginPath(); c.ellipse(-hr * 1.05, hy + hr * 0.2, hr * 0.32, hr * 0.75, 0.5 + Math.sin(t * 5) * (o.moving ? 0.25 : 0.05), 0, TAU); fs(c, hairC, INK, lw); }
  if (hair === 'braids') for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s * hr * 0.92, hy + hr * (0.4 + i * 0.38), hr * 0.2, 0, TAU); fs(c, hairC, INK, lw * 0.8); } }
  if (hair === 'twintails') for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * hr * 1.15, hy + hr * 0.45, hr * 0.28, hr * 0.7, s * 0.25 + Math.sin(t * 5 + s) * (o.moving ? 0.2 : 0.03), 0, TAU); fs(c, hairC, INK, lw); }
  if (hair === 'curly') { for (let i = 0; i < 9; i++) { const ang = Math.PI * 0.85 + i * (Math.PI * 1.3 / 8); c.beginPath(); c.arc(Math.cos(ang) * hr * 0.98, hy + Math.sin(ang) * hr * 0.98 + hr * 0.1, hr * 0.33, 0, TAU); fs(c, hairC, INK, lw * 0.8); } }
  // face
  c.beginPath(); c.arc(0, hy, hr, 0, TAU); fs(c, skin, INK, lw);
  // front hair
  c.fillStyle = hairC;
  c.beginPath(); c.arc(0, hy - hr * 0.08, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(hr * 0.5, hy - hr * 0.2, hr * 0.15, hy - hr * 0.45); c.quadraticCurveTo(-hr * 0.4, hy - hr * 0.1, -hr * 1.0, hy - hr * 0.02); c.closePath(); fs(c, hairC, INK, lw);
  if (hair === 'bob') { for (const s of [-1, 1]) { rr(c, s > 0 ? hr * 0.62 : -hr * 1.02, hy - hr * 0.35, hr * 0.4, hr * 1.05, hr * 0.2); fs(c, hairC, INK, lw); } }
  if (hair === 'pixie') { c.beginPath(); c.moveTo(-hr * 0.2, hy - hr); c.quadraticCurveTo(hr * 0.1, hy - hr * 1.45, hr * 0.35, hy - hr * 0.95); fs(c, hairC, INK, lw); }
  if (hair === 'buns') for (const s of [-1, 1]) { c.beginPath(); c.arc(s * hr * 0.72, hy - hr * 0.88, hr * 0.36, 0, TAU); fs(c, hairC, INK, lw); }
  if (hair === 'long' || hair === 'braids') { for (const s of [-1, 1]) { rr(c, s > 0 ? hr * 0.7 : -hr * 1.0, hy - hr * 0.3, hr * 0.3, hr * 0.9, hr * 0.15); fs(c, hairC, null); } }
  // eyes
  const blink = o.blink; const ey = hy + hr * 0.1;
  for (const s of [-1, 1]) {
    const ex = s * hr * 0.38 + hr * 0.05;
    if (o.zombie) { c.strokeStyle = INK; c.lineWidth = lw; c.beginPath(); c.moveTo(ex - hr * 0.1, ey - hr * 0.1); c.lineTo(ex + hr * 0.1, ey + hr * 0.1); c.moveTo(ex + hr * 0.1, ey - hr * 0.1); c.lineTo(ex - hr * 0.1, ey + hr * 0.1); c.stroke(); continue; }
    if (face === 'cool') continue;
    if (blink || (face === 'wink' && s > 0)) { c.strokeStyle = INK; c.lineWidth = lw * 1.1; c.beginPath(); c.arc(ex, ey + hr * 0.02, hr * 0.12, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); continue; }
    c.fillStyle = INK; c.beginPath(); c.ellipse(ex, ey, hr * 0.15, hr * 0.21, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex + hr * 0.05, ey - hr * 0.08, hr * 0.07, 0, TAU); c.fill(); c.beginPath(); c.arc(ex - hr * 0.05, ey + hr * 0.07, hr * 0.03, 0, TAU); c.fill();
  }
  if (face === 'cool' && !o.zombie) { c.fillStyle = INK; rr(c, -hr * 0.5, ey - hr * 0.15, hr * 0.42, hr * 0.26, hr * 0.1); c.fill(); rr(c, hr * 0.15, ey - hr * 0.15, hr * 0.42, hr * 0.26, hr * 0.1); c.fill(); c.fillRect(-hr * 0.1, ey - hr * 0.1, hr * 0.3, hr * 0.05); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-hr * 0.42, ey - hr * 0.1, hr * 0.12, hr * 0.06); }
  c.fillStyle = 'rgba(255,110,150,0.45)'; c.beginPath(); c.ellipse(-hr * 0.5, ey + hr * 0.3, hr * 0.14, hr * 0.08, 0, 0, TAU); c.ellipse(hr * 0.62, ey + hr * 0.3, hr * 0.14, hr * 0.08, 0, 0, TAU); c.fill();
  c.strokeStyle = INK; c.lineWidth = lw;
  if (o.zombie) { c.beginPath(); c.moveTo(-hr * 0.1, ey + hr * 0.42); for (let i = 0; i < 4; i++) c.lineTo(-hr * 0.1 + (i + 1) * hr * 0.1, ey + hr * (i % 2 ? 0.42 : 0.5)); c.stroke(); }
  else if (face === 'grin' || o.emote === 'laugh') { c.beginPath(); c.moveTo(-hr * 0.12, ey + hr * 0.33); c.quadraticCurveTo(hr * 0.1, ey + hr * 0.7, hr * 0.32, ey + hr * 0.33); c.closePath(); fs(c, '#ff5d7a', INK, lw * 0.8); }
  else if (o.emote === 'wow') { c.beginPath(); c.ellipse(hr * 0.1, ey + hr * 0.45, hr * 0.09, hr * 0.12, 0, 0, TAU); fs(c, '#ff5d7a', INK, lw * 0.8); }
  else { c.lineWidth = Math.max(1, lw * 0.8); c.lineCap = 'round'; c.beginPath(); c.arc(hr * 0.05, ey + hr * 0.3, hr * 0.12, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); }
  // accessory
  const top = hy - hr;
  if (acc === 'bow') { c.fillStyle = '#ff5fa2'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(hr * 0.45, top + hr * 0.15); c.lineTo(hr * 0.45 + s * hr * 0.35, top - hr * 0.05); c.lineTo(hr * 0.45 + s * hr * 0.35, top + hr * 0.35); c.closePath(); fs(c, '#ff5fa2', INK, lw * 0.8); } c.beginPath(); c.arc(hr * 0.45, top + hr * 0.15, hr * 0.1, 0, TAU); fs(c, '#ff8fc0', INK, lw * 0.6); }
  if (acc === 'catears' || acc === 'bunnyears') for (const s of [-1, 1]) {
    c.beginPath();
    if (acc === 'catears') { c.moveTo(s * hr * 0.35, top + hr * 0.2); c.lineTo(s * hr * 0.75, top - hr * 0.35); c.lineTo(s * hr * 0.85, top + hr * 0.35); }
    else c.ellipse(s * hr * 0.45, top - hr * 0.45, hr * 0.17, hr * 0.55, s * 0.2, 0, TAU);
    c.closePath(); fs(c, acc === 'catears' ? hairC : '#ffffff', INK, lw);
    c.fillStyle = '#ffb3cf'; c.beginPath(); if (acc === 'catears') { c.moveTo(s * hr * 0.45, top + hr * 0.15); c.lineTo(s * hr * 0.72, top - hr * 0.15); c.lineTo(s * hr * 0.78, top + hr * 0.25); } else c.ellipse(s * hr * 0.45, top - hr * 0.42, hr * 0.07, hr * 0.35, s * 0.2, 0, TAU); c.fill();
  }
  if (acc === 'headphones') { c.strokeStyle = INK; c.lineWidth = lw * 2.4; c.beginPath(); c.arc(0, hy, hr * 1.08, Math.PI * 1.05, Math.PI * 1.95); c.stroke(); c.strokeStyle = '#ff5fa2'; c.lineWidth = lw * 1.4; c.stroke(); for (const s of [-1, 1]) { rr(c, s * hr * 1.0 - hr * 0.16, hy - hr * 0.2, hr * 0.32, hr * 0.48, hr * 0.12); fs(c, '#ff5fa2', INK, lw); } }
  if (acc === 'flower') { const fx = -hr * 0.55, fy = top + hr * 0.3; c.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(fx + Math.cos(i * 1.26) * hr * 0.16, fy + Math.sin(i * 1.26) * hr * 0.16, hr * 0.12, 0, TAU); fs(c, '#ffffff', INK, lw * 0.5); } c.beginPath(); c.arc(fx, fy, hr * 0.09, 0, TAU); fs(c, '#ffd23f', null); }
  if (acc === 'starclips') { c.fillStyle = '#ffd23f'; star(c, -hr * 0.55, top + hr * 0.35, hr * 0.17); star(c, -hr * 0.2, top + hr * 0.12, hr * 0.13); }
  if (acc === 'glasses' && face !== 'cool') { c.strokeStyle = INK; c.lineWidth = lw; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * hr * 0.36 + hr * 0.08, ey, hr * 0.2, 0, TAU); c.stroke(); } c.beginPath(); c.moveTo(-hr * 0.08, ey); c.lineTo(hr * 0.24, ey); c.stroke(); }
  if (acc === 'crown') { c.beginPath(); c.moveTo(-hr * 0.4, top + hr * 0.1); c.lineTo(-hr * 0.4, top - hr * 0.35); c.lineTo(-hr * 0.2, top - hr * 0.1); c.lineTo(0, top - hr * 0.45); c.lineTo(hr * 0.2, top - hr * 0.1); c.lineTo(hr * 0.4, top - hr * 0.35); c.lineTo(hr * 0.4, top + hr * 0.1); c.closePath(); fs(c, '#ffd23f', INK, lw); }
  if (o.zombie) { c.fillStyle = 'rgba(140,220,110,0.25)'; c.beginPath(); c.arc(0, hy, hr * 1.1, 0, TAU); c.fill(); }
  c.restore();
  // things above the head (not mirrored)
  const headTop = y - bob + (bodyTop - k * 0.22 - hr) ;
  let ay = headTop - k * 0.12;
  if (o.shield) { c.save(); c.globalAlpha = (o.alpha ?? 1) * (0.55 + 0.15 * Math.sin(t * 6)); c.strokeStyle = '#7fe0ff'; c.lineWidth = lw * 1.6; c.fillStyle = 'rgba(127,224,255,0.18)'; c.beginPath(); c.ellipse(x, y - k * 0.5, k * 0.5, k * 0.68, 0, 0, TAU); c.fill(); c.stroke(); c.restore(); }
  if (o.fuses) { for (let i = 0; i < o.fuses; i++) drawFuse(c, x + (i - (o.fuses - 1) / 2) * k * 0.3, ay - k * 0.12, k * 0.7, o.gold && i === 0 ? 2 : 1, t + i); ay -= k * 0.42; }
  if (o.thinking) { c.beginPath(); c.arc(x + k * 0.32, headTop - k * 0.05, k * 0.2, 0, TAU); fs(c, '#ffffff', INK, lw); c.fillStyle = '#8f6bff'; c.font = `900 ${k * 0.26}px "Trebuchet MS", Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x + k * 0.32, headTop - k * 0.04); }
  if (o.name) nameTag(c, x, y + k * 0.18, o.name, o.crewColor, k, o.me);
  return headTop;
}

export function nameTag(c, x, y, name, color, k, me) {
  const f = Math.max(9, k * 0.2); c.font = `800 ${f}px "Trebuchet MS", Arial, sans-serif`;
  const w = c.measureText(name).width + f * 0.9;
  rr(c, x - w / 2, y, w, f * 1.35, f * 0.6); fs(c, color, me ? '#ffffff' : INK, Math.max(1, k * (me ? 0.05 : 0.03)));
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = f * 0.15; c.strokeText(name, x, y + f * 0.7); c.fillText(name, x, y + f * 0.7);
}

export function drawZombie(c, x, y, S, o) {
  const k = (o.scale || 1) * S; const t = o.t || 0; const lw = Math.max(1, k * 0.05);
  const party = o.party; const stun = o.stun;
  const wob = party ? Math.sin(t * 12 + o.seed) * 0.25 : Math.sin(t * 6 + o.seed) * 0.08;
  const hop = party ? Math.abs(Math.sin(t * 12 + o.seed)) * k * 0.15 : Math.abs(Math.sin(t * 6 + o.seed)) * k * 0.04;
  c.save();
  c.fillStyle = 'rgba(30,40,20,0.25)'; c.beginPath(); c.ellipse(x, y, k * 0.3, k * 0.09, 0, 0, TAU); c.fill();
  c.translate(x, y - hop); c.rotate(wob); c.scale(o.dir < 0 ? -1 : 1, 1);
  const body = '#8fd16a', dark = '#6fb34c';
  // feet
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * k * 0.13, -k * 0.03, k * 0.1, k * 0.06, 0, 0, TAU); fs(c, dark, INK, lw); }
  // body
  c.beginPath(); c.moveTo(-k * 0.28, -k * 0.05); c.quadraticCurveTo(-k * 0.34, -k * 0.75, 0, -k * 0.82); c.quadraticCurveTo(k * 0.34, -k * 0.75, k * 0.28, -k * 0.05); c.closePath(); fs(c, body, INK, lw);
  c.beginPath(); c.ellipse(0, -k * 0.25, k * 0.15, k * 0.16, 0, 0, TAU); c.fillStyle = '#b6e897'; c.fill();
  // torn shirt band
  c.fillStyle = '#9b8cff'; c.beginPath(); c.moveTo(-k * 0.29, -k * 0.2); c.lineTo(k * 0.29, -k * 0.2); c.lineTo(k * 0.28, -k * 0.06); c.lineTo(k * 0.15, -k * 0.11); c.lineTo(0, -k * 0.05); c.lineTo(-k * 0.15, -k * 0.11); c.lineTo(-k * 0.28, -k * 0.06); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.7; c.stroke();
  // arms reaching
  const reach = Math.sin(t * 4 + o.seed) * k * 0.03;
  for (const [ay, l] of [[-0.48, 0.34], [-0.4, 0.3]]) { rr(c, k * 0.12, k * ay + reach, k * l, k * 0.1, k * 0.05); fs(c, body, INK, lw); }
  // eyes: one big googly, one small
  c.beginPath(); c.arc(k * 0.06, -k * 0.58, k * 0.12, 0, TAU); fs(c, '#ffffff', INK, lw);
  c.beginPath(); c.arc(k * 0.2, -k * 0.6, k * 0.07, 0, TAU); fs(c, '#ffffff', INK, lw);
  const look = Math.sin(t * 2 + o.seed) * k * 0.03;
  c.fillStyle = INK; c.beginPath(); c.arc(k * 0.08 + look, -k * 0.57, k * 0.05, 0, TAU); c.fill(); c.beginPath(); c.arc(k * 0.21 + look * 0.5, -k * 0.59, k * 0.03, 0, TAU); c.fill();
  if (o.chasing && !stun) { c.strokeStyle = INK; c.lineWidth = lw * 1.2; c.beginPath(); c.moveTo(-k * 0.06, -k * 0.74); c.lineTo(k * 0.14, -k * 0.69); c.stroke(); }
  // stitched grin
  c.strokeStyle = INK; c.lineWidth = lw; c.beginPath(); c.moveTo(-k * 0.02, -k * 0.4); c.quadraticCurveTo(k * 0.12, -k * 0.33, k * 0.25, -k * 0.42); c.stroke();
  for (let i = 0; i < 3; i++) { const sx = k * (0.03 + i * 0.08); c.beginPath(); c.moveTo(sx, -k * 0.42); c.lineTo(sx + k * 0.01, -k * 0.35); c.stroke(); }
  // tuft / party hat
  if (party) { c.beginPath(); c.moveTo(-k * 0.12, -k * 0.8); c.lineTo(k * 0.02, -k * 1.15); c.lineTo(k * 0.14, -k * 0.79); c.closePath(); fs(c, ['#ff5fa2', '#ffd23f', '#2ec4ff'][o.seed % 3], INK, lw); c.beginPath(); c.arc(k * 0.02, -k * 1.15, k * 0.05, 0, TAU); fs(c, '#ffffff', INK, lw * 0.5); }
  else { c.strokeStyle = INK; c.lineWidth = lw; c.beginPath(); c.moveTo(0, -k * 0.82); c.quadraticCurveTo(k * 0.05, -k * 0.98, k * 0.12, -k * 0.94); c.stroke(); }
  c.restore();
  if (stun && !party) { c.fillStyle = '#ffd23f'; for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; star(c, x + Math.cos(a) * k * 0.25, y - k * 0.95 + Math.sin(a) * k * 0.08, k * 0.07); } }
}

// ---------------------------------------------------------------- text
export function outlinedText(c, text, x, y, size, fill, stroke = INK) {
  c.font = `900 ${size}px "Trebuchet MS", "Arial Rounded MT Bold", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.strokeStyle = stroke; c.lineWidth = size * 0.22; c.strokeText(text, x, y); c.fillStyle = fill; c.fillText(text, x, y);
}

export { TAU, W as MAP_W, H as MAP_H, GRID };
