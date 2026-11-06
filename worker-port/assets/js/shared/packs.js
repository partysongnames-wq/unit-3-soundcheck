// Question-pack schema, validation, spreadsheet import and starter packs.
// Shared by the browser (editor, host) and the Node server (room snapshot validation).

export const PACK_FORMAT = 'after-hours-pack';
export const LIMITS = {
  title: 80, description: 240, questionsMin: 1, questionsMax: 30,
  prompt: 300, passage: 700, option: 120, explanation: 400,
  imageChars: 300_000, vocabMax: 30, word: 24, clue: 100,
  packChars: 3_000_000
};
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
export const LETTERS = ['A', 'B', 'C', 'D'];

const str = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');

export function newId(prefix = 'p') {
  const r = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 14);
  return `${prefix}_${r}`;
}

export function validateImage(img) {
  if (img === undefined || img === null || img === '') return { ok: true, value: '' };
  if (typeof img !== 'string') return { ok: false, error: 'image must be a data URL string' };
  if (img.length > LIMITS.imageChars) return { ok: false, error: `image is too large (max ${Math.round(LIMITS.imageChars / 1000)} KB as text)` };
  if (!IMAGE_RE.test(img)) return { ok: false, error: 'image must be a PNG, JPEG, WEBP or GIF data URL' };
  return { ok: true, value: img };
}

/**
 * Validate and normalise a pack. Never throws.
 * @returns {{ok:boolean, errors:string[], pack:object|null}}
 */
export function validatePack(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Pack must be a JSON object.'], pack: null };
  }
  let size = 0;
  try { size = JSON.stringify(input).length; } catch { return { ok: false, errors: ['Pack could not be serialised.'], pack: null }; }
  if (size > LIMITS.packChars) errors.push('Pack is too large (over 3 MB). Use smaller pictures.');

  const title = str(input.title);
  if (!title) errors.push('Pack needs a title.');
  if (title.length > LIMITS.title) errors.push(`Title is longer than ${LIMITS.title} characters.`);
  const description = str(input.description).slice(0, LIMITS.description);

  const qs = Array.isArray(input.questions) ? input.questions : null;
  if (!qs) errors.push('Pack needs a "questions" list.');
  else if (qs.length < LIMITS.questionsMin) errors.push('Pack needs at least one question.');
  else if (qs.length > LIMITS.questionsMax) errors.push(`Pack has more than ${LIMITS.questionsMax} questions.`);

  const questions = [];
  (qs || []).slice(0, LIMITS.questionsMax).forEach((q, i) => {
    const n = i + 1;
    if (!q || typeof q !== 'object') { errors.push(`Question ${n}: not an object.`); return; }
    const prompt = str(q.prompt);
    const passage = str(q.passage);
    const explanation = str(q.explanation);
    const options = Array.isArray(q.options) ? q.options.map(str) : [];
    let correct = q.correct;
    if (typeof correct === 'string') correct = LETTERS.indexOf(correct.trim().toUpperCase());
    if (!prompt) errors.push(`Question ${n}: question text is empty.`);
    if (prompt.length > LIMITS.prompt) errors.push(`Question ${n}: question text is over ${LIMITS.prompt} characters.`);
    if (passage.length > LIMITS.passage) errors.push(`Question ${n}: passage is over ${LIMITS.passage} characters.`);
    if (options.length !== 4) errors.push(`Question ${n}: needs exactly four options.`);
    options.forEach((o, j) => {
      if (!o) errors.push(`Question ${n}: option ${LETTERS[j] || j + 1} is empty.`);
      if (o.length > LIMITS.option) errors.push(`Question ${n}: option ${LETTERS[j] || j + 1} is over ${LIMITS.option} characters.`);
    });
    if (options.length === 4 && new Set(options.map((o) => o.toLowerCase())).size !== 4) errors.push(`Question ${n}: options must be different.`);
    if (!Number.isInteger(correct) || correct < 0 || correct > 3) errors.push(`Question ${n}: correct answer must be A, B, C or D.`);
    if (!explanation) errors.push(`Question ${n}: add a short explanation (the WHY).`);
    if (explanation.length > LIMITS.explanation) errors.push(`Question ${n}: explanation is over ${LIMITS.explanation} characters.`);
    const img = validateImage(q.image);
    if (!img.ok) errors.push(`Question ${n}: ${img.error}.`);
    const id = typeof q.id === 'string' && /^[\w-]{1,40}$/.test(q.id) ? q.id : `q${n}`;
    questions.push({ id, prompt, passage, options: options.slice(0, 4), correct: Number.isInteger(correct) ? correct : 0, explanation, image: img.ok ? img.value : '' });
  });

  const vocab = [];
  if (input.vocab !== undefined) {
    if (!Array.isArray(input.vocab)) errors.push('"vocab" must be a list.');
    else input.vocab.slice(0, LIMITS.vocabMax).forEach((v, i) => {
      const word = str(v && v.word); const clue = str(v && v.clue);
      if (!word || !clue) { errors.push(`Vocabulary ${i + 1}: needs a word and a clue.`); return; }
      if (word.length > LIMITS.word || clue.length > LIMITS.clue) { errors.push(`Vocabulary ${i + 1}: word or clue is too long.`); return; }
      vocab.push({ word, clue });
    });
  }
  const ids = new Set();
  questions.forEach((q, i) => { if (ids.has(q.id)) q.id = `q${i + 1}_${i}`; ids.add(q.id); });

  const id = typeof input.id === 'string' && /^[\w-]{1,48}$/.test(input.id) ? input.id : newId('pack');
  const pack = { format: PACK_FORMAT, version: 1, id, title: title.slice(0, LIMITS.title), description, vocab, questions };
  return { ok: errors.length === 0, errors, pack: errors.length === 0 ? pack : null };
}

