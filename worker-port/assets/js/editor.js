import { h, LETTERS } from './net.js';
import { loadStore, saveStore, blankPack, blankQuestion, duplicatePack, clone } from './packstore.js';
import { validatePack, validateImage, importSpreadsheet, LIMITS, newId } from './shared/packs.js';

const $ = (id) => document.getElementById(id);
const data = loadStore();
let openQ = new Set();
let saveTimer = null;

const cur = () => data.packs.find((p) => p.id === data.selectedId);

function save(now = false) {
  clearTimeout(saveTimer);
  const run = () => {
    const r = saveStore(data); const s = $('saveState');
    if (r.ok) { s.className = 'save-state'; s.textContent = `Saved ✓ ${new Date().toLocaleTimeString()}`; }
    else { s.className = 'save-state bad'; s.textContent = r.error; }
  };
  if (now) run(); else saveTimer = setTimeout(run, 250);
}

function sideMsg(text, bad = false) { const m = $('sideMsg'); m.textContent = text; m.className = `msg${bad ? ' bad' : ''}`; }

function renderList() {
  const ul = $('packList'); ul.replaceChildren();
  for (const p of data.packs) {
    ul.append(h('li', {}, h('button', { class: p.id === data.selectedId ? 'sel' : '', onclick: () => { data.selectedId = p.id; openQ = new Set(); save(true); renderAll(); } },
      p.title || '(untitled)', h('span', { class: 'n', text: `${p.questions.length} questions${validatePack(p).ok ? '' : ' · needs fixing'}` }))));
  }
}

function renderAll() { renderList(); renderMain(); }

function statusEl(p) {
  const v = validatePack(p);
  return v.ok ? h('div', { id: 'packStatus', class: 'status-ok', text: '✔ Ready to play' })
    : h('div', { id: 'packStatus', class: 'status-bad', text: `Fix before playing:\n• ${v.errors.slice(0, 6).join('\n• ')}${v.errors.length > 6 ? `\n…and ${v.errors.length - 6} more` : ''}` });
}
function refreshStatus() { const p = cur(); const old = $('packStatus'); if (old) old.replaceWith(statusEl(p)); renderList(); }

function changed() { save(); refreshStatus(); }

function renderMain() {
  const p = cur(); const main = $('main'); main.replaceChildren();
  const vocabText = (p.vocab || []).map((v) => `${v.word} = ${v.clue}`).join('\n');
  main.append(h('section', { class: 'card' },
    h('h2', { text: 'Pack details' }),
    h('label', { class: 'fld' }, 'Pack name', h('input', { id: 'pTitle', value: p.title, maxlength: LIMITS.title, oninput: (e) => { p.title = e.target.value; changed(); } })),
    h('label', { class: 'fld' }, 'Description (optional)', h('textarea', { maxlength: LIMITS.description, oninput: (e) => { p.description = e.target.value; changed(); } }, p.description || '')),
    h('label', { class: 'fld' }, 'Key vocabulary (optional)', h('span', { class: 'hint', text: 'One per line: word = short clue. Saved with the pack for your reference.' }),
      h('textarea', { id: 'vocabIn', oninput: (e) => { p.vocab = parseVocab(e.target.value); changed(); } }, vocabText)),
    statusEl(p)));

  const list = h('div', { class: 'qlist' });
  p.questions.forEach((q, i) => list.append(questionEl(p, q, i)));
  main.append(h('section', { class: 'card' },
    h('div', { class: 'row' }, h('h2', { text: `Questions (${p.questions.length})`, style: { margin: 0, flex: 1 } }),
      h('button', { class: 'btn small primary', id: 'addQ', onclick: () => { if (p.questions.length >= LIMITS.questionsMax) return sideMsg(`Maximum ${LIMITS.questionsMax} questions.`, true); const q = blankQuestion(); p.questions.push(q); openQ.add(q.id); changed(); renderMain(); } , text: '+ Add question' })),
    h('p', { class: 'muted small', text: 'About 12 questions makes a 10–15 minute mission. Spread correct answers across A, B, C and D.' }),
    list));

  main.append(h('section', { class: 'card' },
    h('h2', { text: 'Paste from a spreadsheet' }),
    h('p', { class: 'muted small', text: 'Copy rows from Google Sheets / Excel and paste below. Columns (tab-separated), one question per row. A header row starting with "Question" is skipped. Use A–D (or 1–4) for the correct answer.' }),
    h('pre', { class: 'fmt', text: 'Question\tOption A\tOption B\tOption C\tOption D\tCorrect\tExplanation\tPassage (optional)\nWhat does "collect" mean?\tto lose\tto gather\tto sell\tto print\tB\tCollect = bring together.\t' }),
    h('label', { class: 'fld' }, 'Rows to add', h('textarea', { id: 'tsvIn', rows: 5, placeholder: 'Paste spreadsheet rows here…' })),
    h('div', { class: 'row' }, h('button', { class: 'btn small primary', id: 'tsvAdd', onclick: () => addTSV(p), text: 'Add rows to this pack' })),
    h('p', { id: 'tsvMsg', class: 'msg', role: 'alert' })));
}

