// Real-browser acceptance run (headless Chromium via Playwright): projector 1366x768 + phones 390x844.
// Fails on console/page errors or horizontal overflow. Screenshots -> screenshots/
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.mjs';
import { STARTER_PACK, GENERIC_PACK } from '../public/js/shared/packs.js';
import { LOCKERS, lockerStand, path as findPath, dist } from '../public/js/shared/world.js';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { console.error('Playwright not installed: npm i -D playwright && npx playwright install chromium'); process.exit(2); }
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHOTS = path.join(ROOT, 'screenshots'); mkdirSync(SHOTS, { recursive: true });
const server = createServer({ port: 0, log: () => {} });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const problems = []; const results = [];
const check = (name, ok, detail = '') => { results.push({ check: name, result: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 90) }); if (!ok) problems.push(`${name} ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byPrompt = new Map(STARTER_PACK.questions.map((q) => [q.prompt, q]));

async function page(w, h, label, opts = {}) {
  const mobile = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile, ...opts });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') problems.push(`[${label}] console: ${m.text()}`); });
  p.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function noOverflow(p, name) { const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth })); check(`no horizontal overflow: ${name}`, o.sw <= o.w, `${o.sw} vs ${o.w}`); }
const shot = (p, name, full = false) => p.screenshot({ path: path.join(SHOTS, name), fullPage: full });

// Walk the phone character to a locker using the keyboard (like a student with a keyboard would).
async function walkTo(p, gx, gy) {
  const keyFor = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const start = await p.evaluate(() => window.__ah.local);
  const tiles = findPath(start.x, start.y, gx, gy) || [];
  const pts = tiles.map(([x, y]) => [x + 0.5, y + 0.5]); pts.push([gx, gy]);
  for (const [tx, ty] of pts) {
    for (let k = 0; k < 60; k++) {
      const me = await p.evaluate(() => window.__ah.local);
      const dx = tx - me.x, dy = ty - me.y; if (Math.hypot(dx, dy) < 0.18) break;
      const keys = []; if (dx > 0.08) keys.push('right'); if (dx < -0.08) keys.push('left'); if (dy > 0.08) keys.push('down'); if (dy < -0.08) keys.push('up');
      for (const kk of keys) await p.keyboard.down(keyFor[kk]);
      await sleep(Math.min(120, Math.max(30, Math.hypot(dx, dy) * 200)));
      for (const kk of keys) await p.keyboard.up(keyFor[kk]);
    }
  }
}
async function nearestLocker(p) {
  const me = await p.evaluate(() => window.__ah.local);
  return LOCKERS.map((l) => ({ l, d: dist(me.x, me.y, l.x, l.y) })).sort((a, b) => a.d - b.d)[0].l;
}

async function openLockerHere(p) {
  for (let k = 0; k < 12; k++) {
    if (await p.isVisible('.qcard')) return true;
    if ((await p.evaluate(() => window.__ah.flags)) & 4) { await sleep(1000); continue; } // tagged: wait it out
    if ((await p.evaluate(() => window.__ah.near)) === null) { const L = await nearestLocker(p); const [x, y] = lockerStand(L); await walkTo(p, x, y); }
    await p.keyboard.press('e'); await sleep(600);
  }
  return p.isVisible('.qcard');
}

// ---------------- title ----------------
const title = await page(1366, 768, 'title');
await title.goto(base + '/'); await sleep(1500); await shot(title, '01-title-1366x768.png'); await noOverflow(title, 'title 1366');
const titleP = await page(390, 844, 'title-phone');
await titleP.goto(base + '/'); await sleep(1000); await shot(titleP, 'p00-title-390x844.png'); await noOverflow(titleP, 'title 390');
const rm = await page(1366, 768, 'reduced', { reducedMotion: 'reduce' });
await rm.goto(base + '/host.html'); await sleep(700); check('reduced-motion teacher setup renders', await rm.isVisible('#createBtn'));

// ---------------- editor (unchanged feature set) ----------------
const ed = await page(1366, 768, 'editor');
await ed.goto(base + '/editor.html'); await sleep(400);
await ed.click('#newPack'); await ed.fill('#pTitle', 'Browser Test Pack');
const qb = ed.locator('.qbody');
await qb.locator('textarea').nth(1).fill('Which word means "mainly"?');
for (const [i, t] of ['entirely', 'primarily', 'never', 'magically'].entries()) await qb.locator('.opt-row input:not([type=radio])').nth(i).fill(t);
await qb.locator('.opt-row input[type=radio]').nth(1).check();
await qb.locator('textarea').nth(2).fill('Primarily = mainly, not 100%.'); await sleep(400);
check('editor: question becomes ready', (await ed.textContent('#packStatus')).includes('Ready'));
await ed.fill('#tsvIn', 'What does "add" mean?\tput in extra\ttake away\tforget\tprint\tA\tAdd = put something extra in.');
await ed.click('#tsvAdd'); await sleep(200); check('editor: spreadsheet paste adds a row', /Added 1/.test(await ed.textContent('#tsvMsg')));
await ed.fill('#tsvIn', 'broken\trow'); await ed.click('#tsvAdd'); await sleep(200); check('editor: malformed paste rejected', /Nothing added/.test(await ed.textContent('#tsvMsg')));
await ed.reload(); await sleep(400); check('editor: survives reload', (await ed.textContent('#packList')).includes('Browser Test Pack'));
await ed.setInputFiles('#importFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"title":"x","questions":[{}]}') }); await sleep(300);
check('editor: invalid JSON pack rejected', /rejected/.test(await ed.textContent('#sideMsg')));
await ed.setInputFiles('#importFile', { name: 'g.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...GENERIC_PACK, id: 'imp', title: 'Imported Pack' })) }); await sleep(300);
check('editor: valid JSON pack imported', (await ed.textContent('#packList')).includes('Imported Pack'));
await ed.locator('#packList button', { hasText: 'Old Tales' }).click(); await ed.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
await shot(ed, 'e01-editor-1366x768.png'); await noOverflow(ed, 'editor 1366');

// ---------------- real classroom game ----------------
const host = await page(1366, 768, 'host');
await host.goto(base + '/host.html'); await sleep(1200); await shot(host, '02-teacher-setup-1366x768.png'); await noOverflow(host, 'teacher setup');
await host.selectOption('#packSelect', 'starter-grimm-8a'); await host.fill('#joinBase', base); await host.selectOption('#minutes', '5');
await host.click('#createBtn'); await sleep(1200);
const code = (await host.textContent('#codeMini')).trim();
check('game created', /^[A-Z0-9]{5}$/.test(code), code);

const phones = [];
for (let i = 0; i < 2; i++) {
  const p = await page(390, 844, `phone${i}`);
  await p.goto(`${base}/play.html?room=${code}`); await sleep(600);
  if (i === 0) { await shot(p, 'p01-join-390x844.png'); await noOverflow(p, 'phone join'); }
  await p.fill('#nameIn', i === 0 ? 'Sparkly Mochi' : 'Lucky Lotus');
  await p.click('button[type=submit]'); await sleep(500);
  check(`phone ${i}: avatar creator shown`, await p.isVisible('#avatarView'));
  if (i === 0) {
    await p.locator('.tabs button', { hasText: 'Hair' }).first().click(); await p.locator('#choices button').nth(2).click();
    await p.locator('.tabs button', { hasText: 'Outfit' }).first().click(); await p.locator('#choices button').nth(0).click();
    await p.locator('.tabs button', { hasText: 'Extra' }).click(); await p.locator('#choices button').nth(2).click();
    await sleep(400); await shot(p, 'p02-avatar-creator-390x844.png'); await noOverflow(p, 'avatar creator');
  }
  if (i === 0) { await p.click('#avatarDone'); await sleep(1200); check('phone 0: in game view', await p.isVisible('#world')); }
  phones.push(p); // phone 1 stays in the avatar creator on purpose

}
const [pa, pb] = phones;
await shot(pa, 'p03-lobby-390x844.png'); await shot(host, '03-teacher-lobby-qr-1366x768.png'); await noOverflow(host, 'teacher lobby');
check('lobby shows QR', await host.locator('.lobby svg').count() === 1);
check('lobby lists 2 players (even one still designing)', (await host.textContent('.lobby .count')).includes('2 / 40'));
check('lobby suggests a mode for a small group', /Suggested for 2 players: Solo/.test(await host.textContent('.lobby')));
await host.locator('.modes .btn', { hasText: '2 crews' }).click(); await sleep(600);
check('teacher can switch to 2 crews in the lobby', (await host.locator('.modes .btn.on').first().textContent()).includes('2 crews'));
await host.click('#cHow'); await sleep(300); check('how-to-play card opens', (await host.textContent('#overlay')).includes('How to play'));
await shot(host, '03b-teacher-how-to-1366x768.png'); await host.locator('.modal-card .btn', { hasText: 'Close' }).click(); await sleep(300);
// emote in lobby
await pa.click('#emoteBtn'); await pa.locator('#emoteWheel button').nth(1).click(); await sleep(600);
await shot(pa, 'p04-emote-390x844.png');

await host.click('#cStart'); await sleep(1300);
await shot(host, '04-teacher-countdown-1366x768.png');
await sleep(3200);
check('game is playing', (await pa.evaluate(() => window.__ah.phase)) === 'play');
check('Start pulled the still-designing phone into the game', await pb.isVisible('#world') && !(await pb.isVisible('#avatarView')));
check('power meter shows during play', await pa.isVisible('#energy'));
// walk to the nearest locker and open it
const L = await nearestLocker(pa); const [sx, sy] = lockerStand(L);
await walkTo(pa, sx, sy); await sleep(300);
check('proximity "OPEN" button appears at a locker', await pa.isVisible('#actBtn'), `near=${await pa.evaluate(() => window.__ah.near)}`);
await shot(pa, 'p05-at-locker-390x844.png');
check('question card opens (E key / OPEN button)', await openLockerHere(pa));
await shot(pa, 'p06-question-390x844.png', false); await noOverflow(pa, 'phone question');
const prompt = (await pa.textContent('.qcard .prompt')).trim(); const q = byPrompt.get(prompt);
check('question comes from the pack', !!q, prompt);
await pa.locator('.ans').nth(q.correct).click(); await sleep(900);
check('result shows CORRECT + loot + WHY', (await pa.textContent('.qcard')).includes('CORRECT') && await pa.isVisible('.loot') && await pa.isVisible('.why'));
await shot(pa, 'p07-correct-loot-why-390x844.png');
await sleep(1000); await pa.click('.qcard .btn.primary'); await sleep(300);
check('card closes to keep playing', !(await pa.isVisible('.qcard')));
// phone B answers wrong
await pb.click('#autoBtn');
for (let k = 0; k < 40 && (await pb.evaluate(() => window.__ah.near)) === null; k++) await sleep(250);
check('🧭 auto-walk brings the player to a locker', (await pb.evaluate(() => window.__ah.near)) !== null);
if (await openLockerHere(pb)) {
  const qb2 = byPrompt.get((await pb.textContent('.qcard .prompt')).trim());
  await pb.locator('.ans').nth((qb2.correct + 1) % 4).click(); await sleep(900);
  check('wrong answer shows correct answer + WHY, no loot', (await pb.textContent('.qcard')).includes('The answer is') && !(await pb.isVisible('.loot')));
  await shot(pb, 'p08-wrong-why-390x844.png');
  await sleep(1900); await pb.click('.qcard .btn.primary');
} else check('phone B opened a locker with the E key', false);
await sleep(1500);
await shot(host, '05-teacher-live-map-1366x768.png');
// music: the teacher's song is served and decodes in the browser
const music = await host.evaluate(async () => { const r = await fetch('audio/day.mp3'); const ct = r.headers.get('content-type'); const ac = new AudioContext(); const b = await ac.decodeAudioData(await r.arrayBuffer()); return { ct, sec: Math.round(b.duration) }; });
check('day music track is served and decodes', music.ct === 'audio/mpeg' && music.sec > 60, JSON.stringify(music));
// timetable event (started directly on the in-process server): room glows, phone shows a direction arrow + hint
{ const room = server.rooms.get(code).room; room.startEvent('lunch'); room.emitAll({ t: 'event', kind: 'lunch', ms: 25000 }); }
await sleep(1500);
check('event banner shows on the phone', (await pa.textContent('#banner')).includes('LUNCH'));
await shot(host, '05b-teacher-lunch-event-1366x768.png'); await shot(pa, 'p09b-lunch-event-arrow-390x844.png'); await noOverflow(host, 'teacher live');
await shot(pa, 'p09-playing-390x844.png'); await noOverflow(pa, 'phone playing');
// pause / resume
await host.click('#cPause'); await sleep(700);
check('pause shows on phones', (await pa.textContent('#overlay')).includes('Paused'));
await host.click('#cPause'); await sleep(700);
check('resume hides pause', !(await pa.textContent('#overlay')).includes('Paused'));
// reconnect: reload phone B
const idB = await pb.evaluate(() => JSON.parse(localStorage.getItem('afterhours.nc.player.v1')).playerId);
await pb.reload(); await sleep(2000);
check('reload reconnects with the same player', (await pb.evaluate(() => JSON.parse(localStorage.getItem('afterhours.nc.player.v1')).playerId)) === idB && (await pb.evaluate(() => window.__ah.phase)) === 'play');
// end -> results
await host.click('#cTeacher'); await sleep(400);
const tUrl = (await host.locator('.modal-card svg').getAttribute('aria-label')).replace('QR code for ', '');
await host.locator('.modal-card .btn', { hasText: 'Close' }).click();
const tp = await page(390, 844, 'teacher-phone'); await tp.goto(tUrl); await sleep(1500);
check('teacher phone view lists nicknames and answer counts', (await tp.textContent('#rows')).includes('Sparkly Mochi') && (await tp.textContent('#sum')).includes('answers'));
await shot(tp, 't01-teacher-phone-390x844.png', true); await noOverflow(tp, 'teacher phone');
await host.click('#cEnd'); await sleep(2500);
check('teacher sees podium + review', await host.isVisible('.results') && (await host.textContent('.results')).includes('review'));
await shot(host, '06-teacher-results-review-1366x768.png'); await noOverflow(host, 'teacher results');
check('phone sees crew place + personal stats', (await pa.textContent('#overlay')).includes('correct'));
await shot(pa, 'p10-results-390x844.png'); await noOverflow(pa, 'phone results');
await host.locator('.results .btn.primary').click(); await sleep(1000);
check('play again returns to lobby', await host.isVisible('.lobby'));

// ---------------- DEMO game with bots for a busy projector ----------------
const demo = await page(1366, 768, 'demo');
await demo.goto(base + '/host.html'); await sleep(600);
await demo.click('#demoBtn'); await sleep(1500);
check('DEMO game is labelled', await demo.isVisible('#demoTag'));
const topbarOk = async (p) => p.evaluate(() => { const tb = document.querySelector('.topbar'); return tb.scrollWidth <= tb.clientWidth + 1 && [...tb.querySelectorAll('.btn, .big-timer, .brand, .codebox')].every((el) => el.getBoundingClientRect().height <= 58); });
check('teacher top bar fits on one line (busy DEMO lobby)', await topbarOk(demo));
const dcode = (await demo.textContent('#codeMini')).trim();
const dp = await page(390, 844, 'demo-phone');
await dp.goto(`${base}/play.html?room=${dcode}`); await sleep(500); await dp.fill('#nameIn', 'Cosmic Star'); await dp.click('button[type=submit]'); await sleep(400); await dp.click('#avatarDone'); await sleep(800);
await demo.locator('.modes .btn', { hasText: 'Solo' }).click(); await sleep(500);
await demo.click('#cStart'); await sleep(30_000);
check('teacher top bar fits on one line (during play)', await topbarOk(demo));
check('Solo mode shows a top-5 leaderboard', (await demo.textContent('#railTitle')) === 'Leaderboard' && (await demo.locator('#board .crow').count()) <= 5);
await shot(demo, '07-teacher-demo-busy-1366x768.png');
await shot(dp, 'p11-demo-crowd-390x844.png');
const board = await demo.textContent('#board');
check('scores are moving in DEMO', /⚡[1-9]/.test(board), board.replace(/\s+/g, ' ').slice(0, 80));
await demo.click('#cEnd'); await sleep(2500);
check('Solo results show a player podium', /wins!/.test(await demo.textContent('.results h2')));
await shot(demo, '08-teacher-solo-results-1366x768.png'); await shot(dp, 'p12-solo-results-390x844.png');

// ---------------- night time (short 1-minute DEMO game so night falls quickly) ----------------
const nh = await page(1366, 768, 'night-host');
await nh.goto(base + '/host.html'); await sleep(600);
await nh.evaluate(() => { const sel = document.getElementById('minutes'); sel.append(new Option('1 minute (test)', '1')); sel.value = '1'; });
check('night time is on by default', await nh.isChecked('#night'));
await nh.click('#demoBtn'); await sleep(1200);
const ncode = (await nh.textContent('#codeMini')).trim();
const np = await page(390, 844, 'night-phone');
await np.goto(`${base}/play.html?room=${ncode}`); await sleep(500); await np.fill('#nameIn', 'Moon Bunny'); await np.click('button[type=submit]'); await sleep(400); await np.click('#avatarDone'); await sleep(800);
await nh.click('#cStart'); await sleep(3600 + 21000 + 3500);
check('night falls: teacher timer shows the moon', (await nh.textContent('#bigTimer')).includes('🌙'));
check('night falls: phone timer shows the moon', (await np.textContent('#hudTimer')).includes('🌙'));
await shot(nh, '09-teacher-night-1366x768.png'); await shot(np, 'p13-night-390x844.png');
await sleep(30_000);
check('morning comes back after 30 s', !(await nh.textContent('#bigTimer')).includes('🌙'));

await browser.close(); server.closeAllConnections?.(); server.close();
console.table(results);
if (problems.length) { console.error('\nPROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log(`\nPASS: ${results.length} browser checks, 0 console/page errors. Screenshots in screenshots/`);
process.exit(0);
