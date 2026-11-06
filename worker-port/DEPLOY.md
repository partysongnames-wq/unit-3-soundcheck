# Deploying AFTER HOURS

This project is ready for Cloudflare Workers, but **has not been deployed**.

## Prerequisites

- Node.js 20+
- A Cloudflare account with Workers and Durable Objects enabled
- Wrangler authenticated with `npx wrangler login`

## Verify locally

```sh
npm install
npm test
npm run dry-run
npm run dev
```

Open `http://127.0.0.1:8799/host.html`. Player, teacher, and editor pages remain at `/play.html`, `/teacher.html`, and `/editor.html`.

## Deploy

1. Review/change `name` in `wrangler.jsonc` if the Worker name is already taken.
2. Run:

```sh
npx wrangler deploy
```

Wrangler creates the `GameRoom` SQLite Durable Object class from migration `v1` and uploads the `assets/` directory. No environment variables or secrets are required.

After deployment, use the HTTPS Worker URL with `/host.html`. QR codes and `/api/info` automatically use that public origin; WebSockets automatically switch to `wss://`.

## Architecture and limits

- A random five-character room code maps deterministically to one Durable Object via `idFromName(code)`.
- That object owns room state, authentication, host/player WebSockets, ticking, broadcasts, and persistence.
- WebSockets use the Durable Objects Hibernation API. An idle room can hibernate; an active round intentionally runs a 20 Hz timer to preserve the original engine cadence, with 10 Hz world snapshots.
- Durable Object alarms provide active-round recovery and three-hour idle cleanup. Rooms with connected sockets are not deleted.
- State is persisted approximately once per second and on important HTTP/disconnect mutations. A sudden isolate failure can lose up to roughly one second of transient movement. On restore, elapsed wall-clock time is added to the game clock, but missed physics frames are not replayed, so an eviction may cause a brief movement discontinuity.
- Limits remain 40 players and 60 total sockets per room. Cloudflare account limits, Durable Object duration/storage charges, and WebSocket limits also apply.
- The LAN server's global 12-room cap is intentionally removed: Cloudflare creates one isolated object per room.
- Static assets may canonicalize `.html` URLs to extensionless paths through Cloudflare's asset serving; browser navigation and relative assets remain valid.