function parseVocab(text) {
  return text.split('\n').map((l) => l.split(/\s*[=:]\s*/)).filter((a) => a.length >= 2 && a[0].trim() && a.slice(1).join(' ').trim())
    .map(([w, ...c]) => ({ word: w.trim().slice(0, LIMITS.word), clue: c.join(' ').trim().slice(0, LIMITS.clue) })).slice(0, LIMITS.vocabMax);
}

function addTSV(p) {
  const r = importSpreadsheet($('tsvIn').value);
  const m = $('tsvMsg');
  if (r.errors.length) { m.className = 'msg bad'; m.textContent = `Nothing added. Please fix:\n• ${r.errors.slice(0, 8).join('\n• ')}`; return; }
  if (p.questions.length + r.questions.length > LIMITS.questionsMax) { m.className = 'msg bad'; m.textContent = `That would make more than ${LIMITS.questionsMax} questions.`; return; }
  // remove an untouched blank starter question
  if (p.questions.length === 1 && !p.questions[0].prompt && p.questions[0].options.every((o) => !o)) p.questions = [];
  p.questions.push(...r.questions);
  $('tsvIn').value = '';
  save(true); renderMain();
  const m2 = $('tsvMsg'); m2.className = 'msg'; m2.textContent = `Added ${r.questions.length} question(s).`;
}

function qValid(q) { return validatePack({ title: 'x', questions: [q] }); }

