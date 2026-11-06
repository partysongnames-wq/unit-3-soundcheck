# AFTER HOURS — Cloudflare Worker Port

Cloudflare Worker + one Durable Object per room port of the LAN Node/WebSocket game, synchronized with upstream commit `0114cd7`.

## Included

- Current SnR Daywalkers engine and all host/player/teacher/editor assets
- School-bell room events, happiness, day/night music, kittens and cat food, and Word Builder
- Worker HTTP API with original room, token, join, host-action, teacher-view, and check routes
- Durable Object WebSockets with authentication, newest-player-tab behavior, rate limiting, real-time snapshots, and hibernation attachments
- Durable state persistence, active-round alarm recovery, and idle-room cleanup
- 24 engine tests plus 7 live Wrangler integration groups (31 total), including new assets/audio and WebSocket actions

## Commands

`npm test` — engine tests, then live local Worker/API/WebSocket/static-page tests  
`npm run test:engine` — game engine only  
`npm run test:worker` — Wrangler local integration suite  
`npm run dry-run` — Cloudflare bundle/upload validation without deployment  
`npm run dev` — local Worker on port 8799

See [DEPLOY.md](./DEPLOY.md) for deployment and operational limitations.
