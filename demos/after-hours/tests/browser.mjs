// Real-browser acceptance run (headless Chromium via Playwright).
// Projector 1366x768 + phones 390x844. Fails on console/page errors or horizontal overflow.
// Some extra crew members are automated HTTP clients (SIMULATED, not real devices).
// Usage: node tests/browser.mjs        (screenshots -> screenshots/)
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { STARTER_PACK, GENERIC_PACK } from '../public/js/shared/packs.js';
import { pickOption } from './helpers.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. Install with: npm i -D playwright && npx playwright install chromium'); process.exit(2);
}
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHOTS = path.join(ROOT, 'screenshots'); mkdirSync(SHOTS, { recursive: true });
const server = createServer({ port: 0, log: () => {} });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const problems = []; const results = [];
const check = (name, ok, detail = '') => { results.push({ check: name, result: ok ? 'PASS' : 'FAIL', detail }); if (!ok) problems.push(`${name} ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(w, h, label, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500, ...opts });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') problems.push(`[${label}] console: ${m.text()}`); });
  p.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function noOverflow(p, name) {
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  check(`no horizontal overflow: ${name}`, o.sw <= o.w, `${o.sw}px vs ${o.w}px`);
}
const shot = (p, name, full = false) => p.screenshot({ path: path.join(SHOTS, name), fullPage: full });
async function api(pth, { method = 'GET', body, headers = {} } = {}) {
  const r = await fetch(base + pth, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}

// ---------------- title + reduced motion ----------------
const title = await page(1366, 768, 'title');
await title.goto(base + '/'); await sleep(900);
await shot(title, '01-title-projector-1366x768.png'); await noOverflow(title, 'title 1366');
const titlePhone = await page(390, 844, 'title-phone');
await titlePhone.goto(base + '/'); await sleep(600);
await shot(titlePhone, 'p00-title-phone-390x844.png'); await noOverflow(titlePhone, 'title 390');
const rm = await page(1366, 768, 'reduced-motion', { reducedMotion: 'reduce' });
await rm.goto(base + '/host.html'); await sleep(500);
check('reduced-motion host setup renders', await rm.isVisible('#createBtn'));

// ---------------- editor ----------------
const ed = await page(1366, 768, 'editor');
await ed.goto(base + '/editor.html'); await sleep(400);
check('editor seeds built-in packs', (await ed.locator('#packList li').count()) >= 2);
await ed.click('#newPack');
await ed.fill('#pTitle', 'Browser Test Pack');
const qb = ed.locator('.qbody');
await qb.locator('textarea').nth(1).fill('Which word means "mainly"?');
const optInputs = qb.locator('.opt-row input:not([type=radio])');
for (const [i, t] of ['entirely', 'primarily', 'never', 'magically'].entries()) await optInputs.nth(i).fill(t);
await qb.locator('.opt-row input[type=radio]').nth(1).check();
await qb.locator('textarea').nth(2).fill('Primarily = mainly, not 100%.');
await sleep(500);
check('editor shows ready status for completed question', (await ed.textContent('#packStatus')).includes('Ready'));
// picture upload: valid PNG and an invalid file
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8AARwzEcQAA9QP+AcLsPZsAAAAASUVORK5CYII=', 'base64');
await qb.locator('input[type=file]').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: png });
await sleep(700);
check('editor accepts a small PNG picture', await ed.locator('.qbody img').count() === 1);
await ed.locator('.qbody input[type=file]').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
await sleep(600);
check('editor rejects a fake picture', /not a readable picture/.test(await ed.textContent('#sideMsg')), await ed.textContent('#sideMsg'));
// preview
await ed.locator('.qhead button', { hasText: 'Preview' }).first().click();
await ed.locator('.pv-opt').nth(0).click();
check('preview reveals answer + why', (await ed.textContent('#previewModal')).includes('WHY'));
await shot(ed, 'e02-editor-preview-1366x768.png');
await ed.click('#pvClose');
// spreadsheet paste
await ed.fill('#tsvIn', 'Question\tA\tB\tC\tD\tCorrect\tExplanation\nWhat does "add" mean?\tput in extra\ttake away\tforget\tprint\tA\tAdd = put something extra in.\nWhat does "belief" mean?\ta song\ta food\tan idea you think is true\ta place\tC\tA belief is an idea you think is true.');
await ed.click('#tsvAdd'); await sleep(300);
check('spreadsheet paste adds rows', /Added 2/.test(await ed.textContent('#tsvMsg')));
await ed.fill('#tsvIn', 'broken row\tonly\tthree');
await ed.click('#tsvAdd'); await sleep(200);
check('spreadsheet paste rejects malformed rows', /Nothing added/.test(await ed.textContent('#tsvMsg')));
check('editor now has 3 questions', (await ed.locator('.qitem').count()) === 3);
// reorder
await ed.locator('.qitem').nth(1).locator('button[aria-label^="Move question 2 up"]').click();
check('reorder moves question', (await ed.locator('.qitem .sum').first().textContent()).includes('add'));
await sleep(500);
// reload persistence
await ed.reload(); await sleep(500);
const listText = await ed.textContent('#packList');
check('editor survives reload (localStorage)', listText.includes('Browser Test Pack') && (await ed.locator('.qitem').count()) === 3);
// JSON import: invalid then valid
await ed.setInputFiles('#importFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"title":"x","questions":[{"prompt":"q"}]}') });
await sleep(300);
check('JSON import rejects invalid pack', /rejected/.test(await ed.textContent('#sideMsg')), await ed.textContent('#sideMsg'));
await ed.setInputFiles('#importFile', { name: 'bad2.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
await sleep(300);
check('JSON import rejects non-JSON', /not valid JSON/.test(await ed.textContent('#sideMsg')));
const good = { ...GENERIC_PACK, id: 'imported-pack', title: 'Imported Past Simple' };
await ed.setInputFiles('#importFile', { name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
await sleep(300);
check('JSON import accepts valid pack', /Imported 1/.test(await ed.textContent('#sideMsg')) && (await ed.textContent('#packList')).includes('Imported Past Simple'));
// export
const [dl] = await Promise.all([ed.waitForEvent('download'), ed.click('#exportPack')]);
check('JSON export downloads a file', /after-hours\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
await ed.locator('#packList button', { hasText: 'Old Tales' }).click(); await sleep(200);
await ed.evaluate(() => window.scrollTo(0, 0)); await sleep(100);
await shot(ed, 'e01-editor-1366x768.png'); await noOverflow(ed, 'editor 1366');
const edp = await page(390, 844, 'editor-phone');
await edp.goto(base + '/editor.html'); await sleep(400);
await shot(edp, 'e03-editor-phone-390x844.png'); await noOverflow(edp, 'editor 390');

// ---------------- live game: projector + 2 browser phones + 10 simulated clients ----------------
const host = await page(1366, 768, 'host');
await host.goto(base + '/host.html'); await sleep(600);
await shot(host, '02-host-setup-1366x768.png'); await noOverflow(host, 'host setup');
await host.selectOption('#packSelect', 'starter-grimm-8a');
await host.fill('#joinBase', base);
await host.click('#createBtn'); await sleep(900);
const code = (await host.textContent('#codeMini')).trim();
check('room created from host screen', /^[A-Z0-9]{5}$/.test(code), code);
const token = await host.evaluate(() => JSON.parse(localStorage.getItem('afterhours.host.v1')).token);
const HH = { 'X-Host-Token': token };

const phones = [];
for (let i = 0; i < 2; i++) {
  const p = await page(390, 844, `phone${i}`);
  await p.goto(`${base}/play.html?room=${code}`); await sleep(300);
  if (i === 0) { await shot(p, 'p01-phone-join-390x844.png'); await noOverflow(p, 'phone join'); }
  await p.fill('#nameIn', `Browser Owl ${i}`);
  await p.click('button[type=submit]'); await sleep(700);
  phones.push(p);
}
// simulated helpers (HTTP)
const sims = [];
for (let i = 0; i < 10; i++) {
  const r = await api(`/api/rooms/${code}/join`, { method: 'POST', body: { callsign: `Sim Helper ${i}` } });
  sims.push({ H: { 'X-Player-Id': r.data.playerId, 'X-Player-Secret': r.data.secret }, crew: r.data.crew });
}
let simStop = false;
(async () => { while (!simStop) { for (const s of sims) await api(`/api/rooms/${code}/state?since=999999999`, { headers: s.H }).catch(() => {}); await sleep(5000); } })();
await sleep(800);
check('lobby lobby shows join QR', await host.locator('.qr-box svg').count() === 1);
const p0 = phones[0];
check('waiting game available in lobby', await p0.isVisible('#arcade'));
await p0.click('#rStart'); await sleep(1200);
await shot(p0, 'p02-phone-lobby-minigame-390x844.png', true);
await shot(host, '03-host-lobby-1366x768.png'); await noOverflow(host, 'host lobby');

await host.click('#cStart'); await sleep(1200);
check('mini-game hidden as soon as the question opens', !(await p0.isVisible('#arcade')));
await shot(host, '04-host-question-1366x768.png');
await shot(p0, 'p03-phone-question-390x844.png', true); await noOverflow(p0, 'phone question');

async function simsAnswer(correctRate = 1) {
  const st = (await api(`/api/rooms/${code}/state?since=0`, { headers: HH })).data;
  const q = STARTER_PACK.questions[st.roundIndex];
  for (const [i, s] of sims.entries()) await api(`/api/rooms/${code}/answer`, { method: 'POST', headers: s.H, body: { roundId: st.roundId, choice: i / sims.length < correctRate ? q.correct : (q.correct + 1) % 4 } });
}
async function simsVote() {
  const st = (await api(`/api/rooms/${code}/state?since=0`, { headers: sims[0].H })).data;
  for (const s of sims) { const o = pickOption(st, s.crew); if (o) await api(`/api/rooms/${code}/vote`, { method: 'POST', headers: s.H, body: { roundId: st.roundId, option: o.id } }); }
}

await simsAnswer(0.8);
await p0.locator('.choice').nth(STARTER_PACK.questions[0].correct).click(); await sleep(900);
check('answer confirmation visible after submit', await p0.isVisible('.locked'));
check('mini-game appears after answering', await p0.isVisible('#arcade'));
await p0.click('#rStart'); await sleep(300);
await p0.keyboard.press('ArrowLeft'); await sleep(200); await p0.keyboard.press('ArrowRight');
await p0.locator('#rRight').click(); await sleep(1200);
check('answer confirmation stays visible while playing', await p0.isVisible('.locked'));
await shot(p0, 'p04-phone-answered-minigame-390x844.png', true);
await shot(host, '04b-host-all-answered-indicator-1366x768.png');
// last phone answers -> everyone answered -> auto reveal. Mini-game must hide immediately.
await phones[1].locator('.choice').nth(0).click();
const t0 = Date.now();
await p0.waitForSelector('#arcade', { state: 'hidden', timeout: 4000 }).catch(() => {});
const hideMs = Date.now() - t0;
check('mini-game hides immediately for the explanation', !(await p0.isVisible('#arcade')), `${hideMs} ms after last answer`);
await sleep(800);
check('reveal phase reached', (await host.textContent('#phaseLabel')).includes('Answer'));
await shot(host, '05-host-reveal-why-1366x768.png');
await shot(p0, 'p05-phone-reveal-390x844.png', true); await noOverflow(p0, 'phone reveal');

await host.click('#cNext'); await sleep(900); // vote
check('mini-game hidden during crew vote', !(await p0.isVisible('#arcade')));
await simsVote();
await p0.locator('.vote:not([disabled])').first().click(); await sleep(600);
await shot(p0, 'p06-phone-vote-390x844.png', true); await noOverflow(p0, 'phone vote');
await shot(host, '06-host-vote-map-1366x768.png');
await phones[1].locator('.vote:not([disabled])').first().click(); await sleep(1500);
await shot(host, '07-host-map-update-1366x768.png');

// play more rounds quickly to show mission consequences on the map
async function round(i) {
  await host.click('#cNext'); await sleep(700);
  const ph = (await api(`/api/rooms/${code}/state?since=0`, { headers: HH })).data.phase;
  if (ph !== 'question') return ph;
  await simsAnswer(0.9);
  for (const p of phones) await p.locator('.choice').nth(STARTER_PACK.questions[i].correct).click();
  await sleep(900);
  await host.click('#cNext'); await sleep(700); // reveal -> vote
  await simsVote();
  for (const p of phones) { const b = p.locator('.vote:not([disabled])').first(); if (await b.count()) await b.click(); }
  await sleep(2600);
  return 'ok';
}
for (let i = 1; i < 8; i++) await round(i);
await shot(host, '08-host-mid-mission-map-1366x768.png');
const mid = (await api(`/api/rooms/${code}/state?since=0`, { headers: HH })).data;
check('map consequences recorded (crews moved / fuses changed)', mid.crews.some((c) => c.node !== ['MUSIC', 'CANTEEN', 'HALL', 'LIB'][c.id]), JSON.stringify(mid.mission.fuses));
// pause/resume
await host.click('#cPause'); await sleep(500);
check('pause shows on phones', await p0.isVisible('.paused-veil'));
await host.click('#cPause'); await sleep(500);
// play to the end
for (let i = 8; i < 12; i++) await round(i);
await host.click('#cNext'); await sleep(2500);
const fin = (await api(`/api/rooms/${code}/state?since=0`, { headers: HH })).data;
check('mission reaches extraction after last question', fin.phase === 'extraction', fin.phase);
await sleep(3500);
await shot(host, '09-host-extraction-1366x768.png');
await host.click('#cNext'); await sleep(1000);
await shot(host, '10-host-debrief-1366x768.png'); await noOverflow(host, 'host debrief');
await shot(p0, 'p07-phone-debrief-390x844.png', true); await noOverflow(p0, 'phone debrief');
check('debrief shows stars', await host.locator('.stars').count() === 1);
// phone reconnect (reload keeps identity)
const idBefore = await p0.evaluate(() => JSON.parse(localStorage.getItem('afterhours.player.v1')).playerId);
await p0.reload(); await sleep(1200);
const idAfter = await p0.evaluate(() => JSON.parse(localStorage.getItem('afterhours.player.v1')).playerId);
check('phone reload reconnects with same identity', idBefore === idAfter && await p0.isVisible('#gameView'));
// reset
await host.click('#cReset'); await sleep(1000);
check('reset returns to lobby', (await host.textContent('#phaseLabel')).includes('Lobby'));

// DEMO room labelled as such
const demoHost = await page(1366, 768, 'demo');
await demoHost.goto(base + '/host.html'); await sleep(400);
await demoHost.click('#demoBtn'); await sleep(900);
check('DEMO room is labelled DEMO', await demoHost.isVisible('#demoTag'));

simStop = true;
await browser.close();
server.closeAllConnections?.(); server.close();
console.table(results);
if (problems.length) { console.error('\nPROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log(`\nPASS: ${results.length} browser checks, 0 console/page errors. Screenshots in ${path.relative(process.cwd(), SHOTS)}/`);
process.exit(0);
