# Story Lantern v2: test report

**Result: 472 / 472 checks passed** (exit code 0). The run was on 2026-10-27 in the cloud build container.

- **Setup:** headless Chromium (Playwright 1.63.0, preinstalled), Node 22.22.0, Linux.
- **How:** the tests drive the real page from `file://`.
- **Honesty:** no checks are stubbed. The first full run had failures. They were fixed in the app, or the test's measurement was corrected, as described below, and then everything was re-run.

## Reproduce

```bash
node demos/story-lantern/tests/run-tests.js
# writes tests/results.json, tests/screenshots/*.png and tests/out/worksheet-check.pdf (not committed)
```

Elsewhere: `npm i -D playwright && npx playwright install chromium`, then run the same command.

## Coverage (all PASS)

| Area | What is checked |
|---|---|
| Content | Exactly the 10 words. ≥1 Apply question per word, every option with a WHY. Covered: although/because, primarily = mainly, suitable = appropriate, belief = noun, magical = special powers (not just beauty), text = written words. No target word in any clue, hint, picture label, host line or twist card. 10 distinct pictures (≥8 drawable shapes each). 4 Create sets with teen scenarios (horror, K-pop, school, social media). No babyish praise lines. |
| No spoilers | Start screen: no target word in the visible text **or** in the stage markup. Teacher panel collapsed by default; S, the gear button and Esc work. For **each** of the 10 words: no unrevealed word visible or in the markup on the clue screen, nor after the hint. One flipped letter does not reveal the word. Tile letters enter the DOM only when flipped. The example is hidden until the meaning screen. Recap shows only the revealed words; locked cards hold no word and no length until "Reveal the rest". |
| Discover | Every word's reveal path: Space path (hint → reveal → meaning → talk → next) on 5 words; button path (Hint, Letter… until complete or W, Meaning, Talk, Next) on the other 5. Picture and tile count, tiles flip to the right letters, part of speech. Meaning screen has no clue; talk screen has no definition. ← keeps state. Simple help on and off. Last word → Apply. Subset of 3 words → "3 mystery words", deck of 3, Apply filtered. Shuffle is a real permutation; A–Z restores. |
| Twists | A card is drawn between words. The flip ran. The lantern is held while the card is open. X redraws a different card; Esc skips with no effect. Effects: Double (+2, then +1); Steal (+1 and 1 taken from the leader); Swap (top ⇄ bottom, Undo reverses it); Act / Whisper / Sentence badges with a 10 s button; teacher Clear. |
| Teams | Editable names shown on the tower; typing in name boxes triggers no shortcuts. Keys 1–4 and Shift+4, lantern click and −. The lantern climbs. Reset, then Undo restores. Undo steps back to empty (button disabled). |
| Timers (virtual clock) | Lantern: starts at 45 s; ≈35 s after 10 s; the flame shrinks; P pause/resume; urgent in the last 10 s; OUT at 0; reveal stops it; K skips it; seconds are editable. Lesson timer: 18:00 → 17:50, pause holds, editable minutes, expiry state (no sound by default), restart after expiry. |
| Apply | All 15 questions: no feedback before a choice. A wrong pick shows its WHY and does not spoil the answer. The correct pick shows "right" plus its WHY. Keys 1/2/3, clicks and Space are all used. ← keeps answers. Last question → Create. |
| Create / Recap / Reset | Model hidden by default; V and the button show it; a new set hides it; sets wrap both ways. Retry with nothing ticked warns. Retrying 2 words in Discover starts clean and clears the ticks. Retry in Apply shows only that word's questions, with no old feedback. Reset everything returns the round, scores, reveals, answers and timer to their defaults. |
| Keyboard | Q/D/A/C/R and the nav buttons. ? and Esc. Help and panel block other keys. Number and text boxes trigger no shortcuts. M toggles synth sound. Space starts the game. After a mouse click, Space still means "next step". F → fullscreen (Chromium entered fullscreen in this run). |
| Layout | **1366×768 and 1920×1080:** no page scroll (vertical or horizontal) and **nothing clipped inside the stage** on: start; every word's clue + hint (Simple help on, the worst case), revealed, meaning and talk screens; all 15 Apply questions with their longest WHY; all 4 Create sets with and without the model; recap with all words; the twist card fits. Sizes: clue text ≥34 px at 1366 (≥48 px at 1920) and tiles ≥64 px. **390×844 phone:** no horizontal overflow on any round; taps work for reveal, options, model and team +. Vertical scrolling is allowed on phones. |
| Motion | Reduced motion: the host flame is still, the picture appears complete, there are no particles, tile flips take 0 s and the twist card shows at once. Motion allowed: the flame flickers, the picture draws itself with a stroke animation, a burst plays on reveal and clears itself within about 1 s. |
| Offline / errors | Zero non-`file://` requests and zero console errors or warnings across **every** browser context, including the worksheet. |
| Worksheet | Unchanged. Each of its 3 sections fits the A4 printable area. A fresh Chromium print gives 3 pages, and the committed `worksheet.pdf` has 3 pages. |

The screenshots were also reviewed by eye: 1366 and 1920 clue/meaning/twist/apply/recap, and 390 phone. Text is large and readable, and nothing overlaps.

## Fixes made during testing

- The team tower overflowed horizontally at 1366. It was made wider and the default names were shortened.
- The stage-markup check flagged the CSS class `clue-text`, which contains the word "text". The class was renamed. The markup check now ignores tag names (the SVG `<text>` element) but still checks text and attribute values.
- The layout check now waits 0.42 s for the 0.35 s screen-enter slide. During the slide, the 10 px transform briefly counted as overflow.

## Limitations

- Only Chromium was tested. Firefox, Safari, a real projector and a modest school laptop were not, so smoothness on slow hardware has not been measured.
- The display font falls back to system fonts. Impact is used on Windows; the Linux test box used a sans fallback. Layout was verified with the fallback only.
- Sound is synthesized with WebAudio and is off by default. Only the toggle was tested; nobody listened to the audio.
- Twist draws and host lines use `Math.random`, so the tests force specific cards where needed.
- Not tried with a real class of 39–40 students. Timing and difficulty are unverified.
