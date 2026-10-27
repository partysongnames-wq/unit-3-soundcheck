# Story Lantern v2: mystery-word game show (Year 8 / M2)

A teacher-run projector game for ten words on the theme *Stories and Storytellers*. It has a dark, candlelit game-show look built for teenagers. There is no cartoon mascot and no babyish praise.

The game works offline from `file://`, with no CDN, network, accounts, storage or student data. Reloading the page starts fresh. Clues, sentences and line art are all original.

The projected screens never show a target word before it is revealed. The word list lives in a hidden **teacher panel**.

## 30-second teacher setup

1. Double-click `index.html` (Chrome/Edge/Firefox). Press **F** for fullscreen. If the browser blocks it, use F11.
2. The start screen shows only the title, "10 mystery words", four team names (click to edit) and **START**.
3. Optional: press **S** (or ⚙) to open the teacher panel, which is hidden by default. **It shows the answers, so close it before projecting.** In it you can:
   - tick today's words, shuffle the order or reset it to A–Z
   - set the lesson timer and the lantern seconds per word, or turn the lantern off
   - set how often plot twists appear
   - turn on Simple English help
   - turn on sound (synth only, off by default)
   - reset everything
4. Press **Space** to start.

## How a word plays (one idea per screen)

1. **Clue screen.** The line-art picture draws itself in (about 7 s) beside one big clue, with face-down letter tiles. The burning lantern counts down, 45 s by default. The flame shrinks, and in the last 10 s it turns red and shakes. **P** pauses it and **K** skips it.
2. **Space** shows a hint. **Space** again (or **W**) flips every tile, game-show style, with a burst. **L** flips one letter at a time.
3. **Space** opens the meaning screen: the word, part of speech, definition and example.
4. **Space** opens the talk screen: a pair-talk prompt plus a "Level up" challenge.
5. **Space** moves to the next word. By default, a **plot-twist card** flips in after every 2nd word:
   - Double points
   - Steal a point
   - Act it out
   - Whisper chain
   - Sentence in 10 seconds
   - Swap! (rare)

   **Space** accepts the card, **X** redraws it and **Esc** skips it.

The host is a lantern spirit with eyes. It reacts with short, dry one-liners such as "Bold choice. Wrong, but bold." None of its lines contain a target word.

**Team race.** Four lanterns climb a tower, and the leader's lantern flickers.
- Score with **1–4** (Discover and Create), **Shift+1–4** (any round), or by clicking a lantern or its **+**.
- **−** removes a point. **U** or **Undo** steps back, even through a Reset or a Swap.
- Only team totals exist. There are no individual student records.

## Rounds

- **Apply** has 15 context questions with 2–3 options each.
  - Choose with **1/2/3** or a click. A wrong pick shows why it is wrong without spoiling the answer. **Space** shows the answer.
  - Covered points: *although* vs *because* (×3), *primarily* = mainly, *suitable* = appropriate, *belief* is a noun (vs *believe*), *magical* = magic or special powers (not just beauty), *text* = written words.
- **Create**: pairs write a short funny story using 3–4 words.
  - The four scenarios are teen-relevant: a horror-film sleepover, a K-pop group chat, school drama and social media.
  - The model story stays hidden until you press **V**.
- **Recap** shows only the words already revealed. The others stay **LOCKED** (the word length is not shown either) until you press **Reveal the rest (end of lesson)**.
  - Tick the hard words, then retry them in Discover (starts clean) or Apply (only their questions).

## Keys

| Key | Action |
|---|---|
| Space | Next step (clue → hint → word → meaning → talk → next). Apply: show answer. Create: show/hide model |
| → / ←, PageDown / PageUp | Next / previous word, question or story set |
| H · L · W · E | Hint · one letter · whole word · meaning screen |
| 1–4 | Discover/Create: point to team. Apply: option 1–3 |
| Shift + 1–4 · U | Point to team (any round) · undo |
| P · K | Pause/resume lantern · skip lantern |
| V | Create: model story |
| Q D A C R | Start, Discover, Apply, Create, Recap |
| T · M · F · S · ? | Lesson timer · sound · fullscreen · teacher panel · help |
| X · Esc | Redraw twist · close / skip |

Shortcuts are ignored while typing in a box, and while the help or the teacher panel is open.

**Reduced motion.** With *prefers-reduced-motion* the game uses a calm fallback:
- the picture appears complete
- the tiles change without flipping
- there are no particles or flicker
- the twist card shows at once

## Files

- `index.html`, `style.css`, `app.js`: the game
- `data.js`: words, clues, art, questions, stories, twist cards and host lines (edit content here)
- `worksheet.html`, `worksheet.pdf`: unchanged A4 worksheet (2 student pages + 1 answer-key page)
- `tests/run-tests.js`: Playwright/Chromium tests
- `tests/results.json`: the last test results
- `TEST-REPORT.md`: what was tested and what was not
