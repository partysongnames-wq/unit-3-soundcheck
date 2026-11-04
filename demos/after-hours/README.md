# Suksanari: AFTER HOURS — Night Crew

A real-time, Roblox-style classroom game for English review. Every student makes her own character, runs around a bright cartoon school on her phone, answers questions at glowing lockers for loot, and dodges silly zombies while her crew races to power up the school generator. The projector shows the whole school live, with every player on it.

- Students control their own character with a joystick and play at their own pace, so nobody waits for the class.
- An avatar creator with hair, colours, outfits (including a school uniform), ears, bows, glasses and crowns. There are also emotes (wave, dance, heart…).
- Lockers hold the questions. A correct answer gives loot: a fuse, a golden fuse, speed boots, a shield or a zombie zap. Every answer shows the **WHY**.
- Zombies are cute and silly, and getting tagged is playground tag, not elimination. A tagged player turns into a mini-zombie for 8 s, drops her fuses, and turns back by tagging someone from another crew.
- **Solo or teams:** play solo (everyone for herself) or in 2, 3 or 4 crews. The projector shows a live leaderboard, a feed, surprise events and a double-points final minute. The game ends with a podium and a review of the toughest questions.
- **Timer or goal:** the game runs on a timer (5–12 minutes), or ends early when someone reaches a goal score (20, 30, 50 or 80).
- **Answering keeps you going:** a ⚡ power meter drains while you explore and refills when you answer. If it runs out, your character gets sleepy and slow.
- **Helpers:** 🧭 auto-walk takes a student to the nearest locker (or the generator), and a private 📋 teacher phone view shows who is and isn't answering.
- **Dusk look:** a soft evening tint with glowing lamp posts and a glowing generator, so it feels like "after hours" while staying bright.
- Runs on one laptop on the classroom Wi-Fi. There are no accounts, no real names, no chat and no internet services. All artwork is original and drawn in code; there are no image files and no emblems.