/** Parse tab-separated text pasted from a spreadsheet (quoted cells supported). */
export function parseTSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/**
 * Spreadsheet format (one question per row, tab-separated):
 * Question | Option A | Option B | Option C | Option D | Correct (A-D) | Explanation | Passage (optional)
 * A header row whose first cell is "Question" is skipped.
 */
export function importSpreadsheet(text) {
  const rows = parseTSV(text);
  const errors = []; const questions = [];
  rows.forEach((r, i) => {
    if (i === 0 && /^question/i.test((r[0] || '').trim())) return;
    const line = i + 1;
    if (r.length < 7) { errors.push(`Row ${line}: needs at least 7 columns (Question, A, B, C, D, Correct, Explanation). Found ${r.length}.`); return; }
    const correctRaw = (r[5] || '').trim().toUpperCase();
    let correct = LETTERS.indexOf(correctRaw);
    if (correct < 0 && /^[1-4]$/.test(correctRaw)) correct = Number(correctRaw) - 1;
    if (correct < 0) { errors.push(`Row ${line}: correct answer "${r[5]}" must be A, B, C, D or 1-4.`); return; }
    questions.push({ id: newId('q'), prompt: r[0], options: [r[1], r[2], r[3], r[4]], correct, explanation: r[6], passage: r[7] || '' });
  });
  if (!questions.length && !errors.length) errors.push('No rows found. Paste rows copied from a spreadsheet.');
  // validate the rows by wrapping them in a temporary pack
  if (questions.length) {
    const v = validatePack({ title: 'import', questions });
    if (!v.ok) errors.push(...v.errors.filter((e) => e.startsWith('Question')).map((e) => e.replace(/^Question (\d+)/, (m, n) => `Imported row ${n}`)));
  }
  return { questions: errors.length ? [] : questions, errors };
}

/** Public (student-safe) view of a question: no correct index, no explanation. */
export function publicQuestion(q) {
  return { id: q.id, prompt: q.prompt, passage: q.passage, options: q.options.slice(), image: q.image || '' };
}

export const STARTER_VOCAB = [
  { word: 'publish', clue: 'to print a text so the public can read it' },
  { word: 'collect', clue: 'to gather things together over time' },
  { word: 'suitable', clue: 'right for a person or a purpose' },
  { word: 'scary', clue: 'making you feel afraid' },
  { word: 'primarily', clue: 'mainly; mostly (not 100%)' },
  { word: 'text', clue: 'a piece of written words' },
  { word: 'add', clue: 'to put something extra in' },
  { word: 'belief', clue: 'an idea that you think is true' },
  { word: 'magical', clue: 'with special powers that are not real' },
  { word: 'although', clue: 'joins two ideas that contrast' }
];

