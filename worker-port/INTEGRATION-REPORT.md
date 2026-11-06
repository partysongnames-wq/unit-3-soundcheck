# Station Challenge Integration Report

## Scope and safety

Integrated only in `/Users/MacBookAir/clawd/after-hours-stations-dev` (Wrangler name `after-hours-stations-dev`). No external deploy was run. `/Users/MacBookAir/clawd/unit-3-soundcheck-deploy/worker-port` was used only as the stated parity boundary and was not written or deployed.

## Baseline preserved

The pre-integration engine suite had 24 tests covering world reachability, packs, rooms, auth identities, lockers, scoring, movement, zombies, events, reconnect-adjacent state, kittens and Word Builder. All 24 still pass. The Worker integration suite still passes all 7 groups (static assets/security, create/join/reconnect/auth, WebSockets/start, API info, read-only teacher view, frame limits, 40-player limit).

## Architecture

- `src/stations.mjs`: deterministic pure generators, station metadata, public serializers and reward policy.
- `Room.openStation / stationAnswer / endStation`: the Durable Object room is authoritative for seed, nonce, content, canonical index, progress, deadline, attempts, points, energy/happiness and stamps.
- One `p.station` per player allows concurrent players at the same station. `p.stationAttempts` is consumed on open, preventing replay even after close/reconnect; `resetPlayer` clears it only for a new match.
- Public messages serialize only the active item. Canonical indices remain server-side until that item has been submitted.
- `busy()` includes station state, so authoritative movement correction freezes the player while the modal is open. Existing locker, Word Builder, zombies, fuses, events and reconnect paths remain intact.
- Reconnect/disconnect safely ends an active challenge without refunding the consumed attempt or awarding partial work.
- One shared client controller renders three themes: warm Maths, local-SVG Flag, and dark CCTV Checkpoint. Checkpoint camera cards now include locally generated inline SVG cartoon riders rather than text-only panels.

## WebSocket schema

Client → server:

- `{t:"station_open", kind:"math"|"flag"|"checkpoint", level?:"easy"|"medium"|"hard"}`
- `{t:"station_answer", nonce:string, i:0..2, c:0..3}`
- `{t:"station_close"}`

Server → player:

- `station`: `{kind,level,nonce,ms:22000,total:3,item}`
- `station_res`: `{kind,i,ok,choice,correctIndex,next?}` (correct index appears only after that item submission)
- `station_end`: `{kind,reason,correct,total:3,points,stamps}`
- `passport`: newly awarded stamp and current stamp list
- Existing `fx` / `feed` carry station score and passport-bonus feedback.

Rejected cases: wrong/stale nonce, malformed or out-of-range item/choice, out-of-order item, duplicate answer, late answer, wrong phase, pause, zombie, busy state, excessive distance, repeated attempt and invalid flag level.

## Coordinates and hints

- Maths: `(24.5, 4.5)`, inside the existing Maths room.
- Flag: `(33.5, 20.5)`, the existing flagpole tile.
- Checkpoint: `(16.5, 21.5)`, beside the existing security hut / food-pickup checkpoint.

The action button changes only when nearby (`MATHS ➗`, `FLAGS 🚩`, `CHECKPOINT 🛵`), avoiding permanent map clutter. Server proximity is independently verified.

## Content and rewards

- Maths: 3 deterministic questions drawn from all eight families (ratio, percent/money, powers/roots, linear equations, Pythagoras, measurement, mean/data, probability). Reward 0 below 2 correct, 2 for 2/3, 3 for 3/3.
- Flags: 36 bundled local SVGs, 12 each at Easy/Medium/Hard; exactly 3 flags and four unique choices. Threshold 2/3; reward Easy 1, Medium 2, Hard 3.
- Checkpoint: three cases progressing easy → medium → hard, four riders each, generated clue constraints and exactly one matching rider. Every camera card visually renders helmet colour, shirt colour, glasses, exact bag count, food, transport and pickup code; a concise fallback line and complete `aria-label` remain available. Reward 0 below 2, otherwise the correct count.
- Successful English Word Builder, Maths, Flag and Checkpoint completions each add their stamp once per match. The third distinct stamp awards +3 exactly once with player message, feed and FX.
- Score mutation occurs once at `endStation(...,"done")`; incomplete/timeout/reconnect paths award zero. Successful station completion adds +8 happiness and +15 energy.

