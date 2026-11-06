# Integrated Mini-games Development Branch

Canonical Cloudflare Worker source: worker-port/.

Included development features:
- Maths Sprint
- World Flag Challenge
- Checkpoint CCTV with illustrated riders
- Karaoke Rhythm mini-game and teacher rehearsal
- School Passport stamps and bonus
- Existing Word Builder, lockers, fuses, zombies, events and kittens

Validation on macOS arm64 Node 24:
- npm test: 45 engine tests and 9 Worker integration groups passed
- wrangler deploy --dry-run: passed

This branch is development-only. It has not been merged to main and was not deployed while preparing the branch. Do not use the production Worker name for experiments. worker-port/wrangler.karaoke-preview.jsonc defines a separate preview target if a later, explicitly authorized preview deployment is needed.
