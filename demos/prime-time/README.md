# Prime Time: Episode 1, "Screen Time"

This is a projector lesson site for **Gateway to the World B1, Unit 5 (p58)**. It is for Thai M2 classes of 39–40 students in a 50-minute period, and the teacher sets the pace. The site looks like a late-night TV channel: dark screens, an ON AIR light, channel-switch static and title cards.

Open `index.html` in Chrome or Edge. It works offline and straight from `file://`. It uses no CDN, no web fonts and no network requests. Sound is **off** by default and can be turned on in the teacher panel.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The site |
| `data.js` | All the lesson content (textbook words, quiz sentences, answers). It is kept out of the HTML so no answer text is in the page before you reveal it. |
| `worksheet.html` / `worksheet.pdf` | 2 A4 student pages (Ex 1 match, Ex 3 sort, Ex 2 gap-fill + T/F, Ex 5 writing frame) + 1 answer-key page. Black-and-white friendly. |
| `tests/run-tests.js` | Playwright/Chromium checks: `node demos/prime-time/tests/run-tests.js` |
| `TEST-REPORT.md` | Latest test results |

## Keys

| Key | Action |
|---|---|
| **Space** / **→** | Next reveal; when nothing is left to reveal, next screen |
| **←** | Previous screen (it reopens unrevealed, so nothing is spoiled) |
| **0–6** | Jump to episode E0–E6 (the episode chips in the top bar do the same) |
| **1 / 2 / 3** | E3 only: with a word selected, move it to Positive / Negative / Both |
| **T** | Start / pause the big timer (click the time to type new minutes, e.g. `4` or `3:30`) |
| **F** | Fullscreen |
| **S** (or gear) | Teacher panel: sound, reduce motion, class size for the pair picker, reset scores/poll |
| **Esc** | Close the teacher panel |

Shortcuts never fire while you are typing in an input. Space always means "next", even when a button has focus. To press a focused button from the keyboard, use Enter.

## 50-minute running order

The top-bar timer resets to each episode's time when you enter it. It doesn't start until you press **T**.

| Ep | Min | Clock | What happens |
|---|---|---|---|
| E0 Cold open | 5 | 0–5 | The textbook warmer appears line by line on a vintage TV → "What is it?" → static clears to the answer. Then "What's in YOUR bedroom?" with a hands-up poll of hours of screen time yesterday (0–1 / 2–3 / 4–5 / 6+). You tap the counts; no names. |
| E1 Guess the genre | 10 | 5–15 | Ex 1: 15 "on tonight" listings, each with an icon that draws itself. Students shout the genre → Space: the word, with a channel-switch effect → Space: a real example. Then the "How often…? every day / sometimes / never" speaking screen and the note that *the news* takes **is**. |
| E2 True or false? | 7 | 15–22 | Ex 2a word bank (hidden, revealed one at a time or with "Reveal all"), then 10 cards: gap → Space fills it → Space starts a 5 s team vote (tap TRUE/FALSE for each team) → Space shows the verdict and fact. Teams that voted right get +1 automatically (Undo is available). |
| E3 Positive / negative | 8 | 22–30 | Ex 3: 12 hidden chips. Click one (or press Space) to reveal it; the class shouts the column; click the column or press 1/2/3 to move it. "Check answers" marks each chip right or wrong. |
| E4 Binge or Skip? | 10 | 30–40 | 4 teams (CH 1–4). Rounds review the Ex 1 and Ex 2 words: the clue comes through the static, with a 10 s countdown. Space reveals the answer; tap +1 for a team; Undo / Reset (press twice). A "Plot twist" card (double points / steal / skip) appears every 3–5 rounds. There is also a button to open the separate adjectives game (screen-time-word-game.pages.dev) in a new tab. |
| E5 Pair talk | 8 | 40–48 | Ex 4–5 models from the book, then sentence frames, a 3-minute timer (Space starts it) and "Pair on the mic", which picks two numbers from 1–40 with no repeats. |
| E6 Exit ticket | 2 | 48–50 | "My favourite programme is ___. It's a ___ and it's ___ because ___." 2-minute countdown (Space starts it). |

## Privacy

- The site saves nothing: no localStorage, no cookies, no names.
- Team scores, poll counts and used pair numbers live only in the open tab and disappear on reload.
- The only external link is the adjectives game button, and it opens only when clicked.