## Proof

- Full suite: **31/31 engine tests passed** (24 baseline + 7 station groups).
- Worker integration: **7/7 groups passed**, including create/join/auth, WebSocket start, proximity travel, `station_open`, three `station_answer` messages, `station_end`, attempt rejection, and no answer fields in public snapshots.
- Stress in automated test:
  - 10,000 Maths rounds = 30,000 generated questions; deterministic, all eight families, four unique options and one canonical option.
  - 10,000 Flag rounds = 30,000 questions across all levels; deterministic, no repeated flag per round, unique choices and one canonical option.
  - 20,000 Checkpoint cases; deterministic and exactly one constraint match per case.
- Checkpoint-specific responsive render inspected with all four illustrated, tappable CCTV cards and readable clue:
  - `evidence/checkpoint-cctv-390x844.png`
  - `evidence/checkpoint-cctv-1366x768.png`
- Test transcript: `evidence/test-full.log`
- Wrangler build transcript: `evidence/wrangler-dry-run.log`
- Wrangler dry-run passed: 72 assets, 95.57 KiB upload / 27.61 KiB gzip. No deploy.

## Compromises / risks

- The earlier text-only Checkpoint compromise was removed. The compact local inline-SVG renderer is intentionally simpler than the spike artwork, but it is clearly illustrated and exposes every clue-bearing trait visually.
- Station seeds use cryptographically random server tokens; deterministic generation is proven by injecting the same seed in tests, while production clients never choose or receive the seed.
- The 22-second limit is server-authoritative and shared across all three stations (within the requested 15–25 seconds).

## Files changed

Core / configuration:
- `src/stations.mjs` (new)
- `src/game.mjs`
- `src/worker.mjs`
- `assets/js/play.js`
- `assets/play.html`
- `assets/css/stations.css` (new)
- `package.json`
- `package-lock.json` (local arm64 Workerd dependency repair)

Tests / proof / report:
- `tests/stations.test.mjs` (new)
- `tests/worker.test.mjs`
- `tests/render-proof.html` (new; Checkpoint projector fixture)
- `tests/render-proof-phone.html` (new; deterministic phone fixture)
- `evidence/checkpoint-cctv-390x844.png` (new)
- `evidence/checkpoint-cctv-1366x768.png` (new)
- `evidence/stations-390x844.png` (earlier all-station proof retained)
- `evidence/stations-1366x768.png` (earlier all-station proof retained)
- `evidence/test-full.log` (new)
- `evidence/wrangler-dry-run.log` (new)
- `evidence/render-server.log` (new)
- `INTEGRATION-REPORT.md` (this file)
- `dist-dry-run/worker.js`, `dist-dry-run/worker.js.map`, `dist-dry-run/README.md` (regenerated by dry-run)

Bundled flag files:
- assets/flags/LICENSE.txt
- assets/flags/ar.svg
- assets/flags/au.svg
- assets/flags/bn.svg
- assets/flags/br.svg
- assets/flags/bt.svg
- assets/flags/ca.svg
- assets/flags/cl.svg
- assets/flags/cn.svg
- assets/flags/de.svg
- assets/flags/fr.svg
- assets/flags/gb.svg
- assets/flags/id.svg
- assets/flags/in.svg
- assets/flags/is.svg
- assets/flags/it.svg
- assets/flags/jm.svg
- assets/flags/jp.svg
- assets/flags/ke.svg
- assets/flags/kg.svg
- assets/flags/kh.svg
- assets/flags/kr.svg
- assets/flags/kz.svg
- assets/flags/la.svg
- assets/flags/lk.svg
- assets/flags/mm.svg
- assets/flags/mn.svg
- assets/flags/my.svg
- assets/flags/np.svg
- assets/flags/nz.svg
- assets/flags/ph.svg
- assets/flags/sg.svg
- assets/flags/th.svg
- assets/flags/tl.svg
- assets/flags/us.svg
- assets/flags/vn.svg
- assets/flags/za.svg

## Live-source untouched confirmation

No command wrote to or deployed `/Users/MacBookAir/clawd/unit-3-soundcheck-deploy/worker-port`. No `wrangler deploy` without `--dry-run` was executed. The only Wrangler target remained `after-hours-stations-dev`.
