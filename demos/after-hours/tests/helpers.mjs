// Shared test helpers (automated clients only).
import { neighbours } from '../public/js/shared/map-data.js';

export function bfs(a, b) {
  const prev = new Map([[a, null]]); const q = [a];
  while (q.length) { const c = q.shift(); if (c === b) break; for (const n of neighbours(c)) if (!prev.has(n)) { prev.set(n, c); q.push(n); } }
  if (!prev.has(b)) return null; const out = []; let c = b; while (c !== null) { out.unshift(c); c = prev.get(c); } return out;
}
// Client-side crew strategy using only public state (what a sensible student crew might pick).
export function pickOption(v, crewId) {
  const crew = v.crews[crewId]; const m = v.mission; const opts = crew.options.filter((o) => o.affordable);
  const by = (id) => opts.find((o) => o.id === id);
  if (!opts.length) return null;
  if (crew.cornered) return by('repel') || by('hold');
  const rescue = opts.find((o) => o.kind === 'rescue'); if (rescue) return rescue;
  const carried = v.crews.filter((c) => c.carrying).length;
  if (by('collect') && m.needed - m.installed - carried > 0) return by('collect');
  let goal = null;
  if (crew.node === 'GATE') return by('hold');
  if (crew.carrying) goal = 'GEN'; else if (m.power) goal = 'GATE';
  else if (m.needed - m.installed - carried > 0) {
    let best = null; for (const [n, k] of Object.entries(m.fuses)) { if (k <= 0) continue; const p = bfs(crew.node, n); if (p && (!best || p.length < best.length)) best = p; }
    goal = best ? best[best.length - 1] : 'COURT';
  } else goal = 'COURT';
  const p = bfs(crew.node, goal); const step = p && p[1]; const mv = by(`move:${step}`);
  if (mv && !mv.danger) return mv;
  return opts.find((o) => o.kind === 'barricade') || by('hold');
}