> **Status:** tested with automated clients and headless Chromium only, not yet with a real class on real phones. See [Limitations](#limitations-and-open-issues).

## Install and start

You need Node.js 18 or newer for the game. The automated tests need Node 22 or newer. There are no npm dependencies.

```bash
cd demos/after-hours
npm start
```

The server prints the teacher URL (`http://localhost:8787/host.html`) and the address phones should use (`http://<laptop-ip>:8787/play.html`).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` makes it reachable on the LAN) |
| `JOIN_BASE_URL` | first LAN IP found | The address the join QR code uses |

### Network caveats

- Phones must be on the **same network** as the laptop. On a phone, `localhost` means the phone itself, so it never works.
- Many school or guest Wi-Fi networks block devices from talking to each other ("client isolation"). If phones can't load the page, try a staff network or a hotspot. The laptop firewall must also allow Node on port 8787.
- This is a LAN server only. It is **not** reachable from the internet and has not been deployed anywhere.

## Running a game (teacher)

1. Open `host.html` on the projector laptop.
   - Pick a question pack, **Teams** (Solo, 2, 3 or 4 crews), **Game length** (5, 6, 8, 10 or 12 minutes) and an optional **Goal** ("first to 20/30/50/80").
   - Click **Create game**. There are also **Teacher tips** on the setup screen.
2. The lobby shows a QR code and a 5-letter code. Students join, make a character and can already run around the school.
   - You can change the team mode in the lobby once you see how many joined. The lobby also suggests one, for example Solo for under 6 players or 2 crews for 6–11.
3. Click **▶ Start**. There's a 3-2-1 countdown, then the game starts. **Start pulls everyone into the game**, including students still designing their character; they can change their look after the game.
4. Controls:
   - **Pause** (or `P`) freezes everything and shows "Paused" on every phone.
   - **+1 min** adds time.
   - **End** goes to the results.
   - **Reset** goes back to the lobby with the same players.
   - **❓** shows a how-to-play card.
   - **📋** shows a QR code for the private teacher phone view. **Blank or freeze the projector first**, then scan it with *your* phone.
   - You can also toggle music and sound effects and switch to full screen.

### Suggested lesson flow

- Before the lesson, test the laptop and 2–3 phones on the school Wi-Fi.
- In class:
  1. Join and design characters (about 2 minutes).
  2. A **5-minute** first game.
  3. The question review.
  4. A **6–8 minute** second game.
- **Pairs** (one phone per two students) also work well. That means half the phones and less Wi-Fi load; one steers, the other reads and answers.

### Teacher phone view (`teacher.html`)

- It is **read-only**: it uses a separate view token that can't start, pause or end the game.
- It lists every nickname with:
  - how many questions she has answered and how many were correct
  - how long since her last answer (highlighted after 60 seconds)
  - what she's doing right now (exploring, answering, zombie, sleepy, offline)
- It also shows accuracy for each question, and refreshes every 3 seconds.
- The projector only ever shows a count ("3 players haven't answered in the last minute"), never names.
5. Results: a crew podium with dancing avatars, the class accuracy, and **the three toughest questions with their answers and WHY** for a quick class review. **Play again** returns to the lobby.

**Try a DEMO (bots)** starts a game with 14 bot players so you can see it before class. It is labelled DEMO on screen.

## How to play (students)

1. Scan the QR code, type a nickname (🎲 suggests one) and make your character.
2. Move with the joystick: touch anywhere on the lower part of the screen and drag. On a keyboard, use WASD or the arrow keys. **🧭** walks you to the nearest locker automatically, or to the generator when you're carrying fuses.
3. Walk up to a glowing **❓ locker** and tap **OPEN** (or press `E`). Answer the question.
   - Correct: you get loot, plus an extra fuse for every 3 correct answers in a row.
   - Wrong: you see the right answer and the WHY. The question comes back later so you can try again.
4. Carry fuses to the **GENERATOR** in the middle to score for your crew (or for yourself in Solo). You can carry up to 3.
5. Keep your **⚡ power meter** up. It drains in about 75 seconds of exploring. A correct answer adds 45 and any answer adds at least 25. When it's empty you're sleepy and slow until you answer.
6. If a zombie tags you, you drop your fuses (anyone can grab them). Tag a player from another crew to turn back. Shields block one tag. Every player is safe for 6 seconds at the start of the game and while answering a question.
7. Surprise events:
   - **Lights out**: the screen goes dark except around players.
   - **Zombie dance party**: the zombies stop chasing.
   - **Golden lockers**: loot is doubled.
   - **Fuse rain**: fuses drop around the school.
   - **Final minute**: every fuse is worth double.
8. At the end, each phone privately shows that student's own **accuracy %**, stats, badges and (in Solo) her own place. The projector shows only the top 5 in Solo.

### Learning design

- Questions are only answered at lockers, and only correct answers give loot. Accuracy is what powers your crew.
- Each student gets the questions in her own shuffled order. Missed questions come back after a few others for spaced retry.
- Each student sees the WHY privately right after answering. The teacher screen shows live answer counts, class accuracy and the toughest questions so far.
- The projector names students only for positive events ("Mochi powered up +3 for Crew Comet!"). It never names anyone for a wrong answer or a tag.
- Trade-off: because everyone plays at her own pace, faster players answer more questions. Crews are kept balanced in size (±1).

## Question packs and the editor

The pack editor (`editor.html`) carried over from the first version:
- Create, duplicate, rename, delete, reorder and preview packs and questions. Each question has four options, the correct answer, an explanation, and an optional original passage and small picture.
- Packs are saved automatically in the browser's localStorage.
- Packs can be imported and exported as JSON (validated), pasted from a spreadsheet, and printed as an A4 sheet with an answer key.

Spreadsheet paste format, tab-separated, one question per row. A header row starting with `Question` is skipped:

```
Question | Option A | Option B | Option C | Option D | Correct (A–D or 1–4) | Explanation | Passage (optional)
```

Each game keeps a frozen copy of its pack, so editing never changes a game that is running.

**Starter content:**
- **Old Tales, New Readers (Unit 8A practice)**: 12 original, editable practice questions inspired by the topic of Reading Explorer 1 Unit 8A (The Brothers Grimm). They are not textbook questions. They cover the taught vocabulary (publish, collect, suitable, scary, primarily, text, add, belief, magical, although), evidence and inference. Correct answers are 3 each for A, B, C and D.
- **Past Simple (generic demo)**: 6 questions.

## Tests (actual commands)

```bash
cd demos/after-hours
npm test                  # engine + HTTP/WebSocket tests
node tests/sim.mjs 20     # SIMULATED 20-player game over WebSockets (2 game-minutes)
node tests/sim.mjs 40     # SIMULATED 40-player game
node tests/browser.mjs    # headless Chromium: projector 1366×768 + phones 390×844 + editor; writes screenshots/
```

`tests/browser.mjs` needs Playwright and Chromium. In this build environment they were already installed. Elsewhere, run `npm i -D playwright && npx playwright install chromium`.

**"Simulated" means automated scripts, not real student phones.**

### Results from this build (2026-11-04, Linux container, Node 22, headless Chromium)

See [Latest results](#latest-results) at the bottom.

### Screenshots (`screenshots/`, generated by `tests/browser.mjs`)

- **Projector:** `01-title`, `02-teacher-setup`, `03-teacher-lobby-qr`, `03b-teacher-how-to`, `04-teacher-countdown`, `05-teacher-live-map`, `06-teacher-results-review`, `07-teacher-demo-busy`, `08-teacher-solo-results`.
- **Phone:** `p00-title`, `p01-join`, `p02-avatar-creator`, `p03-lobby`, `p04-emote`, `p05-at-locker`, `p06-question`, `p07-correct-loot-why`, `p08-wrong-why`, `p09-playing`, `p10-results`, `p11-demo-crowd`, `p12-solo-results`.
- **Teacher phone:** `t01-teacher-phone`.
- **Editor:** `e01-editor`.

## Architecture

```
server.mjs                    HTTP (static, JSON API) + WebSocket upgrade; 20 Hz simulation tick, 10 Hz world snapshots
src/ws.mjs                    Minimal RFC 6455 WebSocket server (text frames, 16 KB frame limit, ping/timeout)
src/game.mjs                  Authoritative engine: players, lockers/questions, loot, zombies, tag, fuses, events, results, DEMO bots
public/js/shared/world.js     School map, collision, path-finding (shared by server and clients)
public/js/shared/avatar.js    Avatar options + validation; emotes
public/js/shared/botbrain.js  Simple player AI used by DEMO bots, attract mode and simulations
public/js/shared/packs.js     Pack schema, validation, spreadsheet import, starter packs
public/js/art.js              All artwork (tiles, furniture, avatars, zombies, items)
public/js/render.js           Camera, cached map chunks, interpolation, effects, event overlays
public/play.html + js/play.js Phone: join, avatar creator, joystick, lockers, loot, emotes, results
public/host.html + js/host.js Projector: lobby/QR + mode switch, live map, leaderboard, feed, podium + review
public/teacher.html + js/teacher.js  Private read-only teacher phone view
public/editor.html + js/editor.js  Question pack editor
public/js/vendor/qrcode.mjs   QR encoder (qrcode-generator 2.0.4, MIT, Kazuhiko Arase), vendored locally
```

Movement is predicted on the phone so it feels instant, and the server validates every position: no faster than the fastest speed, and no walking into walls. Zombies, lockers, loot, tags and scores are decided only by the server. The correct answer and explanation are sent only **after** the student answers, and only to her phone.

## Security, privacy and retention

- **No personal data:** no accounts, no real names and no chat. Students type a nickname, which is filtered for format and a short list of bad words.
- **Secret tokens:** the teacher gets a random 48-hex host token and a separate read-only view token for the teacher phone page. Each player gets a random id and secret, kept on the phone so reconnects restore the same player. Tokens are checked in constant time and never appear in shared messages.
- **Questions:** each locker question carries a single-use code tied to one player, so stale or forged answers are rejected.
- **Limits:**
  - HTTP bodies: 4 KB, or 3.2 MB when sending a pack.
  - WebSocket frames: 16 KB.
  - Each connection is rate-limited.
  - 40 players per game, 60 connections per game, 12 games per server.
- **Static files** come only from `public/`, with no `..`, no dotfiles and an allow-list of file types. Pages send a CSP and nosniff headers, and all user text is rendered as text.
- **Memory only:** game state is never written to disk. Idle games expire after 3 hours. Packs live in the teacher browser's localStorage.
- **Plain HTTP/WS on the LAN, without TLS:** use a trusted classroom network.

## Limitations and open issues

- **Not tested with real students or real phones** (iOS Safari, Android Chrome), and not on school Wi-Fi. Run a 5-minute trial with a few phones first.
- **Balance** (zombie count and speed, loot odds, event timing) was tuned with bots and may need adjusting after a real class.
- On the projector, 40 name tags can overlap where many players crowd together.
- The 📋 teacher QR appears on the laptop screen, so blank or freeze the projector before you show it. If a student scans it anyway, she can only *see* the list, not control the game.
- The school map is a generic cartoon school. Real Suksanari landmarks (statue, gate, buildings) can be added once there are photos or descriptions.
- There is no button to kick a player yet, so the teacher should watch the lobby list.
- In-memory only, so restarting the server ends the game.
- There's no public deployment, and none should be done without adding HTTPS, rate limiting and other hardening.
- The previous version (turn-based map voting) was replaced. It is still in the git history (commit `fb3a0d4`).

## Latest results

All results are from 2026-11-04, on a Linux container with Node 22.23 and headless Chromium. These are automated runs only.

| Suite | Result |
|---|---|
| `npm test` | **24 / 24 passed.** Covers everything from the previous version, plus: solo scoring; 2- and 3-crew assignment; switching mode in the lobby with rebalancing (and refused mid-game); invalid settings falling back to defaults; solo tag hitting anyone; the solo podium; goal mode ending the game; the power meter draining, pausing while answering, refilling on answers and making players sleepy/slow; the teacher view listing who isn't answering while projector stats stay nameless; the read-only view token unable to control the game |
| `node tests/sim.mjs 20` | **PASS.** A 2-minute game with 20 simulated WebSocket clients, 2 late joiners, and 3 that dropped and reconnected as the same player. 177 answers at 85%. 0 server errors, 0 position corrections. Open → question p95 1.7 ms. 20/20 got their private stats |
| `node tests/sim.mjs 40` | **PASS.** 40 clients, 364 answers at 79%. 0 server errors. 3 position corrections out of thousands of moves, expected when a simulated client keeps moving just as a locker opens. About 590 KB/s in total downstream (~15 KB/s per phone). Open → question p95 2.1 ms. 40/40 got their private stats |
| `node tests/browser.mjs` | **50 / 50 checks passed, 0 console or page errors.** One earlier run failed on a real bug: the phone tried to vibrate before the student had tapped the screen. That's fixed, and vibration now waits for a first tap. New checks: the lobby suggests a mode for 2 players; switching to 2 crews in the lobby; the how-to card; **Start pulling a still-designing phone into the game**; the power meter showing; **🧭 auto-walk reaching a locker**; the **teacher phone page** listing nicknames and answers; a Solo DEMO showing a top-5 leaderboard and a player podium. Plus all the earlier checks (no overflow at 1366×768 and 390×844, editor, locker → loot + WHY, wrong → WHY, pause, reconnect, results) |

Simulated players are scripts, **not real students or phones**. Classroom readiness is still unproven until a real-phone trial on the school Wi-Fi.