export const STARTER_PACK = {
  format: PACK_FORMAT, version: 1, id: 'starter-grimm-8a',
  title: 'Old Tales, New Readers (Unit 8A practice)',
  description: 'Editable teacher-authored practice inspired by the topic of Reading Explorer 1 Unit 8A (The Brothers Grimm). Original micro-passages; not textbook questions.',
  vocab: STARTER_VOCAB,
  questions: [
    { id: 'q1', passage: 'Every evening, Mali\'s grandmother told a story from her village. Mali wrote each one in a notebook. After a year, she had collected forty stories.',
      prompt: 'In this text, "collected" means that Mali…',
      options: ['bought the stories from a shop', 'gathered the stories together over time', 'forgot most of the stories', 'turned every story into a song'], correct: 1,
      explanation: 'To collect is to bring things together, one by one. Mali wrote one story each evening until she had forty.' },
    { id: 'q2', passage: 'The school book club typed up its favourite stories, printed 200 copies and sold them to parents at the book fair.',
      prompt: 'Which word best describes what the club did with its stories?',
      options: ['published', 'believed', 'removed', 'frightened'], correct: 0,
      explanation: 'Publish = prepare and print a text so that the public can read or buy it. Printing copies to sell is publishing.' },
    { id: 'q3', passage: 'Long ago, many folk tales were told primarily for adults, although some children listened too.',
      prompt: 'What does this sentence tell us about the audience?',
      options: ['Only adults ever heard the tales.', 'Children were the main audience.', 'Most listeners were adults, but not all of them.', 'Nobody listened to the tales.'], correct: 2,
      explanation: 'Primarily means mainly, not entirely. The "although" part shows that some children listened as well.' },
    { id: 'q4', passage: '',
      prompt: 'Choose the best ending: "Although the story has a happy ending, …"',
      options: ['everyone is happy at the end.', 'the ending makes readers smile.', 'it is a cheerful, happy story.', 'its first half is dark and scary.'], correct: 3,
      explanation: '"Although" joins two ideas that contrast. A happy ending contrasts with a dark, scary beginning. The other endings only repeat "happy".' },
    { id: 'q5', passage: 'A publisher wants a bedtime book for five-year-olds. Version 1 of a tale describes a wolf chasing children through a dark forest in frightening detail. Version 2 keeps the forest, but the wolf is silly and the ending is gentle.',
      prompt: 'Which version is more suitable for this book, and why?',
      options: ['Version 2, because it fits very young readers at bedtime.', 'Version 1, because young children need lots of detail.', 'Version 1, because it is longer.', 'Neither, because books for children cannot have animals.'], correct: 0,
      explanation: 'Suitable = right for a particular person or purpose. The audience is five-year-olds at bedtime, so the gentle version fits best.' },
    { id: 'q6', passage: '',
      prompt: 'Which sentence uses "scary" correctly?',
      options: ['The music was scary, so we laughed and relaxed.', 'The scary noise in the empty hallway made us stop and listen.', 'She felt scary because she won the prize.', 'The soup was scary and delicious.'], correct: 1,
      explanation: 'Scary describes the thing that causes fear (a noise). A person who feels fear is "scared", not "scary".' },
    { id: 'q7', passage: 'In many old tales, magical things happen: animals talk, and a kiss can break a spell. The storytellers did not always think these things were real, but their stories showed their beliefs about right and wrong.',
      prompt: 'According to the text, what did the stories show?',
      options: ['true facts about how animals talk', 'the storytellers\' ideas about good and bad behaviour', 'that magic is real', 'how to break a spell'], correct: 1,
      explanation: 'The last sentence says the stories showed beliefs about right and wrong. Magical events are part of the story, not facts.' },
    { id: 'q8', passage: 'Later editions of many fairy-tale collections were changed. Editors added lessons about good behaviour and removed some violent details.',
      prompt: 'What is the most likely reason for these changes?',
      options: ['to make the books more suitable for families and children', 'to make the stories scarier for adults', 'because the first storytellers asked for it', 'to make the books more expensive'], correct: 0,
      explanation: 'This is an inference. Adding lessons and removing violence makes a text better for young readers. The text never mentions storytellers asking or prices.' },
    { id: 'q9', passage: '',
      prompt: 'Which order makes the most sense for how many folk tales became books?',
      options: ['published → told aloud → collected', 'collected → told aloud → published', 'told aloud → collected → published', 'told aloud → published → collected'], correct: 2,
      explanation: 'Folk tales were spoken first (oral storytelling). Then someone gathered and wrote them down (collected). Then they were printed (published).' },
    { id: 'q10', passage: 'Nok says fairy tales are only for children. Her teacher shows her an old collection. The stories are long, many words are difficult, and some scenes are dark. "These were not mainly written for young readers," the teacher says.',
      prompt: 'Which detail best supports the teacher\'s point?',
      options: ['The book is old.', 'Nok likes fairy tales.', 'The stories have a teacher in them.', 'The words are difficult and some scenes are dark.'], correct: 3,
      explanation: 'Evidence must support the claim. Difficult words and dark scenes suggest an older audience. "The book is old" does not show who it was for.' },
    { id: 'q11', passage: '',
      prompt: 'Your teacher says, "Read the text on page 4 and underline the main idea." Here, "text" means…',
      options: ['a phone message only', 'a picture on the page', 'a song you sing', 'a piece of written words that you read'], correct: 3,
      explanation: 'In reading lessons, a text is any piece of writing. A phone message is one kind of text, but you cannot underline the main idea of a song or a picture.' },
    { id: 'q12', passage: 'Although many people now think fairy tales are primarily for children, early collections had a much wider audience.',
      prompt: 'Which statement agrees with the sentence?',
      options: ['Early collections were only for children.', 'Fairy tales are entirely for adults now.', 'Today, many people think of fairy tales mainly as children\'s stories.', 'Nobody reads fairy tales today.'], correct: 2,
      explanation: 'Primarily = mainly. The sentence says people NOW think fairy tales are mainly for children, although early collections were for a wider audience.' }
  ]
};