function questionEl(p, q, i) {
  const v = qValid(q);
  const item = h('div', { class: `qitem${v.ok ? '' : ' bad'}`, 'data-qid': q.id });
  const sum = h('span', { class: 'sum', text: q.prompt || '(empty question)' });
  const ans = h('span', { class: 'ans', text: LETTERS[q.correct] || '?' });
  const move = (d) => { const j = i + d; if (j < 0 || j >= p.questions.length) return; [p.questions[i], p.questions[j]] = [p.questions[j], p.questions[i]]; changed(); renderMain(); };
  item.append(h('div', { class: 'qhead' },
    h('span', { class: 'num', text: `${i + 1}.` }), sum, ans,
    h('button', { class: 'btn small', 'aria-label': `Move question ${i + 1} up`, disabled: i === 0, onclick: () => move(-1), text: '↑' }),
    h('button', { class: 'btn small', 'aria-label': `Move question ${i + 1} down`, disabled: i === p.questions.length - 1, onclick: () => move(1), text: '↓' }),
    h('button', { class: 'btn small', onclick: () => preview(q), text: 'Preview' }),
    h('button', { class: 'btn small', 'aria-expanded': String(openQ.has(q.id)), onclick: () => { openQ.has(q.id) ? openQ.delete(q.id) : openQ.add(q.id); renderMain(); }, text: openQ.has(q.id) ? 'Close' : 'Edit' }),
    h('button', { class: 'btn small danger', 'aria-label': `Delete question ${i + 1}`, onclick: () => { if (p.questions.length <= 1) return sideMsg('A pack needs at least one question.', true); if (!confirm(`Delete question ${i + 1}?`)) return; p.questions.splice(i, 1); changed(); renderMain(); }, text: '✕' })));
  if (!openQ.has(q.id)) return item;
  const upd = () => { sum.textContent = q.prompt || '(empty question)'; ans.textContent = LETTERS[q.correct]; item.classList.toggle('bad', !qValid(q).ok); changed(); };
  const imgBox = h('div', { class: 'img-row' });
  const drawImg = () => {
    imgBox.replaceChildren();
    if (q.image) imgBox.append(h('img', { src: q.image, alt: 'Question picture preview' }), h('button', { class: 'btn small', onclick: () => { q.image = ''; drawImg(); upd(); }, text: 'Remove picture' }));
    const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', 'aria-label': 'Add a small picture' });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0]; if (!f) return;
      try { q.image = await shrinkImage(f); drawImg(); upd(); sideMsg('Picture added.'); } catch (e) { sideMsg(e.message, true); }
    });
    imgBox.append(fileIn);
  };
  drawImg();
  const body = h('div', { class: 'qbody' },
    h('label', { class: 'fld' }, 'Passage (optional, original text)', h('textarea', { maxlength: LIMITS.passage, oninput: (e) => { q.passage = e.target.value; upd(); } }, q.passage || '')),
    h('label', { class: 'fld' }, 'Question', h('textarea', { maxlength: LIMITS.prompt, rows: 2, oninput: (e) => { q.prompt = e.target.value; upd(); } }, q.prompt || '')),
    h('div', { class: 'fld' }, 'Small picture (optional, PNG/JPEG/WEBP/GIF — resized automatically)', imgBox),
    h('div', { class: 'fld' }, 'Options — choose the correct one',
      q.options.map((o, j) => h('div', { class: 'opt-row' },
        h('label', { class: 'c' }, h('input', { type: 'radio', name: `c_${q.id}`, checked: q.correct === j, onchange: () => { q.correct = j; upd(); } }), LETTERS[j]),
        h('input', { value: o, maxlength: LIMITS.option, 'aria-label': `Option ${LETTERS[j]}`, oninput: (e) => { q.options[j] = e.target.value; upd(); } })))),
    h('label', { class: 'fld' }, 'Explanation — the WHY shown after the reveal', h('textarea', { maxlength: LIMITS.explanation, oninput: (e) => { q.explanation = e.target.value; upd(); } }, q.explanation || '')));
  item.append(body);
  return item;
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('Pictures must be PNG, JPEG, WEBP or GIF.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Picture file is too big (over 8 MB).'));
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const [max, qual] of [[640, 0.82], [480, 0.7], [360, 0.6]]) {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        const d = cv.toDataURL('image/jpeg', qual);
        if (validateImage(d).ok) return resolve(d);
      }
      reject(new Error('Picture is still too large after resizing.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable picture.')); };
    img.src = url;
  });
}

function preview(q) {
  const m = $('previewModal'); let picked = null;
  const draw = () => {
    m.replaceChildren(h('div', { class: 'box' },
      h('div', { class: 'row' }, h('b', { text: 'Preview — as students see it', style: { flex: 1 } }), h('button', { class: 'btn small', id: 'pvClose', onclick: close, text: 'Close' })),
      q.passage ? h('div', { class: 'pv-passage', text: q.passage }) : null,
      h('div', { class: 'pv-prompt', text: q.prompt || '(empty question)' }),
      q.image ? h('img', { src: q.image, alt: '', style: { maxHeight: '160px', alignSelf: 'center', borderRadius: '8px' } }) : null,
      q.options.map((o, j) => h('button', { class: `pv-opt${picked !== null && j === q.correct ? ' correct' : ''}${picked === j && j !== q.correct ? ' wrong' : ''}`, onclick: () => { picked = j; draw(); } }, h('b', { text: LETTERS[j] }), o || '(empty)')),
      picked !== null ? h('div', { class: 'pv-passage', style: { borderColor: 'var(--good)' } }, h('b', { text: `Answer ${LETTERS[q.correct]}. WHY: ` }), q.explanation || '(no explanation yet)') : h('p', { class: 'muted small', text: 'Tap an option to see the reveal.' })));
  };
  const close = () => { m.classList.add('hidden'); m.replaceChildren(); };
  m.onclick = (e) => { if (e.target === m) close(); };
  draw(); m.classList.remove('hidden'); $('pvClose').focus();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('previewModal').classList.contains('hidden')) { $('previewModal').classList.add('hidden'); } });

