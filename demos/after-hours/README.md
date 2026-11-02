# Suksanari: AFTER HOURS

A crew-based English review mission played on a classroom projector and students' phones.
The school's power has failed after hours. Four crews answer reading/vocabulary questions to earn
power cells, then vote on what to do on an animated night-time campus map. They move between
buildings, search for fuses, barricade paths and rescue cornered crews. The goal is to restore
the generator and reach the front gate by dawn.

- 1 complete mission: 12 questions in the starter pack, about 10–15 minutes.
- Teacher projector (1366×768) plus individual phones (390×844 and up). Usually 20 students, maximum 40.
- No accounts, no student names, no internet services. It runs on one laptop on the classroom Wi-Fi.
- The campus is fictional, and all artwork is drawn in code (Canvas/SVG/CSS). There are no emblems and no external images or fonts.
- Non-gory. There are no jump scares, no elimination and no individual wrong answers on screen.

> **Status:** this is a working build that has been tested with automated clients and headless browsers only.
> It has **not** been used with a real class or real student phones. See [Limitations](#limitations-and-open-issues).

---

## Install and start

You need Node.js 18 or newer. The game has no npm dependencies.

```bash
cd demos/after-hours
npm start            # same as: node server.mjs
```

The server prints its addresses:

```
Teacher (this computer): http://localhost:8787/host.html
Pack editor:            http://localhost:8787/editor.html
Phones on the same Wi-Fi may use: http://192.168.1.23:8787/play.html
```

Environment options:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address. `0.0.0.0` makes it reachable on the LAN; use `127.0.0.1` for solo testing |
| `JOIN_BASE_URL` | first detected LAN IP | The address put into the join QR code, e.g. `http://192.168.1.23:8787` |

### LAN caveats (please read)

- Phones must be on the **same network** as the teacher laptop. `localhost` on a phone means the phone itself, so it will never work.
- The teacher setup screen shows the detected LAN address. You can edit the "Join address" field before you create a room, and the QR code uses that address.
- Many school or guest Wi-Fi networks use **client isolation**, which stops devices from reaching each other. If phones cannot load the join page, try a staff network, or a hotspot from the teacher laptop or a phone. Your laptop firewall may also need to allow Node on port 8787.
- This is a local LAN server. **It is not reachable from the internet**, and nothing here deploys it publicly.

## Running a mission (teacher)

1. Open `http://localhost:8787/host.html` on the projector laptop.
2. Choose a question pack, the answer time (default 40 s) and the vote time (default 20 s). If you tick *Auto-advance*, the game moves on from the reveal and map screens by itself.
3. Click **Create classroom room**. The lobby shows a QR code, a 5-letter room code and the join URL.
4. Students scan the code, type a **callsign** (the 🎲 button suggests one, for example "Quiet Fox 42"), and are placed automatically into four balanced crews.
5. Click **Start mission**.

Teacher controls are the buttons at the bottom of the screen. Keyboard shortcuts work too:

| Control | Key | What it does |
|---|---|---|
| Start mission | `N` | Lobby → first question |
| Reveal | `R` | Closes answers now and shows the correct answer + WHY |
| Next | `N` / `→` | Moves on one step: question → reveal → crew vote → map update → next question … → extraction → debrief |
| Pause / Resume | `P` | Freezes timers, blocks answers and votes, and shows PAUSED on every phone |
| End mission | — | Goes straight to the dawn extraction and the debrief |
| Reset | — | Back to the lobby with the same players and crews. Mission progress is cleared |
| Sound | — | A quiet synthesised ambience, **off** by default |

If the laptop browser reloads, the setup screen offers **Resume room**. The teacher token is kept in that browser's localStorage.

**DEMO room (simulated crew)** starts a room with 12 bots named `DEMO-01…12`. The room is labelled DEMO everywhere. Use it to preview the game. It is not a substitute for testing with real phones.

## Rules (under a minute)

1. Answer each question on your phone.
2. The big screen shows the answer and **WHY**. Each crew earns **power cells ⚡** from its **percentage correct**: 0–24% → 0, 25–74% → 1, 75–100% → 2. Speed does not matter, and a small crew is not disadvantaged.
3. Your crew votes on an action. The most votes wins. If there is a tie or nobody votes, the safer listed option is used, and holding position is the default.
   - **Move** to a neighbouring building (1⚡).
   - **Search** a building for a fuse (2⚡). Fuses glow on the map.
   - **Barricade** the path a horde will use (1⚡). It lasts 3 rounds.
   - **Rescue** a cornered crew next to you (2⚡).
   - **Hold** (free).
4. Carry fuses to the **Generator**. When enough fuses are installed, the lights come on and the **front gate unlocks**.
5. Hordes shuffle toward the nearest crew. A crew they reach is **cornered**: it drops 1⚡ and can only push back (1⚡) or wait for a rescue. Hordes always give up within 2 rounds, so nobody is ever stuck or eliminated.
6. At dawn, after the last question, the rescue bus arrives:
   - **Full extraction**: every crew is at the gate.
   - **Gate**: the power is on, but some crews are still inside.
   - **Long way out**: the power stayed off and the dawn patrol helps everyone over the fence.

   There are up to three stars: power restored, all crews at the gate, and class accuracy of 70% or more.

### How the learning loop is protected

- Students cannot see the correct answer or the explanation before the reveal. The server never sends them earlier.
- Each answer locks on the first tap. A second, different answer is rejected, so nobody is scored twice.
- Players who join during a question may answer it. A player who disconnects without answering is left out of their crew's percentage. A connected player who does not answer counts as not correct.
- The projector shows only class and crew totals. No one's wrong answer is ever named. Each phone privately sees its own result.

## Students (phones)

- Open the QR link, or go to `http://<teacher-ip>:8787/play.html` and type the room code.
- The phone remembers its identity in localStorage. A reload, a dropped Wi-Fi connection or a locked screen all reconnect to the **same callsign and crew**.
- While a phone is offline it shows "Reconnecting…" and retries with backoff.

### Waiting mini-game: Signal Runner

Signal Runner appears in the lobby and **after you have locked in an answer**. A clue sits at the top, such as "mainly; mostly (not 100%)". Steer down a dark corridor, collect the matching vocabulary word and dodge the shufflers.

- Controls: tap the left or right half of the screen, swipe, use the ◀ ▶ buttons, or press ←/→ or A/D on a keyboard. **Play/Pause** restarts after a game over.
- It keeps a local best score on the phone only. It sends nothing to the server and gives **no** mission advantage or points.
- Your "Answer locked in" banner stays visible above the game.
- The game hides and pauses itself **immediately** when the explanation, the crew vote, the map update or a pause starts. The browser test measured 192–211 ms across two runs.
- The words come from the pack's optional vocabulary list.

## Question packs and the editor

Open `http://localhost:8787/editor.html`. The editor does not need a room or a running game, but it must be served by the game server.

- **Packs:** create, duplicate, rename (edit the name) and delete packs, and pick the selected pack.
- **Questions:** add, edit, delete and reorder (↑ ↓) questions. Each question has an optional original passage, the question, four options, the correct option, the explanation (the WHY), and an optional small picture. Pictures can be PNG, JPEG, WEBP or GIF. They are resized in the browser to 640 px or less and must stay under about 300 KB once stored.
- **Preview** shows a question the way a student sees it, plus the reveal.
- **Saving:** every change saves automatically to this browser's **localStorage** and survives a reload. Export JSON to back up a pack or move it to another computer.
- **Import JSON** accepts one exported pack, or `{ "packs": [...] }`. The whole import is validated first, and invalid files are rejected with readable errors and no changes.
- **Paste from a spreadsheet:** copy rows from Google Sheets or Excel and paste them. The columns are tab-separated:

  ```
  Question | Option A | Option B | Option C | Option D | Correct (A–D or 1–4) | Explanation | Passage (optional)
  ```

  A header row starting with `Question` is skipped. If any row is malformed, nothing is added and the row numbers are listed.
- **Print A4 + key** prints a question sheet followed by an answer key page.
- **Mini-game words** can be added as one `word = clue` per line.

When a room is created, the host sends the pack to the server. The server validates it and keeps its **own frozen copy** for that room. Editing a pack never changes a room that is already running.

### JSON format

```json
{
  "format": "after-hours-pack", "version": 1, "id": "my-pack", "title": "My pack",
  "description": "optional",
  "vocab": [{ "word": "collect", "clue": "to gather things together over time" }],
  "questions": [{
    "id": "q1", "passage": "optional original text",
    "prompt": "In this text, \"collected\" means…",
    "options": ["…", "…", "…", "…"], "correct": 1,
    "explanation": "Why B is right.", "image": "data:image/jpeg;base64,… (optional)"
  }]
}
```

`correct` is 0–3, or the letters `"A"`–`"D"`. The limits are 1–30 questions, a 300-character question, a 700-character passage, 120 characters per option and a 400-character explanation.

### Starter content

- **Old Tales, New Readers (Unit 8A practice)** has 12 *teacher-authored, editable* practice questions. They are inspired by the topic of Reading Explorer 1, Unit 8A (The Brothers Grimm). They are **not** textbook questions or transcriptions, and every passage is an original micro-passage.
  - Vocabulary covered: publish, collect, suitable, scary, primarily, text, add, belief, magical, although.
  - Skills covered: word meaning in context, evidence, inference, *primarily* vs *entirely*, contrast with *although*, suitable audience, and the order oral storytelling → collecting → publishing.
  - The correct answers are spread evenly: 3 each for A, B, C and D.
  - No precise historical dates or details were invented. Please check that the content suits your class before using it.
- **Quick Check: Past Simple (generic demo)** has 6 questions. It shows that the game works with any topic. With 6 questions the mission needs 2 fuses instead of 4.

## Tests (actual commands)

```bash
cd demos/after-hours
npm test                    # unit + API tests (node:test)
node tests/sim.mjs 20       # SIMULATED 20-client classroom over HTTP
node tests/sim.mjs 40       # SIMULATED 40-client classroom over HTTP
node tests/browser.mjs      # headless Chromium: projector + phones + editor, writes screenshots/
```

`tests/browser.mjs` needs Playwright and Chromium. In this build environment they were already installed globally. Elsewhere, run `npm i -D playwright && npx playwright install chromium`.

**Simulated means automated scripts, not student devices.** In the simulations the "disconnected" threshold is shortened to 2.5 s so that dropouts happen quickly. In real play it is 30 s.

### Acceptance results from this build (2026-11-02, Linux container, Node 22, headless Chromium)

| Suite | Result |
|---|---|
| `npm test` | **22 / 22 passed**. Covers: pack validation (malformed packs, pictures, spreadsheet rows); 40 joins with the 41st rejected and crews of 10/10/10/10; same-identity reconnect; invalid phases, stale rounds, duplicate answers and unaffordable or unknown votes; answers hidden before reveal; normalised crew % scoring with disconnected players excluded; auto-close and timer; pause; late join; frozen pack snapshot; reset making old round ids stale; end → extraction → debrief; a full mission ending in full extraction; no dead ends with weak accuracy; host-token authorisation; body limits; path traversal / dotfiles / source not served |
| `node tests/sim.mjs 20` | **PASS.** 20 simulated clients (2 joined late, 3 disconnected at Q5 and reconnected at Q7 with the same identity and crew). All 12 rounds were played and the mission completed with *full extraction*, 3 stars, 4/4 crews at the gate and 82% simulated accuracy. 4,955 requests, 0 server errors. Answer latency p50 1.4 ms / p95 2.3 ms. The only rejections were the expected ones: 21 deliberate double-taps (`already_answered`), 2 late `wrong_phase` and 1 stale answer after reset |
| `node tests/sim.mjs 40` | **PASS.** 40 simulated clients with the same disconnect and late-join script. *Full extraction*, 3 stars, 84% accuracy. 11,897 requests, 0 server errors. Answer p50 1.1 ms / p95 3.5 ms. After the mission, a reset returned to the lobby, a stale answer got 409, and end → debrief worked |
| `node tests/browser.mjs` | **44 / 44 checks passed, 0 console or page errors.** No horizontal overflow at 1366×768 or 390×844 on the title, host, phone and editor pages. Editor: save, reload, reorder, picture accept/reject, preview, spreadsheet paste (good and bad), JSON import (bad, non-JSON and good) and export. Mini-game gating: hidden at question start, shown after answering with the answer banner still visible, hidden 211 ms after the last answer triggered the reveal, and hidden during the vote. Pause shows on phones. All 12 rounds ran to extraction and debrief. A phone reload kept the same identity. Reset works. The DEMO room is labelled |

The simulated outcomes depend on the scripted accuracy and on the simple vote strategy the scripts use. A balance check on the engine (40 missions per level, 20 players, mostly sensible votes) gave:
- 40% accuracy: 33 *fence*, 7 *gate*, 0 *full*.
- 60% accuracy: 24 *full*, 13 *gate*, 3 *fence*.
- 80% accuracy: 32 *full*, 8 *gate*.
- 95% accuracy: 32 *full*, 7 *gate*, 1 *fence*.

So learning accuracy, not speed, is what mainly decides the ending.

### Screenshots

These were generated by `tests/browser.mjs` and are in `screenshots/`:

- **Projector:** `01-title`, `02-host-setup`, `03-host-lobby`, `04-host-question`, `04b-host-all-answered-indicator`, `05-host-reveal-why`, `06-host-vote-map`, `07-host-map-update`, `08-host-mid-mission-map`, `09-host-extraction`, `10-host-debrief`.
- **Phone:** `p00-title`, `p01-join`, `p02-lobby-minigame`, `p03-question`, `p04-answered-minigame`, `p05-reveal`, `p06-vote`, `p07-debrief`.
- **Editor:** `e01-editor`, `e02-editor-preview`, `e03-editor-phone`.

## Architecture

```
server.mjs              Node ESM HTTP server (zero dependencies): static files + JSON API + long-polling
src/game.mjs            Authoritative game engine (rooms, phases, scoring, map rules, bots, views)
public/js/shared/       Code shared by server and browser: map graph, pack schema/validation, starter packs
public/host.html/.js    Teacher projector
public/play.html/.js    Phone client
public/editor.html/.js  No-code pack editor (localStorage)
public/js/map-render.js Isometric campus renderer (Canvas 2D)
public/js/runner.js     Signal Runner mini-game
public/js/vendor/qrcode.mjs  QR encoder (qrcode-generator 2.0.4, MIT, Kazuhiko Arase), vendored locally
tests/                  node:test suites, HTTP simulation, Playwright browser run
```

**API.** All request bodies are JSON:

| Method and path | Purpose |
|---|---|
| `POST /api/rooms` | Body `{pack, settings, demo}`. Returns `{code, hostToken}` |
| `POST /api/rooms/:code/join` | Body `{callsign}` or `{playerId, secret}` |
| `GET /api/rooms/:code/state?since=<version>` | Long-poll, held for up to 20 s. Needs player or host headers |
| `POST /api/rooms/:code/answer` | Body `{roundId, choice}` |
| `POST /api/rooms/:code/vote` | Body `{roundId, option}` |
| `POST /api/rooms/:code/host/:action` | Actions: `start`, `reveal`, `next`, `pause`, `resume`, `end`, `reset`. Needs the `X-Host-Token` header |
| `GET /api/info` | Detected LAN addresses |

## Security, privacy and retention

- **Accounts and names:** there are no accounts, no OAuth, no Google Classroom and no student records. Students choose a callsign; there is a filter for format and a few bad words. Ask students not to use real names.
- **Teacher token:** each room gets a 48-hex-character random host token, checked in constant time. The token is never part of the public state. Each player gets a random id and secret, which their phone keeps.
- **Hidden answers:** the correct answers and explanations stay on the server until the reveal.
- **Input limits:**
  - Request bodies are limited to 4 KB, or 3.2 MB when creating a room with a pack.
  - Malformed JSON is rejected, and callsign, choice, option, round id and phase are all validated.
  - A room holds at most 40 players and a server at most 12 rooms.
  - Waiting long-polls per room are capped, and long-poll releases are batched to at most one every 150 ms.
- **Static files:** they are served only from `public/`, with no `..` segments, no dotfiles and an allow-list of file types. Pages send a Content-Security-Policy (`default-src 'self'`), nosniff and no-referrer, and all user text is written with `textContent`.
- **Retention:**
  - All game state lives **in memory only**. It is lost when the server stops, and an idle room expires after 3 hours.
  - Nothing is written to disk.
  - The debrief shows class and crew totals only.
  - Packs live in the teacher browser's localStorage.
- **Transport:** plain HTTP on the LAN, with no TLS. Anyone on the same network who can watch traffic could see the room code and tokens. Use a trusted classroom network.

## Limitations and open issues

- **Not classroom-validated.** Every result above comes from automated clients and headless Chromium. Nothing has been tested on real iOS or Android phones, on school Wi-Fi with client isolation, or with real students. Run a short trial with 3–4 real phones first.
- In-memory only, so a server crash or restart ends the room. There is no persistence or resume after a restart.
- One server process. It is not designed for public or internet deployment, and none has been done. Public hosting would need HTTPS, rate limiting and authentication hardening.
- **Balance** was tuned with scripted voters. Real crews may move faster or slower, so adjust the timers or the pack length if needed. A strong class can reach the gate before dawn; crews then "hold the gate" for the remaining questions.
- The callsign filter is basic. The teacher should still watch the lobby list. There is no kick button yet.
- The sound is a simple synthesised drone with blips. Without sound everything is still fully playable.
- The browser test covers Chromium only; Safari and Firefox have not been tested.
- Pictures are stored as data URLs in localStorage, which is usually limited to about 5 MB per site. The editor warns when storage is full.
