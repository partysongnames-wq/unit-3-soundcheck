# Prime Time: test report

**Date:** 2026-10-28<br>
**Branch:** `demos/prime-time-u5`<br>
**Runner:** `node demos/prime-time/tests/run-tests.js` (Playwright + headless Chromium, page loaded from `file://`)<br>
**Result:** **40 / 40 checks passed.** The raw output is in `tests/last-run.json`.

## What was checked

| Area | Check | Result |
|---|---|---|
| Spoilers | Start screen: no programme types, examples, Ex 2 words, quiz answers, adjectives or "A TV" in the DOM text or ARIA labels. "screen" and "episode" are excluded from this check only because the brief requires the title "Episode 1: Screen Time". | PASS |
| Spoilers | Start screen shows the title, "Episode 1: Screen Time" and Start only; the top bar is hidden; the teacher panel is hidden | PASS |
| Spoilers | Cold open: "A TV" not in the DOM until the final reveal | PASS |
| Spoilers | E1: none of the 15 genre words or examples in the DOM before each card's reveal (all 15 cards) | PASS |
| Spoilers | E2: word bank hidden; each of the 10 quiz cards has no gap word, verdict or fact before its reveal | PASS |
| Spoilers | E3: no adjective in the DOM before its chip is revealed | PASS |
| Spoilers | E4: clue and answer not in the DOM until revealed (all 18 rounds); plot-twist text hidden until revealed | PASS |
| Layout | No vertical or horizontal scroll, and no stage element clipped, on **every screen with every reveal shown** at 1366×768 (59 screens) and 1920×1080 (58 screens; the number of plot twists is random) | PASS |
| Layout | Phone 390×844: no sideways scroll, and Next is always on screen (40 screens) | PASS |
| Navigation | Every episode is reachable with keys 0–6 and with the chips | PASS |
| Keyboard | Typing "s3" in the timer input does not open the panel or switch episode; the timer can be edited; T starts and pauses it; S opens the panel and Esc closes it | PASS |
| Scores | E4: +1, undo, and two-press reset. E2: a correct team vote auto-scores +1 and Undo removes it | PASS |
| E3 | Reveal + move with keys 1/2/3 + "Check answers" → 12/12 marked correct; the number keys do not switch episode while a word is selected | PASS |
| E5 | The pair picker shows two different numbers from 1–40 and no names | PASS |
| Privacy | localStorage, sessionStorage and cookies are all empty after a full run | PASS |
| Console | No console errors or page errors (three desktop runs + phone run) | PASS |
| Network | No non-`file:`/`data:` requests. The adjectives-game link exists with `target="_blank"` and is never clicked. | PASS |
| Motion | With `prefers-reduced-motion: reduce`, the static overlay is off, animations are about 0 s, and the "Reduce motion" setting is pre-ticked | PASS |
| A11y | Every control is a real `<button>`, `<a>` or `<input>` with an accessible name; there are no click handlers on divs; keyboard focus shows a visible outline | PASS |
| A11y | Contrast ≥ 4.5:1 for the text colour tokens: ink 17.5, muted 8.4 (on panel), signal red 6.4, amber 12.5, true 11.7, false 7.1, dark-on-light buttons 17.5 / 12.5, active chip key 5.8 | PASS |
| Worksheet | `worksheet.pdf` has **3 pages** (A4) | PASS |
| Worksheet | `worksheet.html` has 3 A4 pages and nothing overflows a page; the student pages contain no answer facts; no network requests | PASS |

## Accessibility self-review

- **Buttons:** every clickable thing is a `<button>` or `<a>`. Hidden chips and tiles carry a visually hidden "Hidden word N" label, not the answer.
- **Labels:** icon buttons (timer, play/pause, gear, close) have `aria-label`. The timer input has a `<label>`. Each team's vote group is labelled.
- **Alt text:** the programme icons are `role="img"` with the deliberately neutral label "Clue icon", so a screen reader cannot spoil the answer. The cold-open TV picture is labelled "Old television set", and it only exists after the reveal.
- **Focus:** a 3 px amber `:focus-visible` outline on everything.
- **Motion:** each reveal effect lasts 0.4–1.1 s. Under `prefers-reduced-motion` (or the teacher-panel switch) all animation is cut to about 0 and the static flash is removed.
- **Live region:** the stage is `aria-live="polite"`.

## Known limits (honest notes)

- **Contrast is checked by token.** The test calculates ratios for the colour tokens and the pairs they are used in. It does not calculate the colour of every rendered pixel, such as text over the semi-transparent bars.
- **Font fallback.** The display face is Impact, with fallbacks. This container has no Impact, so the screenshots used a heavy system sans. On the school's Windows or Mac machines Impact will be used, and it is narrower, so the text fits more easily.
- **No sound test.** Sound was not tested audibly; it is off by default. The WebAudio code only runs after the teacher enables it.
- **Fact lines on TRUE cards.** On the TRUE quiz cards the "fact" line restates the sentence ("Only 11 years old. True.") rather than adding new facts. This follows the brief's "do not invent quiz facts". The FALSE facts are exactly as given in the brief.
- **Space on a focused button.** Space always means "next", even when a button has focus. Keyboard users press focused buttons with Enter.
- **Not tested.** The site was not tested on a real projector or with real students.
