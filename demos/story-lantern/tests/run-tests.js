#!/usr/bin/env node
/* Story Lantern v2 browser tests. Run from anywhere:
 *   node demos/story-lantern/tests/run-tests.js
 * Needs Playwright + Chromium (uses the preinstalled browser). Writes:
 *   tests/results.json, tests/screenshots/*.png and tests/out/worksheet-check.pdf (not committed)
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const INDEX = pathToFileURL(path.join(ROOT, "index.html")).href;
const SHEET = pathToFileURL(path.join(ROOT, "worksheet.html")).href;
const SHOTS = path.join(__dirname, "screenshots");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const WORDS = ["add", "although", "belief", "collect", "magical", "primarily", "publish", "scary", "suitable", "text"];

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail ? String(detail).slice(0, 400) : "" });
  console.log((cond ? "PASS " : "FAIL ") + name + (detail && !cond ? "  -- " + String(detail).slice(0, 400) : ""));
}
const allProblems = [];
async function openApp(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1366, height: 768 }, reducedMotion: opts.reducedMotion || "no-preference", hasTouch: !!opts.touch });
  const page = await ctx.newPage();
  const problems = { external: [], errors: [], tag: opts.tag || "main" };
  allProblems.push(problems);
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith("file://") && !u.startsWith("data:")) problems.external.push(u); });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.errors.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => problems.errors.push("pageerror: " + e.message));
  if (opts.clock) await page.clock.install({ time: new Date("2026-10-27T09:00:00Z") });
  await page.goto(opts.url || INDEX);
  return { ctx, page, problems };
}
const st = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__SL.state())));
const bodyText = (page) => page.evaluate(() => document.body.innerText);
function foundWords(text, words) {
  return words.filter((w) => new RegExp("\\b" + w + "\\b", "i").test(text));
}
async function setTwists(page, val) {
  await page.click("#gearBtn");
  await page.selectOption("#twistEvery", String(val));
  await page.click("#panelClose");
}
async function fits(page) {
  return page.evaluate(() => {
    const d = document.documentElement, s = document.getElementById("stage");
    return { vScroll: d.scrollHeight > innerHeight + 1, hScroll: d.scrollWidth > innerWidth + 1, clipped: s.scrollHeight > s.clientHeight + 1, sh: s.scrollHeight, ch: s.clientHeight, dw: d.scrollWidth };
  });
}

(async () => {
  const browser = await chromium.launch();

  /* ================= Content ================= */
  {
    const { ctx, page } = await openApp(browser);
    const data = await page.evaluate(() => ({ W: window.SL_WORDS, CH: window.SL_CHALLENGES, ST: window.SL_STORIES, TW: window.SL_TWISTS, L: window.SL_LINES }));
    check("exactly the ten target words", JSON.stringify(data.W.map((w) => w.word)) === JSON.stringify(WORDS));
    for (const w of WORDS) check(`apply has >=1 challenge for "${w}"`, data.CH.some((c) => c.word === w));
    const all = JSON.stringify(data.CH).toLowerCase();
    check("apply: although vs because (>=2)", data.CH.filter((c) => c.opts.map((o) => o.toLowerCase()).join() === "although,because").length >= 2);
    check("apply: primarily = mainly", all.includes("mainly"));
    check("apply: suitable = appropriate", all.includes("appropriate"));
    check("apply: belief is a noun (vs believe)", all.includes("noun") && all.includes("believe"));
    check("apply: magical = magic/special powers, not just beauty", all.includes("special powers") && all.includes("not just beauty"));
    check("apply: text = written words", all.includes("written words"));
    check("apply: every question has 2-3 options and a WHY per option", data.CH.every((c) => c.opts.length >= 2 && c.opts.length <= 3 && c.why.length === c.opts.length && c.why.every((y) => y.length > 20)));
    for (const w of data.W) {
      const label = (w.svg.match(/aria-label="([^"]*)"/) || [])[1] || "";
      const leak = foundWords([w.clue, w.hint, label].join(" "), WORDS);
      check(`no target word inside clue/hint/picture label of "${w.word}"`, leak.length === 0, leak.join());
      const n = (w.svg.match(/<(path|line|polyline|polygon|circle|ellipse|rect)\b/g) || []).length;
      check(`"${w.word}" has its own line-art picture (${n} drawable shapes)`, n >= 8);
    }
    check("10 different pictures", new Set(data.W.map((w) => w.svg)).size === 10);
    const hostLeak = foundWords(Object.values(data.L).flat().join(" | "), WORDS);
    check("host one-liners never contain a target word", hostLeak.length === 0, hostLeak.join());
    const twLeak = foundWords(data.TW.map((t) => t.title + " " + t.body).join(" | "), WORDS);
    check("twist cards never contain a target word", twLeak.length === 0, twLeak.join());
    check("six twist types incl. rare swap", ["double", "steal", "act", "whisper", "sentence", "swap"].every((id) => data.TW.some((t) => t.id === id)) && data.TW.find((t) => t.id === "swap").weight < Math.min(...data.TW.filter((t) => t.id !== "swap").map((t) => t.weight)));
    check("create: 4 story sets with 3-4 target words each", data.ST.length === 4 && data.ST.every((s) => s.words.length >= 3 && s.words.length <= 4 && s.words.every((w) => WORDS.includes(w))));
    const scenes = data.ST.map((s) => s.scene).join(" ").toLowerCase();
    check("create: teen scenarios (horror film, K-pop, school drama, social media)", ["horror", "k-pop", "school", "social media"].every((k) => scenes.includes(k)), scenes);
    check("create: every model story uses its words", data.ST.every((s) => s.words.every((w) => s.model.toLowerCase().includes(w.slice(0, 5)))));
    const kid = /\b(kiddo|great job|good boy|good girl|sweetie)\b/i;
    check("no babyish praise lines", !kid.test(JSON.stringify(data.L)));
    await ctx.close();
  }

  /* ================= Start screen: no spoilers, teacher panel hidden ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { tag: "start" });
    await page.waitForTimeout(500);
    const t = await bodyText(page);
    check("start: no target word visible on the projected start screen", foundWords(t, WORDS).length === 0, foundWords(t, WORDS).join());
    check("start: title, '10 mystery words', Start", /STORY LANTERN/.test(t) && /10\s*mystery words/i.test(t) && (await page.isVisible("#bStart")));
    check("start: 4 editable team name boxes", (await page.locator(".team-setup input").count()) === 4);
    check("start: teacher panel collapsed by default", !(await page.isVisible("#panel")) && !(await page.isVisible("#wordTicks")));
    const html = (await page.evaluate(() => document.getElementById("stage").innerHTML)).replace(/<\/?[a-z]+/gi, "<");
    check("start: stage markup contains no target word (not even hidden)", foundWords(html, WORDS).length === 0, foundWords(html, WORDS).join());
    await page.screenshot({ path: path.join(SHOTS, "1366-start.png") });
    await page.keyboard.press("s");
    check("S opens the teacher panel with 10 word ticks", (await page.isVisible("#panel")) && (await page.locator("#wordTicks input").count()) === 10);
    await page.screenshot({ path: path.join(SHOTS, "1366-teacher-panel.png") });
    // shortcuts are paused while the panel is open
    await page.keyboard.press("d");
    check("panel open: other shortcuts ignored", (await st(page)).round === "start");
    await page.keyboard.press("Escape");
    check("Esc closes the teacher panel", !(await page.isVisible("#panel")));
    await page.click("#gearBtn");
    check("gear button opens the teacher panel", await page.isVisible("#panel"));
    // subset + shuffle
    await page.click("#selNone");
    check("select none -> warning", /at least one/i.test(await page.innerText("#selMsg")));
    for (const i of [0, 4, 9]) await page.check(`#wordTicks input[data-i="${i}"]`);
    const before = (await st(page)).order.join();
    await page.click("#shuffleBtn");
    const s1 = await st(page);
    check("shuffle gives a real permutation in a new order", s1.order.join() !== before && [...s1.order].sort((a, b) => a - b).join() === before);
    await page.click("#azBtn");
    check("A–Z restores order", (await st(page)).order.join() === before);
    await page.click("#panelClose");
    check("start shows chosen subset count (3 mystery words)", /3\s*mystery words/i.test(await bodyText(page)));
    await page.click("#bStart");
    const s2 = await st(page);
    check("subset of 3 -> Discover deck has 3 words", s2.round === "discover" && s2.deck.length === 3 && /1\s*\/\s*3/.test(await page.innerText(".kicker")));
    await page.keyboard.press("a");
    const s3 = await st(page);
    const CHs = await page.evaluate(() => window.SL_CHALLENGES);
    check("subset -> Apply filtered to those words", s3.apply.list.length > 0 && s3.apply.list.every((qi) => ["add", "magical", "text"].includes(CHs[qi].word)) && s3.apply.list.length === CHs.filter((c) => ["add", "magical", "text"].includes(c.word)).length);
    check("start: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Discover: every word, both reveal paths ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { tag: "discover" });
    await setTwists(page, 0);
    await page.keyboard.press(" ");
    const revealed = [];
    for (let n = 0; n < 10; n++) {
      const s = await st(page);
      const w = WORDS[s.deck[s.pos]];
      const hidden = WORDS.filter((x) => !revealed.includes(x));
      await page.waitForTimeout(150);
      let t = await bodyText(page);
      const leak = foundWords(t, hidden);
      check(`discover "${w}": no unrevealed word visible on clue screen`, leak.length === 0, leak.join());
      const stageHTML = (await page.evaluate(() => document.getElementById("stage").innerHTML)).replace(/<\/?[a-z]+/gi, "<");
      check(`discover "${w}": stage markup contains no unrevealed word`, foundWords(stageHTML, hidden).length === 0, foundWords(stageHTML, hidden).join());
      check(`discover "${w}": picture + ${w.length} face-down tiles`, (await page.locator(".art svg[aria-label]").count()) === 1 && (await page.locator(".tile").count()) === w.length && (await page.locator(".tile.on").count()) === 0);
      check(`discover "${w}": example not shown before reveal`, !(await bodyText(page)).includes((await page.evaluate((i) => window.SL_WORDS[i].example, s.deck[s.pos]))));
      if (n % 2 === 0) {
        // Space path: hint -> reveal -> meaning -> talk -> next
        await page.keyboard.press(" ");
        check(`discover "${w}" (Space): hint shown`, await page.isVisible("#hintLine"));
        t = await bodyText(page);
        check(`discover "${w}": still no unrevealed word after hint`, foundWords(t, hidden).length === 0, foundWords(t, hidden).join());
        await page.keyboard.press(" ");
      } else {
        // button path: one letter, then letters until complete
        await page.click("#bHint");
        await page.click("#bLetter");
        const first = await page.locator(".tile.on .b").first().innerText();
        check(`discover "${w}" (L): one letter flips and shows "${w[0]}"`, (await page.locator(".tile.on").count()) === 1 && first.toLowerCase() === w[0]);
        if (w.length > 1) check(`discover "${w}": one letter does not reveal the word`, (await st(page)).rv[s.deck[s.pos]].stage === 0 && foundWords(await bodyText(page), [w]).length === 0);
        if (n === 9) await page.keyboard.press("w");
        else for (let k = 1; k < w.length; k++) await page.click("#bLetter");
      }
      await page.waitForTimeout(700);
      const tiles = (await page.locator(".tile .b").allInnerTexts()).join("").toLowerCase();
      check(`discover "${w}": reveal flips all tiles to the word`, tiles === w && (await page.locator(".tile.on").count()) === w.length);
      check(`discover "${w}": part of speech shown after reveal`, (await page.innerText("#posTag")).length > 2);
      revealed.push(w);
      if (n % 2 === 0) await page.keyboard.press(" "); else await page.click("#bMeaning");
      const ex = await page.evaluate((i) => window.SL_WORDS[i], s.deck[s.pos]);
      t = await bodyText(page);
      check(`discover "${w}": meaning screen = word + definition + example`, t.includes(ex.def) && t.includes(ex.example) && (await page.isVisible(".big-word")));
      check(`discover "${w}": clue is not crammed onto the meaning screen`, !t.includes(ex.clue));
      if (n % 2 === 0) await page.keyboard.press(" "); else await page.click("#bTalk");
      t = await bodyText(page);
      check(`discover "${w}": separate talk screen with prompt`, t.includes(ex.speak) && !t.includes(ex.def));
      if (n === 9) { await page.screenshot({ path: path.join(SHOTS, "1366-talk.png") }); }
      if (n % 2 === 0) await page.keyboard.press(" "); else await page.click("#bNext");
    }
    check("last word Next -> Apply round", (await st(page)).round === "apply");
    // arrows keep state
    await page.keyboard.press("d");
    await page.keyboard.press("ArrowLeft");
    check("← goes back, reveal state kept", (await st(page)).pos === 8 && (await page.isVisible(".talk-prompt")));
    // simple help
    await page.click("#gearBtn"); await page.check("#simpleOn"); await page.click("#panelClose");
    check("Simple help adds a sentence starter on the talk screen", await page.isVisible(".starter"));
    await page.click("#gearBtn"); await page.uncheck("#simpleOn"); await page.click("#panelClose");
    check("Simple help off removes it", !(await page.isVisible(".starter")));
    check("discover: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Plot twists + team scoring ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { tag: "twists" });
    await page.fill("#team0", "Night Owls");
    check("typing team name with d/space/t does not trigger shortcuts", (await st(page)).round === "start");
    await page.fill("#team1", "dd tt  ");
    check("team names are editable and shown on the tower", (await page.innerText("#nm0")) === "Night Owls" && (await st(page)).teams[1].name === "dd tt");
    await setTwists(page, 1);
    await page.keyboard.press(" ");
    await page.keyboard.press("w");
    await page.keyboard.press("ArrowRight");
    check("twist card drawn between words (every word setting)", await page.isVisible("#twist"));
    await page.waitForTimeout(800);
    const t1 = await page.textContent("#twistTitle");
    check("twist card has a known title", ["Double points", "Steal a point", "Act it out", "Whisper chain", "Sentence in 10 seconds", "Swap!"].includes(t1), t1);
    check("twist card flip animation ran (card shown)", await page.evaluate(() => document.getElementById("twistCard").classList.contains("shown")));
    check("countdown held while twist is open", (await page.evaluate(() => window.__SL.cd().st)) !== "run");
    await page.keyboard.press("x");
    await page.waitForTimeout(600);
    check("X redraws a different card", (await page.textContent("#twistTitle")) !== t1);
    await page.screenshot({ path: path.join(SHOTS, "1366-twist.png") });
    await page.keyboard.press("Escape");
    check("Esc skips the twist (no effect)", !(await page.isVisible("#twist")) && (await st(page)).effect === null);
    check("countdown runs after the twist closes", (await page.evaluate(() => window.__SL.cd().st)) === "run");
    // double
    await page.evaluate(() => window.__SL.forceTwist("double"));
    await page.keyboard.press(" ");
    check("Double accepted -> badge shown", await page.isVisible("#twistBadge") && /double/i.test(await page.innerText("#twistBadge")));
    await page.keyboard.press("1");
    let s = await st(page);
    check("Double points: next point is worth 2", s.teams[0].score === 2 && s.effect === null);
    await page.keyboard.press("1");
    check("after Double, points are worth 1 again", (await st(page)).teams[0].score === 3);
    await page.waitForTimeout(800);
    const h = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("cl0")).getPropertyValue("--h")));
    check("scoring team's lantern climbs the tower", h > 10, "h=" + h);
    // steal
    await page.keyboard.press("3"); // team 3 -> 1
    await page.evaluate(() => window.__SL.forceTwist("steal"));
    await page.keyboard.press(" ");
    await page.keyboard.press("2");
    s = await st(page);
    check("Steal: scorer +1 and steals 1 from the leader", s.teams[1].score === 2 && s.teams[0].score === 2 && s.effect === null, JSON.stringify(s.teams));
    // swap
    await page.evaluate(() => window.__SL.forceTwist("swap"));
    await page.click("#twistGo");
    s = await st(page);
    check("Swap: top and bottom team swap points", s.teams[3].score === 2 && s.teams.filter((t) => t.score === 0).length === 1, JSON.stringify(s.teams.map((t) => t.score)));
    await page.keyboard.press("u");
    s = await st(page);
    check("Undo reverses the swap", JSON.stringify(s.teams.map((t) => t.score)) === "[2,2,1,0]", JSON.stringify(s.teams.map((t) => t.score)));
    // rule cards
    for (const id of ["act", "whisper"]) {
      await page.evaluate((x) => window.__SL.forceTwist(x), id);
      await page.keyboard.press("Enter");
      check(`${id} card -> rule badge for this word`, (await st(page)).effect.id === id && (await page.isVisible("#twistBadge")));
    }
    await page.evaluate(() => window.__SL.forceTwist("sentence"));
    await page.keyboard.press(" ");
    check("Sentence card -> badge with 10 s button", await page.isVisible("#sentBtn"));
    await page.click("#effClear");
    check("teacher can clear an active twist", !(await page.isVisible("#twistBadge")));
    // clicks, minus, undo to empty, reset + undo
    await page.click("#cl3");
    await page.click('.lane .minus[data-k="0"]');
    s = await st(page);
    check("click lantern = +1, minus button = −1", s.teams[3].score === 1 && s.teams[0].score === 1);
    await page.keyboard.press("Shift+Digit4");
    check("Shift+4 gives team 4 a point", (await st(page)).teams[3].score === 2);
    await page.click("#resetScoresBtn");
    check("Reset scores -> all 0", (await st(page)).teams.every((t) => t.score === 0));
    await page.click("#undoBtn");
    check("Undo after reset restores scores", (await st(page)).teams[3].score === 2);
    let guard = 0;
    while (!(await page.isDisabled("#undoBtn")) && guard++ < 50) await page.click("#undoBtn");
    s = await st(page);
    check("Undo step by step back to empty (button disabled)", s.teams.every((t) => t.score === 0) && s.undo.length === 0);
    check("twists: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Timers (virtual clock) ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { clock: true, tag: "timers" });
    await setTwists(page, 0);
    await page.keyboard.press(" ");
    let c = await page.evaluate(() => window.__SL.cd());
    check("lantern countdown starts on the clue (45 s default)", c.st === "run" && Math.round(c.left) === 45);
    await page.clock.runFor(10000);
    c = await page.evaluate(() => window.__SL.cd());
    check("lantern burns down (≈35 s after 10 s)", Math.abs(c.left - 35) < 1, c.left);
    const life = await page.evaluate(() => parseFloat(document.querySelector(".countdown").style.getPropertyValue("--life")));
    check("flame shrinks with time", life < 0.9 && life > 0.6, life);
    await page.keyboard.press("p");
    await page.clock.runFor(5000);
    c = await page.evaluate(() => window.__SL.cd());
    check("P pauses the lantern", c.st === "pause" && Math.abs(c.left - 35) < 1);
    await page.keyboard.press("p");
    await page.clock.runFor(26000);
    check("urgent state in the last 10 s", await page.evaluate(() => document.querySelector(".countdown").classList.contains("urgent")));
    await page.clock.runFor(10000);
    c = await page.evaluate(() => window.__SL.cd());
    check("lantern goes out at 0 (OUT)", c.st === "out" && (await page.innerText(".ctime")) === "OUT");
    await page.keyboard.press("ArrowRight");
    await page.clock.runFor(3000);
    await page.keyboard.press("w");
    check("reveal stops the lantern", (await page.evaluate(() => window.__SL.cd().st)) === "stopped");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("k");
    check("K skips the countdown (hidden)", (await page.evaluate(() => window.__SL.cd().st)) === "skip" && !(await page.isVisible(".countdown")));
    // lesson timer
    await page.keyboard.press("t");
    await page.clock.runFor(10300); // display rounds up, like a real countdown
    check("lesson timer: 18:00 -> 17:50 after 10 s", (await page.innerText("#lessonTimer")) === "17:50");
    await page.keyboard.press("t");
    await page.clock.runFor(5000);
    check("lesson timer pause holds", (await page.innerText("#lessonTimer")) === "17:50");
    await page.click("#gearBtn");
    await page.fill("#lessonMin", "1");
    await page.press("#lessonMin", "Tab");
    await page.click("#panelClose");
    check("editable minutes reset the timer (1:00)", (await page.innerText("#lessonTimer")) === "1:00");
    await page.click("#lessonTimer");
    await page.clock.runFor(61000);
    check("expiry -> Time's up state (no sound by default)", (await page.evaluate(() => document.getElementById("lessonTimer").classList.contains("done"))) && (await st(page)).settings.sound === false);
    await page.keyboard.press("t");
    await page.clock.runFor(1300);
    check("start after expiry restarts", (await page.innerText("#lessonTimer")) === "0:59");
    // lantern setting
    await page.click("#gearBtn"); await page.fill("#lanternSec", "20"); await page.press("#lanternSec", "Tab"); await page.click("#panelClose");
    await page.keyboard.press("ArrowRight");
    c = await page.evaluate(() => window.__SL.cd());
    check("lantern seconds are editable (20 s)", Math.round(c.left) === 20 && c.st === "run");
    check("timers: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Apply (all questions), Create, Recap, Reset ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { tag: "rounds" });
    const CH = await page.evaluate(() => window.SL_CHALLENGES);
    await page.keyboard.press("a");
    for (let q = 0; q < CH.length; q++) {
      const c = CH[(await st(page)).apply.list[q]];
      check(`apply q${q + 1}: no feedback before a choice`, (await page.innerText("#why")) === "" && (await page.locator(".opt.right, .opt.wrong").count()) === 0);
      const wrong = c.opts.findIndex((_, k) => k !== c.ok);
      if (q % 2 === 0) await page.keyboard.press(String(wrong + 1)); else await page.click(`.opt[data-k="${wrong}"]`);
      check(`apply q${q + 1}: wrong pick -> its WHY, answer not spoiled`, (await page.innerText("#why")) === c.why[wrong] && (await page.locator(".opt.right").count()) === 0 && (await page.locator(".opt.wrong").count()) === 1);
      if (q % 3 === 2) await page.keyboard.press(" ");
      else if (q % 2 === 0) await page.keyboard.press(String(c.ok + 1)); else await page.click(`.opt[data-k="${c.ok}"]`);
      check(`apply q${q + 1}: correct -> marked right + WHY`, (await page.innerText("#why")) === c.why[c.ok] && (await page.locator(`.opt.right[data-k="${c.ok}"]`).count()) === 1);
      if (q === 7) await page.screenshot({ path: path.join(SHOTS, "1366-apply.png") });
      if (q === 3) { await page.keyboard.press("ArrowLeft"); check("apply ← previous keeps answer", (await page.locator(".opt.right").count()) === 1); await page.keyboard.press("ArrowRight"); }
      await page.keyboard.press("ArrowRight");
    }
    check("last Apply Next -> Create", (await st(page)).round === "create");
    // create
    check("create: model hidden by default", !(await page.isVisible("#model")) && (await page.locator(".chip").count()) >= 3);
    await page.keyboard.press("v");
    check("create: V shows the model story", await page.isVisible("#model"));
    await page.screenshot({ path: path.join(SHOTS, "1366-create-model.png") });
    await page.keyboard.press("ArrowRight");
    check("create: new set hides the model", !(await page.isVisible("#model")) && (await st(page)).create.pos === 1);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    check("create: sets wrap forward", (await st(page)).create.pos === 0);
    await page.keyboard.press("ArrowLeft");
    check("create: sets wrap backward", (await st(page)).create.pos === 3);
    await page.click("#bModel");
    check("create: model button works", await page.isVisible("#model"));
    // recap before the end: only revealed words
    await page.click("#gearBtn"); await page.selectOption("#twistEvery", "0"); await page.click("#panelClose");
    await page.keyboard.press("d");
    await page.keyboard.press("w"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("w");
    await page.keyboard.press("r");
    let t = await bodyText(page);
    const shown = foundWords(t, WORDS);
    check("recap: only the 2 revealed words visible, rest locked", shown.join() === "add,although" && (await page.locator(".rc.locked").count()) === 8, shown.join());
    const recapHTML = (await page.evaluate(() => document.getElementById("stage").innerHTML)).replace(/<\/?[a-z]+/gi, "<");
    check("recap: locked cards hold no word (not even length)", foundWords(recapHTML, WORDS.slice(2)).length === 0 && !/\?\?\?/.test(recapHTML));
    await page.click("#bRetryD");
    check("retry with nothing ticked -> message", /tick at least one/i.test(await page.innerText("#recapMsg")));
    await page.click("#bUnlock");
    t = await bodyText(page);
    check("recap: 'Reveal the rest' shows all 10 words", foundWords(t, WORDS).length === 10 && (await page.locator(".rc.locked").count()) === 0);
    await page.screenshot({ path: path.join(SHOTS, "1366-recap.png") });
    await page.check('.rc input[data-i="1"]'); await page.check('.rc input[data-i="7"]');
    await page.click("#bRetryD");
    let s = await st(page);
    check("retry 2 words in Discover starts clean", s.round === "discover" && s.deck.join() === "1,7" && !s.rv[1] || (s.rv[1] && s.rv[1].stage === 0 && !s.rv[1].hint));
    check("retry: word hidden again on its clue screen", foundWords(await bodyText(page), ["although"]).length === 0 && (await page.locator(".tile.on").count()) === 0);
    await page.keyboard.press("r");
    check("retry ticks cleared afterwards", (await page.locator(".rc input:checked").count()) === 0);
    await page.check('.rc input[data-i="9"]');
    await page.click("#bRetryA");
    s = await st(page);
    check("retry in Apply: only that word's questions, no old feedback", s.round === "apply" && s.apply.list.every((qi) => CH[qi].word === "text") && s.apply.list.length === 2 && (await page.innerText("#why")) === "");
    // reset everything
    await page.keyboard.press("2"); // answer something
    await page.keyboard.press("Shift+Digit2");
    await page.keyboard.press("t");
    await page.click("#gearBtn"); await page.click("#resetAll");
    s = await st(page);
    check("Reset everything: start round, scores 0, reveals cleared, timer 18:00 stopped", s.round === "start" && s.teams.every((x) => x.score === 0) && Object.keys(s.rv).length === 0 && Object.keys(s.apply.picks).length === 0 && (await page.innerText("#lessonTimer")) === "18:00" && !(await page.evaluate(() => window.__SL.lesson().running)));
    t = await bodyText(page);
    check("after reset, start screen again shows no words", foundWords(t, WORDS).length === 0);
    check("rounds: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Keyboard ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { tag: "keys" });
    for (const [k, r] of [["d", "discover"], ["a", "apply"], ["c", "create"], ["r", "recap"], ["q", "start"]]) {
      await page.keyboard.press(k);
      check(`key ${k.toUpperCase()} -> ${r}`, (await st(page)).round === r);
    }
    for (const r of ["discover", "apply", "create", "recap", "start"]) {
      await page.click(`#rounds button[data-round="${r}"]`);
      check(`nav button -> ${r}`, (await st(page)).round === r);
    }
    await page.keyboard.press("Shift+Slash");
    check("? opens help", await page.isVisible("#help"));
    await page.keyboard.press("d");
    check("help open: other shortcuts paused", (await st(page)).round === "start");
    await page.keyboard.press("Escape");
    check("Esc closes help", !(await page.isVisible("#help")));
    await page.click("#gearBtn");
    await page.focus("#lanternSec");
    await page.keyboard.press("d"); await page.keyboard.press("Space"); await page.keyboard.press("t");
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    check("typing in a number box does not trigger shortcuts", (await st(page)).round === "start" && !(await page.evaluate(() => window.__SL.lesson().running)));
    await page.fill("#team2", "");
    await page.focus("#team2");
    await page.keyboard.type("dam sq");
    check("typing in a team name box does not trigger shortcuts", (await st(page)).round === "start" && (await st(page)).teams[2].name === "dam sq" && !(await page.isVisible("#panel")));
    await page.keyboard.press("Escape");
    await page.keyboard.press("m");
    check("M toggles sound on (synth only)", (await st(page)).settings.sound === true && (await page.getAttribute("#soundBtn", "aria-pressed")) === "true");
    await page.keyboard.press("m");
    check("M toggles sound off again", (await st(page)).settings.sound === false);
    await page.keyboard.press("Space");
    check("Space on start screen starts the game", (await st(page)).round === "discover");
    await page.click("#bHint"); // mouse click then Space must not re-press the button
    await page.keyboard.press("Space");
    check("after a mouse click, Space still means 'next step'", (await st(page)).rv[0].stage === 1);
    await page.keyboard.press("f");
    await page.waitForTimeout(400);
    const fs1 = await page.evaluate(() => !!document.fullscreenElement);
    const fsMsg = /F11/.test(await page.innerText("#toast"));
    check("F -> fullscreen (or F11 hint if blocked)", fs1 || fsMsg, "fullscreen=" + fs1);
    if (fs1) { await page.keyboard.press("f"); await page.waitForTimeout(300); }
    check("keys: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Layout: one idea per screen, no scrolling ================= */
  for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const tag = `${vp.width}x${vp.height}`;
    const { ctx, page, problems } = await openApp(browser, { viewport: vp, tag });
    const fitCheck = async (name) => {
      await page.waitForTimeout(420); // let the 0.35 s screen-enter slide finish
      const f = await fits(page);
      check(`${tag} ${name}: no vertical/horizontal scroll, nothing clipped`, !f.vScroll && !f.hScroll && !f.clipped, JSON.stringify(f));
    };
    await fitCheck("start");
    await page.click("#gearBtn"); await page.selectOption("#twistEvery", "0"); await page.check("#simpleOn"); await page.click("#panelClose");
    await page.keyboard.press(" ");
    for (let n = 0; n < 10; n++) {
      if (n === 0) {
        const sizes = await page.evaluate(() => ({ clue: parseFloat(getComputedStyle(document.getElementById("clueText")).fontSize), tile: document.querySelector(".tile").getBoundingClientRect().width }));
        const minClue = vp.width >= 1920 ? 48 : 34;
        check(`${tag} clue text is huge (>= ${minClue}px)`, sizes.clue >= minClue, JSON.stringify(sizes));
        check(`${tag} letter tiles are huge (>= 64px)`, sizes.tile >= 64, JSON.stringify(sizes));
      }
      await page.keyboard.press("h");
      const w = WORDS[(await st(page)).deck[(await st(page)).pos]];
      await fitCheck(`clue+hint "${w}"`);
      if (n === 0 || n === 5) await page.screenshot({ path: path.join(SHOTS, `${tag}-clue-${w}.png`) });
      await page.keyboard.press("w"); await page.waitForTimeout(80);
      await fitCheck(`revealed "${w}"`);
      await page.keyboard.press(" "); await fitCheck(`meaning "${w}"`);
      if (n === 5) await page.screenshot({ path: path.join(SHOTS, `${tag}-meaning-${w}.png`) });
      await page.keyboard.press(" "); await fitCheck(`talk "${w}"`);
      await page.keyboard.press("ArrowRight");
    }
    check(`${tag} last talk Next -> Apply`, (await st(page)).round === "apply");
    const n = (await st(page)).apply.list.length;
    for (let q = 0; q < n; q++) {
      const c = await page.evaluate(() => { const s = window.__SL.state(); return window.SL_CHALLENGES[s.apply.list[s.apply.pos]]; });
      // longest WHY shown (worst case)
      let longest = 0; c.why.forEach((y, k) => { if (y.length > c.why[longest].length) longest = k; });
      await page.keyboard.press(String(longest + 1));
      await fitCheck(`apply q${q + 1} with feedback`);
      await page.keyboard.press("ArrowRight");
    }
    for (let k = 0; k < 4; k++) {
      await fitCheck(`create set ${k + 1}`);
      await page.keyboard.press("v"); await fitCheck(`create set ${k + 1} model`);
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("r"); await page.click("#bUnlock").catch(() => {});
    await fitCheck("recap (all words)");
    await page.evaluate(() => window.__SL.forceTwist("sentence"));
    await page.waitForTimeout(700);
    const tw = await page.evaluate(() => { const r = document.getElementById("twistCard").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    check(`${tag} twist card fits on screen`, tw);
    await page.screenshot({ path: path.join(SHOTS, `${tag}-twist.png`) });
    check(`${tag}: no network / console errors`, !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Phone 390x844 ================= */
  {
    const vp = { width: 390, height: 844 };
    const { ctx, page, problems } = await openApp(browser, { viewport: vp, tag: "phone", touch: true });
    const noH = async (name) => { await page.waitForTimeout(420); const f = await fits(page); check(`390 ${name}: no horizontal overflow`, !f.hScroll, JSON.stringify(f)); };
    await noH("start");
    await page.screenshot({ path: path.join(SHOTS, "390-start.png"), fullPage: true });
    await page.click("#gearBtn"); await page.selectOption("#twistEvery", "0"); await page.click("#panelClose");
    await page.tap("#bStart");
    await noH("clue");
    await page.tap("#bWord");
    await page.waitForTimeout(700);
    check("390 reveal button works by tap", (await st(page)).rv[0].stage === 1);
    await page.screenshot({ path: path.join(SHOTS, "390-discover.png"), fullPage: true });
    await page.tap("#bMeaning"); await noH("meaning");
    await page.tap('#rounds button[data-round="apply"]'); await noH("apply");
    await page.tap('.opt[data-k="0"]');
    check("390 apply option tap works", (await page.innerText("#why")).length > 10);
    await page.tap('#rounds button[data-round="create"]'); await noH("create");
    await page.tap("#bModel"); check("390 create model tap works", await page.isVisible("#model"));
    await page.tap('#rounds button[data-round="recap"]'); await noH("recap");
    await page.tap(".lane .plus[data-k='1']");
    check("390 team + button works", (await st(page)).teams[1].score === 1);
    await page.screenshot({ path: path.join(SHOTS, "390-recap.png"), fullPage: true });
    check("phone: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ================= Reduced motion ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { reducedMotion: "reduce", tag: "reduced" });
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector("#host .flame-wrap")).animationName);
    check("reduced motion: host flame animation off", anim === "none", anim);
    await page.click("#gearBtn"); await page.selectOption("#twistEvery", "0"); await page.click("#panelClose");
    await page.keyboard.press(" ");
    const drawn = await page.evaluate(() => [...document.querySelectorAll(".art svg *")].every((e) => !e.style.strokeDashoffset || parseFloat(e.style.strokeDashoffset) === 0));
    check("reduced motion: picture appears complete (no draw-in)", drawn);
    await page.keyboard.press("w");
    const sparks = await page.evaluate(() => document.querySelectorAll(".spark").length);
    const tileTr = await page.evaluate(() => getComputedStyle(document.querySelector(".tile")).transitionDuration);
    check("reduced motion: no burst particles, no flip animation", sparks === 0 && /^0s/.test(tileTr), sparks + " " + tileTr);
    await page.evaluate(() => window.__SL.forceTwist("double"));
    check("reduced motion: twist card shown immediately", await page.evaluate(() => document.getElementById("twistCard").classList.contains("shown")));
    check("reduced motion: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
    const n = await openApp(browser, { tag: "motion" });
    const a2 = await n.page.evaluate(() => getComputedStyle(document.querySelector("#host .flame-wrap")).animationName);
    check("motion allowed: host flame flickers", a2 === "flicker", a2);
    await n.page.click("#gearBtn"); await n.page.selectOption("#twistEvery", "0"); await n.page.click("#panelClose");
    await n.page.keyboard.press(" ");
    await n.page.waitForTimeout(300);
    const drawing = await n.page.evaluate(() => [...document.querySelectorAll(".art svg *")].some((e) => /stroke-dashoffset/.test(e.style.transition)));
    check("motion allowed: picture draws itself in (stroke animation)", drawing);
    await n.page.keyboard.press("w");
    await n.page.waitForTimeout(450);
    const sp = await n.page.evaluate(() => document.querySelectorAll(".spark").length);
    check("motion allowed: burst on full reveal", sp > 10, sp);
    await n.page.waitForTimeout(1200);
    check("burst cleans up after itself (short animation)", (await n.page.evaluate(() => document.querySelectorAll(".spark").length)) === 0);
    await n.ctx.close();
  }

  /* ================= Worksheet: print A4 (unchanged file) ================= */
  {
    const { ctx, page, problems } = await openApp(browser, { url: SHEET, viewport: { width: 688, height: 1032 }, tag: "worksheet" });
    await page.emulateMedia({ media: "print" });
    const sizes = await page.$$eval(".sheet", (els) => els.map((e) => ({ id: e.id, h: e.scrollHeight, w: e.scrollWidth })));
    check("worksheet has 3 sections (2 student + key)", sizes.length === 3 && sizes[2].id === "key");
    for (const s of sizes) check(`worksheet ${s.id} fits one A4 page (h=${s.h}px <= 1032)`, s.h <= 1032 && s.w <= 688, JSON.stringify(s));
    const pdfPath = path.join(OUT, "worksheet-check.pdf");
    await page.pdf({ path: pdfPath, format: "A4", preferCSSPageSize: true, printBackground: true });
    const count = (f) => (fs.readFileSync(f, "latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    check("worksheet re-printed by Chromium = exactly 3 A4 pages", count(pdfPath) === 3, "pages=" + count(pdfPath));
    check("committed worksheet.pdf has exactly 3 pages", count(path.join(ROOT, "worksheet.pdf")) === 3);
    check("worksheet: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  await browser.close();
  const ext = allProblems.flatMap((p) => p.external), errs = allProblems.flatMap((p) => p.errors.map((e) => p.tag + ": " + e));
  check("ALL runs: zero non-file:// network requests", ext.length === 0, ext.join(" "));
  check("ALL runs: zero console errors/warnings", errs.length === 0, errs.join(" | "));
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify({ when: new Date().toISOString(), passed, failed: results.length - passed, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
