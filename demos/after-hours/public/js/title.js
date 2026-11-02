import { CampusRenderer } from './map-render.js';
import { CREWS } from './shared/map-data.js';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const r = new CampusRenderer(document.getElementById('title-map'), { reducedMotion: reduced, title: true });
r.setState({ phase: 'lobby', crews: CREWS.map((c) => ({ id: c.id, color: c.color, node: c.start, active: true })),
  mission: { fuses: { CLASS: 2, SCI: 2, CANTEEN: 1, HALL: 1 }, installed: 1, needed: 4, power: false, hordes: [{ id: 0, node: 'FIELD' }, { id: 1, node: 'BIKES' }, { id: 2, node: 'COURT' }], barricades: [{ a: 'LIB', b: 'GEN', rounds: 2 }], events: [], decisions: [], eventSeq: 0 } });