export const GENERIC_PACK = {
  format: PACK_FORMAT, version: 1, id: 'starter-past-simple',
  title: 'Quick Check: Past Simple (generic demo)',
  description: 'A tiny generic pack that shows the game works with any topic. Editable.',
  vocab: [
    { word: 'went', clue: 'past of go' }, { word: 'saw', clue: 'past of see' },
    { word: 'wrote', clue: 'past of write' }, { word: 'found', clue: 'past of find' },
    { word: 'ran', clue: 'past of run' }, { word: 'told', clue: 'past of tell' }
  ],
  questions: [
    { id: 'g1', passage: '', prompt: 'Yesterday we ___ to the library after school.', options: ['go', 'went', 'going', 'goes'], correct: 1, explanation: '"Yesterday" means finished past time, so we use the past simple: went.' },
    { id: 'g2', passage: '', prompt: 'She ___ a story for the school magazine last week.', options: ['wrote', 'writes', 'writing', 'write'], correct: 0, explanation: '"Last week" is past time. The past of write is wrote (irregular).' },
    { id: 'g3', passage: '', prompt: 'Which question is correct?', options: ['Did you saw the poster?', 'Did you seeing the poster?', 'Do you saw the poster?', 'Did you see the poster?'], correct: 3, explanation: 'After "did", use the base verb: Did you see…? "Did" already shows the past.' },
    { id: 'g4', passage: '', prompt: 'They ___ the lost key under the desk.', options: ['find', 'finded', 'found', 'founding'], correct: 2, explanation: 'Find is irregular: find → found. "Finded" is not a word.' },
    { id: 'g5', passage: '', prompt: 'Choose the negative sentence that is correct.', options: ['He didn\'t ran home.', 'He didn\'t run home.', 'He not ran home.', 'He don\'t run home.'], correct: 1, explanation: 'Negative past simple = didn\'t + base verb: didn\'t run.' },
    { id: 'g6', passage: '', prompt: 'My grandmother ___ me a funny story last night.', options: ['told', 'tell', 'telled', 'tells'], correct: 0, explanation: '"Last night" is past time. Tell is irregular: tell → told.' }
  ]
};

export const BUILT_IN_PACKS = [STARTER_PACK, GENERIC_PACK];
