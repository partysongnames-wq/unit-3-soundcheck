// Teacher's question packs, persisted in this browser's localStorage only.
import { BUILT_IN_PACKS, validatePack, newId } from './shared/packs.js';

const KEY = 'afterhours.packs.v1';
const clone = (o) => JSON.parse(JSON.stringify(o));

export function loadStore() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { data = null; }
  if (!data || !Array.isArray(data.packs)) {
    data = { packs: BUILT_IN_PACKS.map(clone), selectedId: BUILT_IN_PACKS[0].id, savedAt: null };
  }
  data.packs = data.packs.filter((p) => p && typeof p === 'object' && typeof p.id === 'string');
  if (!data.packs.length) data.packs = BUILT_IN_PACKS.map(clone);
  if (!data.packs.some((p) => p.id === data.selectedId)) data.selectedId = data.packs[0].id;
  return data;
}

/** @returns {{ok:boolean, error?:string}} */
export function saveStore(data) {
  try {
    data.savedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.name === 'QuotaExceededError') ? 'Browser storage is full. Remove some pictures or packs, then try again.' : 'Could not save to this browser.' };
  }
}

export function blankPack() {
  return { format: 'after-hours-pack', version: 1, id: newId('pack'), title: 'New pack', description: '', vocab: [], questions: [blankQuestion()] };
}
export function blankQuestion() {
  return { id: newId('q'), passage: '', prompt: '', options: ['', '', '', ''], correct: 0, explanation: '', image: '' };
}
export function duplicatePack(p) {
  const c = clone(p); c.id = newId('pack'); c.title = `${p.title} (copy)`.slice(0, 80);
  c.questions.forEach((q) => { q.id = newId('q'); });
  return c;
}
export function checkPack(p) { return validatePack(p); }
export { clone };
