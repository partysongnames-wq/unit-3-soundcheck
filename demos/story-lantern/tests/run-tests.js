#!/usr/bin/env node
/* Story Lantern browser tests. Run from repo root or anywhere:
 *   node demos/story-lantern/tests/run-tests.js
 * Requires Playwright + Chromium (uses the preinstalled browser). Writes:
 *   tests/results.json, tests/screenshots/*.png, ../worksheet.pdf
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const INDEX = pathToFileURL(path.join(ROOT, "index.html")).href;
const SHEET = pathToFileURL(path.join(ROOT, "worksheet.html")).href;
const SHOTS = path.join(__dirname, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || "" });
  console.log((cond ? "PASS " : "FAIL ") + name + (detail && !cond ? "  -- " + detail : ""));
}

async function openApp(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1366, height: 768 }, reducedMotion: opts.reducedMotion || "no-preference" });
  const page = await ctx.newPage();
  const problems = { external: [], errors: [] };
  page.on("request", (r) => { if (!r.url().startsWith("file://") && !r.url().startsWith("data:")) problems.external.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.errors.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => problems.errors.push("pageerror: " + e.message));
  if (opts.clock) await page.clock.install({ time: new Date("2026-10-27T09:00:00Z") });
  await page.goto(opts.url || INDEX);
  return { ctx, page, problems };
}
const txt = (page, sel) => page.locator(sel).innerText();
const visible = (page, sel) => page.locator(sel).isVisible();
const st = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__SL.state())));

(async () => {
  const browser = await chromium.launch();
  const words = await (async () => {
    const { ctx, page } = await openApp(browser);
    const w = await page.evaluate(() => window.SL_WORDS.map((x) => x.word));
    const ch = await page.evaluate(() => window.SL_CHALLENGES);
    await ctx.close();
    return { list: w, ch };
  })();

  /* ---------- Content checks ---------- */
  const expected = ["add", "although", "belief", "collect", "magical", "primarily", "publish", "scary", "suitable", "text"];
  check("exactly the ten target words", JSON.stringify(words.list) === JSON.stringify(expected), words.list.join(","));
  for (const w of expected) check(`apply has >=1 challenge for "${w}"`, words.ch.some((c) => c.word === w));
  const all = JSON.stringify(words.ch).toLowerCase();
  check("apply covers although vs because", words.ch.filter((c) => c.opts.map((o) => o.toLowerCase()).join() === "although,because").length >= 2);
  check("apply covers primarily = mainly", all.includes("mainly"));
  check("apply covers suitable = appropriate", all.includes("appropriate"));
  check("apply covers belief as noun", all.includes("noun") && all.includes("believe"));
  check("apply covers magical = having magic, not merely beautiful", all.includes("special powers") && all.includes("not just beauty"));
  check("apply covers text = written words", all.includes("written words"));
  check("every challenge has a WHY for each option", words.ch.every((c) => c.why.length === c.opts.length && c.why.every((y) => y.length > 20)));

  /* ---------- Main flow at projector size ---------- */
  {
    const { ctx, page, problems } = await openApp(browser, { clock: true });
    check("start round shown on load", await visible(page, "#round-start"));
    check("10 word checkboxes", (await page.locator("#wordPick input").count()) === 10);

    // subset + warnings
    await page.click("#selNone");
    await page.click("#startBtn");
    check("start with no words shows warning", await visible(page, "#startWarn"));
    await page.click("#selAll");
    // shuffle
    const before = (await st(page)).order.join();
    let changed = false;
    for (let i = 0; i < 6 && !changed; i++) { await page.click("#shuffleBtn"); changed = (await st(page)).order.join() !== before; }
    const ord = (await st(page)).order;
    check("shuffle changes order", changed);
    check("shuffle is a permutation of 0..9", [...ord].sort((a, b) => a - b).join() === "0,1,2,3,4,5,6,7,8,9");
    check("order text reflects shuffle", (await txt(page, "#orderText")).includes(words.list[ord[0]]));
    await page.click("#orderReset");
    check("A-Z resets order", (await st(page)).order.join() === "0,1,2,3,4,5,6,7,8,9");

    // keyboard shortcuts must not hijack text inputs
    await page.click("#timerMinutes");
    await page.keyboard.press("d");
    await page.keyboard.press("Space");
    await page.keyboard.press("t");
    check("typing in an input does not trigger shortcuts", (await st(page)).round === "start" && !(await st(page)).timer.running);
    await page.locator("#timerMinutes").blur();

    // help dialog
    await page.keyboard.press("?");
    check("? opens keyboard help", await visible(page, "#help"));
    await page.keyboard.press("d");
    check("shortcuts paused while help open", (await st(page)).round === "start");
    await page.keyboard.press("Escape");
    check("Esc closes keyboard help", !(await visible(page, "#help")));

    await page.screenshot({ path: path.join(SHOTS, "1366-start.png") });
    await page.click("#startBtn");
    check("Start Discover goes to discover", (await st(page)).round === "discover");

    // Discover all ten words
    for (let i = 0; i < 10; i++) {
      const w = words.list[i];
      const re = new RegExp("\\b" + w + "\\b", "i");
      check(`[${w}] progress shows ${i + 1} of 10`, (await txt(page, "#dProgress")) === `Word ${i + 1} of 10`);
      const pre = await page.locator(".dcard").innerText();
      check(`[${w}] word not visible before reveal`, !re.test(pre), pre.slice(0, 120));
      check(`[${w}] picture is an inline SVG with a label`, (await page.locator("#dPic svg[aria-label]").count()) === 1);
      check(`[${w}] letter slots = word length`, (await page.locator("#dLetters span").count()) === w.length);
      if (i % 2 === 0) {
        // button / letter path
        await page.keyboard.press("h");
        check(`[${w}] H shows hint`, await visible(page, "#dHint"));
        check(`[${w}] hint does not spoil word`, !re.test(await page.locator(".dcard").innerText()));
        await page.click("#dLetterBtn");
        check(`[${w}] one letter revealed`, (await page.locator("#dLetters span.on").count()) === 1 && (await page.locator("#dLetters span.on").first().innerText()).toLowerCase() === w[0]);
        check(`[${w}] reveal panel still hidden after 1 letter`, !(await visible(page, "#dReveal")));
        for (let k = 1; k < w.length; k++) await page.keyboard.press("l");
        check(`[${w}] all letters -> word revealed`, (await visible(page, "#dReveal")) && re.test(await txt(page, "#dReveal")));
        check(`[${w}] example hidden until requested`, !(await page.locator("#dReveal .ex").count()));
        await page.click("#dExBtn");
      } else {
        // Space path: hint -> first letter -> word -> example
        await page.keyboard.press("Space");
        check(`[${w}] Space 1 = hint`, await visible(page, "#dHint"));
        await page.keyboard.press("Space");
        check(`[${w}] Space 2 = first letter`, (await page.locator("#dLetters span.on").count()) === 1);
        await page.keyboard.press("Space");
        check(`[${w}] Space 3 = whole word`, re.test(await txt(page, "#dReveal")) && !(await page.locator("#dReveal .ex").count()));
        await page.keyboard.press("Space");
      }
      check(`[${w}] example + talk prompt shown`, (await page.locator("#dReveal .ex").count()) === 1 && (await page.locator("#dReveal .talk").count()) === 1);
      check(`[${w}] challenge prompt shown`, (await page.locator("#dReveal .challenge").count()) === 1);
      if (i === 0) {
        await page.screenshot({ path: path.join(SHOTS, "1366-discover-revealed.png") });
        await page.click("#dHide");
        check(`[${w}] Hide all resets reveals`, !(await visible(page, "#dReveal")) && !(await visible(page, "#dHint")) && (await page.locator("#dLetters span.on").count()) === 0);
        await page.click("#dWordBtn");
        check(`[${w}] W button reveals whole word`, re.test(await txt(page, "#dReveal")));
        await page.keyboard.press("e");
        // previous / next
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowLeft");
        check(`[${w}] ArrowRight then ArrowLeft returns, state kept`, (await txt(page, "#dProgress")) === "Word 1 of 10" && (await page.locator("#dReveal .ex").count()) === 1);
      }
      if (i < 9) await page.keyboard.press("ArrowRight");
    }
    // simple help toggle
    await page.click("#simpleToggle");
    check("simple help adds sentence starter", (await page.locator("#dReveal .starter").count()) === 1);
    await page.click("#simpleToggle");
    check("simple help off removes starter", (await page.locator("#dReveal .starter").count()) === 0);
    check("Prev disabled on first word only", !(await page.locator("#dPrev").isDisabled()));
    await page.click("#dNext");
    check("Next on last word goes to Apply", (await st(page)).round === "apply");

    // Apply: every challenge, wrong then right; alternating click/keyboard
    const n = words.ch.length;
    check(`apply has ${n} questions for 10 words`, (await txt(page, "#aProgress")) === `Question 1 of ${n}`);
    for (let i = 0; i < n; i++) {
      const c = words.ch[i];
      const tag = `[apply ${i + 1} ${c.word}]`;
      check(`${tag} question shown`, (await txt(page, "#aQ")) === c.q);
      check(`${tag} no feedback before choice`, (await page.locator("#aFb p").count()) === 0);
      const wrong = c.ok === 0 ? 1 : 0;
      if (i === 3) {
        await page.keyboard.press("Space");
        check(`${tag} Space shows answer + why`, (await page.locator(`#aOpts button[data-opt="${c.ok}"].right`).count()) === 1 && (await txt(page, "#aFb")).includes(c.why[c.ok]));
      } else {
        if (i % 2) await page.keyboard.press(String(wrong + 1)); else await page.click(`#aOpts button[data-opt="${wrong}"]`);
        check(`${tag} wrong option marked + WHY shown`, (await page.locator(`#aOpts button[data-opt="${wrong}"].wrong`).count()) === 1 && (await txt(page, "#aFb")).includes(c.why[wrong]));
        check(`${tag} correct answer not spoiled after wrong pick`, (await page.locator("#aOpts button.right").count()) === 0);
        if (i % 2) await page.keyboard.press(String(c.ok + 1)); else await page.click(`#aOpts button[data-opt="${c.ok}"]`);
        check(`${tag} correct option marked + WHY shown`, (await page.locator(`#aOpts button[data-opt="${c.ok}"].right`).count()) === 1 && (await txt(page, "#aFb")).includes(c.why[c.ok]));
      }
      if (i === 0) await page.screenshot({ path: path.join(SHOTS, "1366-apply-feedback.png") });
      if (i < n - 1) await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("ArrowLeft");
    check("apply previous works", (await txt(page, "#aProgress")) === `Question ${n - 1} of ${n}`);
    await page.keyboard.press("ArrowRight");
    await page.click("#aNext");
    check("Next on last question goes to Create", (await st(page)).round === "create");

    // Create
    check("model story hidden by default", !(await visible(page, "#cModel")));
    check("create shows 4 words", (await page.locator("#cWords li").count()) === 4);
    await page.click("#cModelBtn");
    check("model story shown on request", (await visible(page, "#cModel")) && (await txt(page, "#cModel")).length > 50);
    await page.screenshot({ path: path.join(SHOTS, "1366-create.png") });
    await page.click("#cModelBtn");
    check("model story can be hidden again", !(await visible(page, "#cModel")));
    await page.click("#cModelBtn");
    await page.keyboard.press("ArrowRight");
    check("new word set hides model again", !(await visible(page, "#cModel")) && (await txt(page, "#cProgress")) === "Word set 2 of 4");
    await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft");
    check("word sets wrap around", (await txt(page, "#cProgress")) === "Word set 4 of 4");

    // Round skipping via keys
    for (const [k, r] of [["q", "start"], ["r", "recap"], ["a", "apply"], ["c", "create"], ["d", "discover"], ["r", "recap"]]) {
      await page.keyboard.press(k);
      check(`key ${k.toUpperCase()} -> ${r}`, (await st(page)).round === r && (await visible(page, "#round-" + r)));
    }
    await page.click('[data-round="apply"]');
    check("nav button click -> apply", (await st(page)).round === "apply");
    await page.click('[data-round="recap"]');

    // Recap
    check("recap lists all ten words", (await page.locator("#recapBody tr").count()) === 10);
    const recapText = await txt(page, "#recapBody");
    check("recap has every word + definition", expected.every((w) => recapText.includes(w)));
    await page.click("#retryDiscover");
    check("retry with none ticked warns", await visible(page, "#retryWarn"));
    await page.check('#recapBody input[data-r="2"]');
    await page.check('#recapBody input[data-r="7"]');
    await page.screenshot({ path: path.join(SHOTS, "1366-recap.png") });
    await page.click("#retryDiscover");
    check("retry discover: 2 words", (await txt(page, "#dProgress")) === "Word 1 of 2");
    check("retry discover: no old reveal state", !(await visible(page, "#dReveal")) && !(await visible(page, "#dHint")));
    await page.keyboard.press("ArrowRight");
    check("retry discover second word is scary", (await page.locator("#dLetters span").count()) === 5);
    await page.keyboard.press("r");
    check("retry ticks cleared after retry", (await page.locator("#recapBody input:checked").count()) === 0);
    await page.check('#recapBody input[data-r="9"]');
    await page.click("#retryApply");
    check("retry apply: only 'text' questions, fresh", (await txt(page, "#aProgress")) === "Question 1 of 2" && (await page.locator("#aFb p").count()) === 0 && /text/i.test(await txt(page, "#aTag")));

    // Scores
    await page.keyboard.press("b");
    check("B shows scores", await visible(page, "#scores"));
    const plus = (t) => page.click(`#teamList button[data-t="${t}"][data-d="1"]`);
    const pts = async () => (await page.locator("#teamList .pts").allInnerTexts()).join(",");
    await plus(0); await plus(0); await plus(1);
    await page.click('#teamList button[data-t="2"][data-d="-1"]');
    check("scores after +1,+1,+1,-1", (await pts()) === "2,1,-1,0");
    await page.click("#scoreUndo");
    check("undo reverts last change", (await pts()) === "2,1,0,0");
    await page.click("#scoreUndo"); await page.click("#scoreUndo"); await page.click("#scoreUndo");
    check("undo all the way", (await pts()) === "0,0,0,0" && (await page.locator("#scoreUndo").isDisabled()));
    await plus(3);
    await page.fill("#teamCount", "6"); await page.locator("#teamCount").dispatchEvent("change");
    check("team count 6 -> six teams, score kept", (await page.locator("#teamList li").count()) === 6 && (await pts()) === "0,0,0,1,0,0");
    await page.click("#scoreReset");
    check("reset scores", (await pts()) === "0,0,0,0,0,0" && (await page.locator("#scoreUndo").isDisabled()));
    await plus(1);
    await page.screenshot({ path: path.join(SHOTS, "1366-apply-scores.png") });
    await page.keyboard.press("b");
    check("B hides scores", !(await visible(page, "#scores")));

    // Timer (virtual clock)
    await page.keyboard.press("q");
    await page.fill("#timerMinutes", "1"); await page.locator("#timerMinutes").dispatchEvent("change");
    check("timer minutes editable", (await txt(page, "#timerDisplay")) === "1:00");
    await page.locator("body").click({ position: { x: 5, y: 700 } });
    await page.keyboard.press("t");
    await page.clock.runFor(10000);
    check("timer counts down (0:50)", (await txt(page, "#timerDisplay")) === "0:50");
    await page.click("#timerToggle"); // pause
    await page.clock.runFor(10000);
    check("pause holds time", (await txt(page, "#timerDisplay")) === "0:50" && (await txt(page, "#timerToggle")) === "Resume");
    await page.click("#timerToggle"); // resume
    await page.clock.runFor(5000);
    check("resume continues (0:45)", (await txt(page, "#timerDisplay")) === "0:45");
    await page.click("#timerReset");
    check("reset returns to 1:00 and stops", (await txt(page, "#timerDisplay")) === "1:00" && !(await st(page)).timer.running);
    await page.click("#timerToggle");
    await page.clock.runFor(61000);
    check("timer expiry shows time's up", (await page.locator("#timer.expired").count()) === 1 && (await txt(page, "#toast")).includes("Time's up"));
    await page.screenshot({ path: path.join(SHOTS, "1366-timer-expired.png") });
    await page.click("#timerToggle");
    check("start after expiry restarts from full time", (await st(page)).timer.running && !(await st(page)).timer.expired);

    // Fullscreen (headless may refuse; either fullscreen or fallback message is OK, no error)
    await page.keyboard.press("f");
    let fs1 = false, toastTxt = "";
    for (let i = 0; i < 30 && !fs1 && !/F11/.test(toastTxt); i++) {  // the browser answers asynchronously, in real time
      await new Promise((r) => setTimeout(r, 100));
      fs1 = await page.evaluate(() => !!document.fullscreenElement);
      toastTxt = await txt(page, "#toast").catch(() => "");
    }
    check("F: fullscreen entered or fallback message shown", fs1 || /F11/.test(toastTxt), "fullscreen=" + fs1 + " toast=" + toastTxt);
    if (fs1) await page.keyboard.press("f");

    // Reset everything
    await page.keyboard.press("b"); await plus(0);
    await page.keyboard.press("r");
    await page.click("#resetAll");
    const s2 = await st(page);
    check("reset everything -> start, fresh state", s2.round === "start" && !s2.deck && Object.keys(s2.dState).length === 0 && Object.keys(s2.aState).length === 0 && s2.scores.join() === "0,0,0,0" && !s2.timer.running && s2.timer.left === 1080 && s2.selected.every(Boolean));
    check("reset hides scores panel and resets timer display", !(await visible(page, "#scores")) && (await txt(page, "#timerDisplay")) === "18:00");
    await page.keyboard.press("d");
    check("after reset Discover shows word 1 of 10 unrevealed", (await txt(page, "#dProgress")) === "Word 1 of 10" && !(await visible(page, "#dReveal")));

    // Subset start
    await page.keyboard.press("q");
    await page.click("#selNone");
    for (const i of [1, 4, 8]) await page.check(`#wordPick input[data-w="${i}"]`);
    check("selection count shows 3 of 10", (await txt(page, "#selCount")) === "(3 of 10)");
    await page.click("#startBtn");
    check("subset: discover 3 words", (await txt(page, "#dProgress")) === "Word 1 of 3");
    const subsetQ = words.ch.filter((c) => ["although", "magical", "suitable"].includes(c.word)).length;
    await page.keyboard.press("a");
    check("subset: apply filtered to those words", (await txt(page, "#aProgress")) === `Question 1 of ${subsetQ}`);

    check("no network requests (main flow)", problems.external.length === 0, problems.external.join(" "));
    check("no console errors/warnings (main flow)", problems.errors.length === 0, problems.errors.join(" | "));
    await ctx.close();
  }

  /* ---------- Layout at three sizes ---------- */
  for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    const { ctx, page, problems } = await openApp(browser, { viewport: vp });
    const tag = `${vp.width}x${vp.height}`;
    for (const r of ["start", "discover", "apply", "create", "recap"]) {
      await page.keyboard.press({ start: "q", discover: "d", apply: "a", create: "c", recap: "r" }[r]);
      if (r === "discover") { for (let k = 0; k < 4; k++) await page.keyboard.press("Space"); }
      if (r === "apply") await page.keyboard.press("2");
      if (r === "create") await page.click("#cModelBtn");
      if (r === "discover" || r === "apply") {
        const sel = r === "discover" ? "#dReveal > :last-child" : "#aFb > :last-child";
        const ctl = r === "discover" ? "#round-discover .controls" : "#round-apply .controls";
        const gap = await page.evaluate(([a, b]) => document.querySelector(b).getBoundingClientRect().top - document.querySelector(a).getBoundingClientRect().bottom, [sel, ctl]);
        check(`${tag} ${r}: newest revealed text is on screen above the controls`, gap >= 0, "gap px=" + gap);
      }
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${tag} ${r}: no horizontal overflow`, ov <= 0, "overflow px=" + ov);
      await page.screenshot({ path: path.join(SHOTS, `${vp.width}-${r}.png`), fullPage: vp.width === 390 });
    }
    // projector: Discover controls reachable without scrolling (before example step)
    if (vp.width >= 1366) {
      await page.keyboard.press("d"); await page.click("#dHide");
      const b = await page.locator("#dNext").boundingBox();
      check(`${tag} discover controls visible without scrolling`, b && b.y + b.height <= vp.height, JSON.stringify(b));
      const fsz = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("dClue")).fontSize));
      check(`${tag} clue text >= 24px for projector`, fsz >= 24, "font-size=" + fsz);
      await page.keyboard.press("a");
      const ab = await page.locator("#aNext").boundingBox();
      check(`${tag} apply controls visible without scrolling`, ab && ab.y + ab.height <= vp.height, JSON.stringify(ab));
    }
    check(`${tag} no network / console errors`, !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  /* ---------- Reduced motion ---------- */
  {
    const { ctx, page } = await openApp(browser, { reducedMotion: "reduce" });
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".flame")).animationName);
    check("reduced motion disables lantern animation", anim === "none", anim);
    await ctx.close();
    const n = await openApp(browser);
    const anim2 = await n.page.evaluate(() => getComputedStyle(document.querySelector(".flame")).animationName);
    check("animation present when motion allowed", anim2 === "flicker", anim2);
    await n.ctx.close();
  }

  /* ---------- Worksheet: print A4 ---------- */
  {
    const { ctx, page, problems } = await openApp(browser, { url: SHEET, viewport: { width: 688, height: 1032 } });
    await page.emulateMedia({ media: "print" });
    // printable area: A4 210x297mm minus 14mm/12mm margins = 182 x 273mm = 688 x 1032 px (96 dpi)
    const sizes = await page.$$eval(".sheet", (els) => els.map((e) => ({ id: e.id, h: e.scrollHeight, w: e.scrollWidth })));
    check("worksheet has 3 sections (2 student + key)", sizes.length === 3 && sizes[2].id === "key");
    for (const s of sizes) check(`worksheet ${s.id} fits one A4 page (h=${s.h}px <= 1032)`, s.h <= 1032 && s.w <= 688, JSON.stringify(s));
    const pdfPath = path.join(ROOT, "worksheet.pdf");
    await page.pdf({ path: pdfPath, format: "A4", preferCSSPageSize: true, printBackground: true });
    const raw = fs.readFileSync(pdfPath, "latin1");
    const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
    check("worksheet.pdf has exactly 3 A4 pages", pages === 3, "pages=" + pages);
    await page.emulateMedia({ media: "screen" });
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.screenshot({ path: path.join(SHOTS, "worksheet-screen.png"), fullPage: true });
    check("worksheet: no network / console errors", !problems.external.length && !problems.errors.length, problems.external.concat(problems.errors).join(" "));
    await ctx.close();
  }

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify({ when: new Date().toISOString(), passed, failed: results.length - passed, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
