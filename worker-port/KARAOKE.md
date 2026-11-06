# AV Karaoke: implementation and testing

Based on the supplied `02-with-stations` snapshot. The ZIP contained no Git history or remote URL; local baseline commit preserves that snapshot, with work on `feature/av-karaoke-rhythm`. The supplied `01-before-stations` remains unchanged outside this repository. No deployment has been performed.

## What caused the reported problem

The stage was already at the bottom: world.js places walkable `m` tiles at x36–39/y14–16, with speakers at (36,16)/(39,16). `isStage` checks those tiles correctly. The old Karaoke Hour was a passive reward event (one point per three seconds, maximum four), not a playable rhythm game. The event renderer placed the microphone icon at the north edge of the whole AV zone and pointed the phone arrow at the room centre. Both were visually disconnected from the stage. Standing to earn the old reward did not set the player's busy flag, so nearby zombies (including an AV spawn at 37.5,11.5) could tag singers. The event only lasted 30 seconds, including travel time.

## New experience

- A permanent SING marker at (37.5,14.8), on the existing south stage; event icon and phone arrow point there too.
- A 35-second original synthesized rhythm song: three-second ready count, three rounds of 12/16/24 notes at 800/600/400ms spacing, then an outro.
- Four large colour-and-shape pads, D/F/J/K keys, note highway, dancing original avatar/zombie artwork, combo chimes, wrong-pad slide, mute and reduced-motion support.
- Results show accuracy, arcade score, best combo and server-awarded game points. Back to school returns to the same map position.
- Normal rewards replace passive Karaoke Hour points: 45%/70%/90% accuracy earns 2/3/4 game points, plus 15 energy/happiness capped at 100. No passport changes. One attempt per player per match, consumed on opening, including early exit. Practice allows repeats without karaoke rewards.

## Safety and classroom timer

First approach within two tiles of the microphone grants up to eight seconds of tag protection, once per match; leaving and returning does not renew it. Active singers are busy: cannot move, cannot be chased or tagged and do not lose energy. There are three seconds of exit protection. Zombies continue moving and tagging elsewhere. This is not a classroom pause.

Entry requires at least 37 seconds of match time. Karaoke is available throughout active play, regardless of the random Karaoke Hour advertisement (which may end before the song). Teacher pause freezes the main clock and song together. A teacher end or another player's score-goal win cancels active songs without rewards, as for other activities. Karaoke rewards themselves respect the existing score goal. The song uses the engine clock; heavy server stalls can lengthen wall-clock duration, as they do the existing match.

## Server authority and reconnects

The Durable Object authenticates the player and owns chart randomness, nonce, epoch, consumed attempt, judgments, combo, accuracy, arcade score, rewards and result. Inputs contain only lane and nonce. Client scores and timestamps are ignored. Judgment uses server game time, with a 220ms early/320ms late window and a 110ms perfect window. Moderate latency gets a generous late allowance; very slow connections can still miss. The display synchronizes every second; client synchronization never changes scoring.

Wrong pads consume that note. Inputs under 80ms apart are ignored; stray taps reduce score and accuracy. The existing socket token bucket applies too. Clearing the active session before crediting and persisting it alongside rewards prevents duplicate awards through close/reconnect/expiry. Active songs survive disconnects and Durable Object persistence. Missed beats count, and disconnected songs expire. Reconnect restores the current chart/judgments or unacknowledged results; it never creates another attempt. Chart-aware automation cannot be eliminated in a browser rhythm game, but there is no trusted client score or client tap timestamp.

## Run locally

Requires Node 20+ and the package lock supplied with the project.

```sh
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:8799/host.html`. Normal play: create a room, join from `/play.html`, start the game, walk through the lower AV door, approach SING and tap the action button. A phone cannot use your computer's localhost address; use the computer's reachable LAN address and the appropriate Wrangler listen address for LAN testing.

For immediate safe testing, choose **Teacher rehearsal** from the host page, or visit `/karaoke-test.html`. This creates a separate room, then join with a nickname. The rehearsal starts automatically after joining; the player spawns at the microphone. It has no zombie tags and karaoke never awards rewards. It uses separate saved player identity and is marked REHEARSAL. Refresh preserves rehearsal identity. Normal rooms cannot be converted to practice by changing settings or sending input messages.

## Deployment handoff

Do not overwrite the current Worker name or push to an auto-deploying production branch. Before publishing, reconcile this snapshot with the actual GitHub repository and its Cloudflare integration. Use a new branch and a distinct Cloudflare preview Worker name, isolated Durable Objects/storage and a preview-specific deployment workflow. This project requires Cloudflare Workers plus Durable Objects; a static-only preview cannot run multiplayer. No tokens or account credentials are bundled. `wrangler.karaoke-preview.jsonc` provides the distinct preview name and creates separate Durable Objects/storage in the selected Cloudflare account. The original `wrangler.jsonc` is unchanged. After confirming the correct account and GitHub workflow, publish with `npx wrangler deploy --config wrangler.karaoke-preview.jsonc`. This command has not been run.
