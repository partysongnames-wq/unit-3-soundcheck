# Suksanari: AFTER HOURS — Night Crew

A real-time, Roblox-style classroom game for English review. Every student makes her own character, runs around a bright cartoon school on her phone, answers questions at glowing lockers for loot, and dodges silly zombies while her crew races to power up the school generator. The projector shows the whole school live, with every player on it.

- Students control their own character with a joystick and play at their own pace, so nobody waits for the class.
- An avatar creator with hair, colours, outfits (including a school uniform), ears, bows, glasses and crowns. There are also emotes (wave, dance, heart…).
- Lockers hold the questions. A correct answer gives loot: a fuse, a golden fuse, speed boots, a shield or a zombie zap. Every answer shows the **WHY**.
- Zombies are cute and silly, and getting tagged is playground tag, not elimination. A tagged player turns into a mini-zombie for 8 s, drops her fuses, and turns back by tagging someone from another crew.
- Four crews race. The projector shows a live leaderboard, a feed, surprise events and a double-points final minute. The game ends with a podium and a review of the toughest questions.
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

1. Open `host.html` on the projector laptop. Pick a question pack and a game length (5, 8, 10 or 12 minutes), then click **Create game**.
2. The lobby shows a QR code and a 5-letter code. Students join, make a character and can already run around the school.
3. Click **▶ Start**. There's a 3-2-1 countdown, then the game starts.
4. Controls:
   - **Pause** (or `P`) freezes everything and shows "Paused" on every phone.
   - **+1 min** adds time.
   - **End** goes to the results.
   - **Reset** goes back to the lobby with the same players.
   - You can also toggle music and sound effects and switch to full screen.
5. Results: a crew podium with dancing avatars, the class accuracy, and **the three toughest questions with their answers and WHY** for a quick class review. **Play again** returns to the lobby.

**Try a DEMO (bots)** starts a game with 14 bot players so you can see it before class. It is labelled DEMO on screen.

## How to play (students)

1. Scan the QR code, type a nickname (🎲 suggests one) and make your character.
2. Move with the joystick: touch anywhere on the lower part of the screen and drag. On a keyboard, use WASD or the arrow keys.
3. Walk up to a glowing **❓ locker** and tap **OPEN** (or press `E`). Answer the question.
   - Correct: you get loot, plus an extra fuse for every 3 correct answers in a row.
   - Wrong: you see the right answer and the WHY. The question comes back later so you can try again.
4. Carry fuses to the **GENERATOR** in the middle to score for your crew. You can carry up to 3.
5. If a zombie tags you, you drop your fuses (anyone can grab them). Tag a player from another crew to turn back. Shields block one tag. Every player is safe for 6 seconds at the start of the game and while answering a question.
6. Surprise events:
   - **Lights out**: the screen goes dark except around players.
   - **Zombie dance party**: the zombies stop chasing.
   - **Golden lockers**: loot is doubled.
   - **Fuse rain**: fuses drop around the school.
   - **Final minute**: every fuse is worth double.
7. At the end, each phone privately shows that student's own stats (correct answers, power delivered, best streak) and badges.

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

- **Projector:** `01-title`, `02-teacher-setup`, `03-teacher-lobby-qr`, `04-teacher-countdown`, `05-teacher-live-map`, `06-teacher-results-review`, `07-teacher-demo-busy`.
- **Phone:** `p00-title`, `p01-join`, `p02-avatar-creator`, `p03-lobby`, `p04-emote`, `p05-at-locker`, `p06-question`, `p07-correct-loot-why`, `p08-wrong-why`, `p09-playing`, `p10-results`, `p11-demo-crowd`.
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
public/host.html + js/host.js Projector: lobby/QR, live map, crew race, feed, podium + review
public/editor.html + js/editor.js  Question pack editor
public/js/vendor/qrcode.mjs   QR encoder (qrcode-generator 2.0.4, MIT, Kazuhiko Arase), vendored locally
```

Movement is predicted on the phone so it feels instant, and the server validates every position: no faster than the fastest speed, and no walking into walls. Zombies, lockers, loot, tags and scores are decided only by the server. The correct answer and explanation are sent only **after** the student answers, and only to her phone.

## Security, privacy and retention

- **No personal data:** no accounts, no real names and no chat. Students type a nickname, which is filtered for format and a short list of bad words.
- **Secret tokens:** the teacher gets a random 48-hex host token. Each player gets a random id and secret, kept on the phone so reconnects restore the same player. Tokens are checked in constant time and never appear in shared messages.
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
- There is no button to kick a player yet, so the teacher should watch the lobby list.
- In-memory only, so restarting the server ends the game.
- There's no public deployment, and none should be done without adding HTTPS, rate limiting and other hardening.
- The previous version (turn-based map voting) was replaced. It is still in the git history (commit `fb3a0d4`).

## Latest results

All results are from 2026-11-04, on a Linux container with Node 22.23 and headless Chromium. These are automated runs only.

| Suite | Result |
|---|---|
| `npm test` | **19 / 19 passed.** Covers: map connectivity; pack validation and spreadsheet import; avatar sanitising; 40 joins with the 41st rejected and crews of 10/10/10/10; nickname rules; same-identity reconnect; locker phase, distance, cooldown and single-use-code checks; answers hidden until answered; loot only for correct answers; missed questions re-queued; teleport and wall-walking corrected; zombie tag, fuse drop, shield, and pass-it-on tag (other crews only); fuse delivery and the double-points final minute; pause, +1 min, end and reset; no secrets or answers in shared messages; frozen pack copy; events firing; a full DEMO game reaching results. Also, over HTTP and WebSocket: host token required, bad credentials refused, the full locker → answer → WHY flow, forged and duplicate answers rejected, oversized frames closed, body limits, and path-traversal attempts refused |
| `node tests/sim.mjs 20` | **PASS.** A 2-minute game with 20 simulated clients. 2 joined late, and 3 dropped at 35 s and reconnected at 55 s with the same id and crew. 201 answers at 82% simulated accuracy. 0 position corrections, 0 server errors, 0 fatal errors. About 9.5 world updates per second per client. Open → question p95 1.4 ms, answer → result p95 1.0 ms. 20/20 clients got their private stats |
| `node tests/sim.mjs 40` | **PASS.** The same script with 40 clients. 346 answers at 80%. 0 corrections, 0 server errors. 9.7 updates per second per client, about 490 KB/s in total downstream (~12 KB/s per phone). Open → question p95 2.2 ms, answer → result p95 1.7 ms. 40/40 got their private stats |
| `node tests/browser.mjs` | **41 / 41 checks passed, 0 console or page errors**, in two consecutive runs. A third run failed before the test was fixed: Playwright would not click the bobbing OPEN button. The test now presses the E key and retries. Covered: no horizontal overflow at 1366×768 and 390×844 (title, setup, lobby, live game, results, join, avatar creator, question, editor); the editor still works; join → avatar creator → lobby; emote; start and countdown; walking to a locker with the keyboard; the OPEN prompt; correct answer → loot + WHY; wrong answer → correct answer + WHY with no loot; pause/resume shown on phones; a phone reload reconnecting as the same player; the podium and toughest-question review; personal stats on phones; play again; a DEMO game with moving scores |

The simulated players are scripts with simple behaviour and a fixed 80% accuracy. **They are not real students or real phones**, so classroom readiness is still unproven.

