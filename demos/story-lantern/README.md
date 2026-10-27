# Story Lantern — vocabulary demo (Year 8 / M2)

A teacher-operated, projector-first vocabulary game for ten words on the theme *Stories and Storytellers*:
**add, although, belief, collect, magical, primarily, publish, scary, suitable, text**.
All clues, pictures (inline SVG) and sentences are original. It is a static site: no internet, accounts, backend, tracking or audio. Nothing is saved; reloading the page starts fresh.

## 30-second teacher setup

1. Open `index.html` by double-clicking it (it works straight from the folder, Chrome/Edge/Firefox).
2. Press **F** for fullscreen. If the browser blocks it, press **F11** (Windows) or **Ctrl+Cmd+F** (Mac).
3. On **Start**: tick the words for today, press **Shuffle order** if you want, and set the timer minutes (default 18).
4. Optional: press **B** to show team scores (2–8 teams) and **T** to start the timer.
5. Press **Start Discover →**, then use **Space** to reveal and **→** for the next word.

Print `worksheet.pdf` (or open `worksheet.html` → **Print / Save as PDF**, A4, scale 100%, margins "Default"). Pages 1–2 are for students; page 3 is the answer key. Print it separately.

## Key controls

| Key | Action |
|---|---|
| → / PageDown, ← / PageUp | Next / previous word, question or word set |
| Space | Discover: next reveal step (hint → first letter → word → example + talk). Apply: show answer |
| H, L, W, E | Discover: hint, one more letter, whole word, example + talk |
| 1, 2, 3 | Apply: choose option A, B, C |
| Q, D, A, C, R | Jump to Start, Discover, Apply, Create, Recap (skip rounds freely) |
| T | Start / pause timer (Reset button beside it) |
| B | Show / hide team scores (+1, −1, Undo, Reset) |
| F | Fullscreen |
| ? / Esc | Keyboard help |

Shortcuts are switched off while the cursor is in a text or number box, and while the help box is open.

## Learning flow (15–20 minutes)

1. **Start (1 min)** — setup, word list, choose a subset, shuffle.
2. **Discover (6–7 min)** — each word starts with a picture and a meaning clue only; the word is never shown until you reveal it. Pairs guess aloud. Reveal a hint, letters one by one, or the whole word, then an example sentence and a pair-speaking prompt, plus a challenge prompt for stronger students.
3. **Apply (5 min)** — 15 two- or three-option context questions (at least one per word, three for *although* vs *because*). Teams say A/B/C; the feedback explains **why** each option is right or wrong. A wrong pick does not show the correct answer, so teams can try again.
4. **Create (4–5 min)** — pairs build a short funny story with 3–4 given words, using a story frame. Challenge: all four words, speech and a surprise ending. Show a model story only if you choose to.
5. **Recap (2 min)** — all ten words with short definitions. Tick the hard ones and retry them in Discover or Apply. The retry starts clean. **Reset everything** clears all reveals, answers, scores and the timer.

**Simple help** (top bar) adds simple-English meanings to hints, sentence starters in Discover and an easier task in Create. Thai translations were left out on purpose, because no one has checked them yet.

## Files

- `index.html`, `style.css`, `app.js`, `data.js`: the game (edit words, clues and questions in `data.js`)
- `worksheet.html`, `worksheet.pdf`: A4 worksheet, 2 student pages + 1 answer-key page
- `tests/run-tests.js`: browser test (Playwright + Chromium); `tests/results.json`: last results
- `TEST-REPORT.md`: what was tested, the commands, and the limits
