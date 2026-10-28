/* Prime Time — Playwright/Chromium checks. Run: node demos/prime-time/tests/run-tests.js
   Needs the `playwright` package resolvable (pre-installed in the build container). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const vm = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'))(vm);
const D = vm.PT_DATA;

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); }
const rx = w => new RegExp('(^|[^a-z-])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z-])', 'i');
const has = (html, w) => rx(w).test(html);

async function open(browser, vp, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, opts || {}));
  const page = await ctx.newPage();
  const log = { errors: [], net: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) log.net.push(r.url()); });
  await page.goto(URL);
  return { ctx, page, log };
}
const info = p => p.evaluate(() => window.PT.info());
// Everything a viewer or screen reader could get: all text nodes (hidden ones too) + labelling attributes. Not class names.
const bodyText = p => p.evaluate(() => document.body.innerText + ' \n ' + [...document.body.querySelectorAll('*')].map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join(' ')).join(' \n ') + ' ' + [...document.querySelectorAll('[aria-label],[title],[alt],[value]')].map(e => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('alt'), e.getAttribute('value')].join(' ')).join(' '));
const stageText = p => p.evaluate(() => { const s = document.getElementById('stage'); return s.innerText + ' \n ' + [...s.querySelectorAll('*')].map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join(' ')).join(' \n ') + ' ' + [...s.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).join(' '); });
async function key(p, k) { await p.keyboard.press(k); await p.waitForTimeout(40); }

async function overflow(p) {
  return p.evaluate(() => {
    const d = document.documentElement, st = document.getElementById('stage').getBoundingClientRect();
    let worst = 0;
    document.querySelectorAll('#stage *').forEach(el => { if (el.closest('.noise')) return; const r = el.getBoundingClientRect(); if (r.height) worst = Math.max(worst, r.bottom - st.bottom, r.right - st.right); });
    return { vScroll: d.scrollHeight - innerHeight, hScroll: d.scrollWidth - innerWidth, clip: Math.round(worst) };
  });
}

(async () => {
  const browser = await chromium.launch();

  /* ---- 1. spoilers + reachability + scores at 1366x768 ---- */
  {
    const { ctx, page: p, log } = await open(browser, { width: 1366, height: 768 });
    const all = [].concat(D.genres.map(g => g.word), D.genres.map(g => g.ex), D.bank, D.quiz.map(q => q.a), D.adjectives.map(a => a.w), ['A TV'])
      .filter(w => w !== 'screen' && w !== 'episode'); // "Episode 1: Screen Time" is the required title
    let html = await bodyText(p);
    check('Start screen: no answer text in DOM', !all.some(w => has(html, w)), all.filter(w => has(html, w)).join(', '));
    check('Start screen: title, "Episode 1: Screen Time" and Start only', html.includes('Episode 1: Screen Time') && await p.isVisible('#startBtn') && !(await p.isVisible('#bar .chips')));
    check('Teacher panel hidden by default', await p.isHidden('#panel'));

    await key(p, 'Space'); // cold open
    html = await bodyText(p);
    check('Cold open: "A TV" absent before reveal', !has(html, 'A TV') && !has(html, 'television'));
    for (let i = 0; i < 6; i++) await key(p, 'Space');
    check('Cold open: TV revealed after steps', has(await bodyText(p), 'A TV'));

    // Genre cards
    await key(p, '1');
    const leaks = [];
    for (let i = 0; i < D.genres.length; i++) {
      const h = await bodyText(p);
      const bad = D.genres.filter(g => has(h, g.word) || h.includes(g.ex)).map(g => g.word);
      if (bad.length) leaks.push('card ' + (i + 1) + ': ' + bad.join('/'));
      await key(p, 'Space');
      if (!has(await bodyText(p), D.genres[i].word)) leaks.push('card ' + (i + 1) + ' did not reveal');
      await key(p, 'Space'); await key(p, 'Space');
    }
    check('E1: no genre word or example in DOM before each reveal (15 cards)', !leaks.length, leaks.join('; '));

    // Word bank + quiz
    await key(p, '2');
    html = await bodyText(p);
    check('E2 word bank: hidden before reveal', !D.bank.some(w => has(html, w)), D.bank.filter(w => has(html, w)).join(', '));
    await p.click('#allBtn');
    html = await bodyText(p);
    check('E2 word bank: all 10 revealed by "Reveal all"', D.bank.every(w => has(html, w)));
    await key(p, 'Space');
    const qLeaks = [];
    for (let i = 0; i < D.quiz.length; i++) {
      const q = D.quiz[i], h = await stageText(p);
      if (has(h, q.a) || h.includes(q.fact) || (await p.textContent('#verdict')).trim()) qLeaks.push('Q' + (i + 1));
      if (i === 0) await p.click('[data-v="1:0"]'); // CH 2 votes FALSE on Q1
      await key(p, 'Space'); // gap
      if (!(await p.textContent('#gap')).includes(q.a)) qLeaks.push('Q' + (i + 1) + ' gap not revealed');
      await key(p, 'Space'); // vote countdown
      await key(p, 'Space'); // verdict
      const v = (await p.textContent('#verdict')).trim();
      if (v !== (q.v ? 'TRUE' : 'FALSE')) qLeaks.push('Q' + (i + 1) + ' verdict ' + v);
      if (i === 0) {
        const s = await p.textContent('[data-score="1"]');
        check('E2: correct team vote auto-scores +1', s.trim() === '1', 'CH 2 = ' + s);
        await p.click('[data-undo]');
        check('E2: undo removes the auto-score', (await p.textContent('[data-score="1"]')).trim() === '0');
      }
      await key(p, 'Space');
    }
    check('E2: no gap word / verdict / fact before reveal (10 cards)', !qLeaks.length, qLeaks.join('; '));

    // E3 sort
    html = await bodyText(p);
    check('E3: adjectives hidden before reveal', !D.adjectives.some(a => has(html, a.w)), D.adjectives.filter(a => has(html, a.w)).map(a => a.w).join(', '));
    // reveal each chip with Space (auto-selects it), then move it with its key column number
    for (let i = 0; i < D.adjectives.length; i++) {
      await key(p, 'Space');
      const chip = await p.getAttribute('[data-chip][aria-pressed="true"]', 'data-chip');
      await key(p, String(D.adjectives[+chip].c));
    }
    await p.click('#checkBtn');
    const ok = await p.$$eval('.cols .wchip.ok', n => n.length);
    check('E3: reveal + move (keys 1/2/3) + check marks 12/12 correct', ok === 12, ok + ' ok');
    check('E3: number keys moved words instead of switching episode', (await info(p)).ep === 3);

    // E4 game
    await key(p, '4');
    check('E4: adjectives-game link present, new tab, not clicked', (await p.getAttribute('a[href="https://screen-time-word-game.pages.dev"]', 'target')) === '_blank');
    await p.click('[data-plus="2"]'); await p.click('[data-plus="2"]'); await p.click('[data-plus="0"]');
    const s1 = [await p.textContent('[data-score="2"]'), await p.textContent('[data-score="0"]')];
    await p.click('[data-undo]');
    const s2 = await p.textContent('[data-score="0"]');
    await p.click('[data-reset]'); const armed = await p.textContent('[data-score="2"]'); await p.click('[data-reset]');
    const s3 = await p.$$eval('[data-score]', n => n.map(x => x.textContent).join(','));
    check('E4: team +1, undo, two-press reset', s1.join() === '2,1' && s2 === '0' && armed === '2' && s3 === '0,0,0,0', `after +1s ${s1} undo ${s2} reset ${s3}`);
    await key(p, 'Space');
    const rLeaks = []; let rounds = 0, twists = 0;
    while ((await info(p)).ep === 4) {
      const h = await stageText(p);
      if (await p.$('#clue')) {
        rounds++;
        if (D.clues.some(c => h.includes(c.q))) rLeaks.push('round ' + rounds + ' clue');
        if (D.clues.some(c => (rx(c.a).test(h)))) rLeaks.push('round ' + rounds + ' answer');
      } else if (await p.$('#tw')) { twists++; if ((await p.textContent('#tw')).trim()) rLeaks.push('twist shown early'); }
      const at = (await info(p)).idx;
      while ((await info(p)).idx === at) await key(p, 'Space');
    }
    check('E4: clue + answer hidden under static until revealed (' + rounds + ' rounds)', !rLeaks.length && rounds === D.clues.length, rLeaks.join('; '));
    check('E4: plot-twist cards appear (~every 4 rounds)', twists >= 3 && twists <= 6, twists + ' twists');

    // E5 picker
    await key(p, '5'); await key(p, 'Space'); await key(p, 'Space');
    await p.click('#pickBtn');
    const pair = await p.textContent('#pair');
    const nums = (pair.match(/\d+/g) || []).map(Number);
    check('E5: pair picker shows two different numbers 1–40, no names', nums.length === 2 && nums[0] !== nums[1] && nums.every(n => n >= 1 && n <= 40) && !/[a-z]/i.test(pair.replace('&', '')), pair);

    // every episode reachable by key and by chip
    const eps = [];
    for (let e = 0; e <= 6; e++) { await key(p, String(e)); eps.push((await info(p)).ep); }
    for (let e = 0; e <= 6; e++) { await p.click(`[data-ep="${e}"]`); eps.push((await info(p)).ep); }
    check('Every episode reachable by number keys and chips', eps.join() === '0,1,2,3,4,5,6,0,1,2,3,4,5,6', eps.join());

    // typing in inputs is not hijacked
    await p.click('#timer'); await p.fill('#timerInput', ''); await p.type('#timerInput', 's3');
    const panelAfter = await p.isHidden('#panel'), epAfter = (await info(p)).ep;
    await p.fill('#timerInput', '4'); await p.keyboard.press('Enter');
    check('Typing in timer input does not trigger S/3 shortcuts; timer editable', panelAfter && epAfter === 6 && (await p.textContent('#timer')).trim() === '4:00');
    await key(p, 't'); await p.waitForTimeout(1100); await key(p, 't');
    check('T starts/pauses the timer', (await p.textContent('#timer')).trim() !== '4:00');
    await key(p, 's');
    check('S opens teacher panel; Escape closes', await p.isVisible('#panel') && (await (async () => { await key(p, 'Escape'); return p.isHidden('#panel'); })()));

    const store = await p.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length);
    check('Nothing stored (localStorage/sessionStorage/cookies empty)', store === 0);
    check('No console errors (1366 run)', !log.errors.length, log.errors.join(' | '));
    check('No network requests (1366 run)', !log.net.length, log.net.join(' '));
    await ctx.close();
  }

  /* ---- 2. no scroll / no clipping on every screen, fully revealed ---- */
  for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const { ctx, page: p, log } = await open(browser, vp);
    const bad = []; let n = 0;
    for (;;) {
      let s = await info(p);
      while (s.step < s.steps) { await key(p, 'Space'); s = await info(p); }
      if (s.ep === 3) { for (let i = 0; i < 4; i++) { await p.click('#pool [data-chip]').catch(() => {}); await key(p, '1'); } }
      await p.waitForTimeout(80);
      const o = await overflow(p); n++;
      if (o.vScroll > 0 || o.hScroll > 0 || o.clip > 1) bad.push(`screen ${s.idx} (E${s.ep}) v${o.vScroll} h${o.hScroll} clip${o.clip}`);
      if (s.idx === s.total - 1) break;
      await key(p, 'Space');
    }
    check(`No scroll / clipping at ${vp.width}x${vp.height} on all ${n} screens`, !bad.length, bad.join('; '));
    check(`No console errors / network at ${vp.width}x${vp.height}`, !log.errors.length && !log.net.length, log.errors.concat(log.net).join(' | '));
    await ctx.close();
  }

  /* ---- 3. phone ---- */
  {
    const { ctx, page: p, log } = await open(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    await p.tap('#startBtn');
    const bad = [];
    for (let i = 0; i < 40; i++) {
      const o = await p.evaluate(() => ({ h: document.documentElement.scrollWidth - innerWidth, next: (() => { const r = document.getElementById('next').getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth; })() }));
      if (o.h > 0 || !o.next) bad.push(i + ':' + JSON.stringify(o));
      await p.tap('#next');
    }
    check('Phone 390x844: no sideways scroll, Next always on screen (40 screens)', !bad.length, bad.join(' '));
    check('Phone: no console errors', !log.errors.length, log.errors.join(' | '));
    await ctx.close();
  }

  /* ---- 4. reduced motion ---- */
  {
    const { ctx, page: p } = await open(browser, { width: 1366, height: 768 }, { reducedMotion: 'reduce' });
    const r = await p.evaluate(() => ({ cb: document.getElementById('optMotion').checked, st: getComputedStyle(document.getElementById('static')).display, anim: getComputedStyle(document.querySelector('.onair i')).animationDuration }));
    check('prefers-reduced-motion: static off, animations ~0', r.cb && r.st === 'none' && parseFloat(r.anim) < 0.01, JSON.stringify(r));
    await ctx.close();
  }

  /* ---- 5. accessibility basics ---- */
  {
    const { ctx, page: p } = await open(browser, { width: 1366, height: 768 });
    await p.click('#startBtn');
    const a = await p.evaluate(() => {
      const unnamed = [...document.querySelectorAll('button, a, input')].filter(el => !(el.getAttribute('aria-label') || el.textContent.trim() || (el.labels && el.labels.length))).map(el => el.outerHTML.slice(0, 60));
      const fakeButtons = [...document.querySelectorAll('[onclick], div[role="button"]')].length;
      const imgs = [...document.querySelectorAll('svg[role="img"]')].filter(s => !s.getAttribute('aria-label')).length;
      return { unnamed, fakeButtons, imgs };
    });
    check('All controls are real buttons/links/inputs with accessible names', !a.unnamed.length && !a.fakeButtons, a.unnamed.join(' '));
    await p.keyboard.press('Tab');
    const ring = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check('Keyboard focus shows a visible outline', ring !== 'none', ring);
    await ctx.close();
  }

  /* ---- 6. contrast of the colour tokens on the background ---- */
  {
    const lum = h => { const c = h.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const pairs = [['ink', '#f5f1e8', '#0a0a0c'], ['muted', '#b8b3a7', '#18181f'], ['signal', '#ff5a47', '#0a0a0c'], ['amber', '#ffc53d', '#0a0a0c'], ['true', '#4ee08f', '#0a0a0c'], ['false', '#ff6b6b', '#0a0a0c'], ['dark on ink btn', '#0a0a0c', '#f5f1e8'], ['dark on amber btn', '#0a0a0c', '#ffc53d'], ['active chip key', '#b3261e', '#f5f1e8']];
    const out = pairs.map(([n, f, b]) => [n, ratio(f, b)]);
    check('Contrast >= 4.5:1 for all text colour pairs', out.every(x => x[1] >= 4.5), out.map(x => x[0] + ' ' + x[1].toFixed(1)).join(', '));
  }

  /* ---- 7. worksheet ---- */
  {
    const pdf = fs.readFileSync(path.join(ROOT, 'worksheet.pdf'), 'latin1');
    const pages = (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length;
    check('worksheet.pdf has 3 pages', pages === 3, pages + ' pages');
    const { ctx, page: p, log } = await open(browser, { width: 900, height: 1200 });
    await p.goto('file://' + path.join(ROOT, 'worksheet.html'));
    const w = await p.evaluate(() => [...document.querySelectorAll('.page')].map(pg => { const b = pg.getBoundingClientRect().bottom; return [...pg.querySelectorAll('*')].filter(e => e.getBoundingClientRect().bottom > b + 1).length; }));
    check('worksheet.html: 3 pages, nothing overflows a page', w.length === 3 && w.every(x => x === 0), JSON.stringify(w));
    const students = await p.evaluate(() => [...document.querySelectorAll('.page')].slice(0, 2).map(x => x.innerText).join(' '));
    const keyLeak = D.quiz.filter(q => students.includes(q.fact)).length;
    check('Student pages contain no answer facts', keyLeak === 0);
    check('Worksheet: no network', !log.net.length);
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