// ----- side actions -----
$('newPack').onclick = () => { const p = blankPack(); data.packs.push(p); data.selectedId = p.id; openQ = new Set([p.questions[0].id]); save(true); renderAll(); sideMsg('New pack created.'); };
$('dupPack').onclick = () => { const p = duplicatePack(cur()); data.packs.push(p); data.selectedId = p.id; save(true); renderAll(); sideMsg('Pack duplicated.'); };
$('delPack').onclick = () => {
  const p = cur(); if (!confirm(`Delete the pack "${p.title}"? This cannot be undone (export it first to keep a copy).`)) return;
  data.packs = data.packs.filter((x) => x.id !== p.id);
  if (!data.packs.length) data.packs.push(blankPack());
  data.selectedId = data.packs[0].id; save(true); renderAll(); sideMsg('Pack deleted.');
};
$('exportPack').onclick = () => {
  const p = cur(); const v = validatePack(p);
  const blob = new Blob([JSON.stringify(v.ok ? v.pack : p, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${(p.title || 'pack').replace(/[^\w-]+/g, '_').slice(0, 40)}.after-hours.json` });
  document.body.append(a); a.click(); a.remove();
  sideMsg(v.ok ? 'Exported.' : 'Exported (note: this pack still has problems to fix).');
};
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > LIMITS.packChars) return sideMsg('That file is too large (over 3 MB).', true);
  let obj;
  try { obj = JSON.parse(await f.text()); } catch { return sideMsg('That file is not valid JSON.', true); }
  const list = Array.isArray(obj && obj.packs) ? obj.packs : [obj];
  const ok = []; const errs = [];
  list.slice(0, 20).forEach((p, i) => { const v = validatePack(p); if (v.ok) ok.push(v.pack); else errs.push(`Pack ${i + 1}: ${v.errors.slice(0, 4).join(' ')}`); });
  if (errs.length) return sideMsg(`Import rejected — nothing was changed.\n${errs.join('\n')}`, true);
  for (const p of ok) { if (data.packs.some((x) => x.id === p.id)) p.id = newId('pack'); data.packs.push(clone(p)); }
  data.selectedId = ok[ok.length - 1].id; save(true); renderAll(); sideMsg(`Imported ${ok.length} pack(s).`);
});
$('printPack').onclick = () => {
  const p = cur(); const area = $('printArea');
  area.replaceChildren(
    h('h1', { text: p.title }), h('p', { text: `${p.description || ''} Name/callsign: ____________` }),
    p.questions.map((q, i) => h('div', { class: 'pq' }, h('b', { text: `${i + 1}. ` }), q.prompt, q.passage ? h('div', { class: 'pp', text: q.passage }) : null, q.image ? h('div', {}, h('img', { src: q.image, alt: '' })) : null, h('ol', { class: 'o' }, q.options.map((o) => h('li', { text: o }))))),
    h('div', { class: 'key' }, h('h1', { text: `Answer key — ${p.title}` }), p.questions.map((q, i) => h('div', { class: 'pq' }, h('b', { text: `${i + 1}. ${LETTERS[q.correct]} ` }), q.explanation))));
  window.print();
};

renderAll();
save(true);
