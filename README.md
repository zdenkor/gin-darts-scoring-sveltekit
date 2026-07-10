# Gin's Online Dart's Scoring System

A serverless, installable web app for scoring dart games. Play locally with friends or connect peer-to-peer across devices. Works on GitHub Pages without a backend.

## Live URL

- **Landing / version switcher:** https://zdenkor.github.io/gin-darts-scoring-sveltekit/
- **SvelteKit dashboard:** https://zdenkor.github.io/gin-darts-scoring-sveltekit/dashboard
- **Legacy (classic) version:** https://zdenkor.github.io/gin-darts-scoring-sveltekit/legacy/index.html

## Two versions

### SvelteKit version (NEW)
Modern responsive UI with:
- X01 setup and scoring (301 / 401 / 501 / 701 / 1001)
- Undo / redo and command sheet
- Continue saved game after closing the browser
- Per-player statistics with throwing order insights
- Peer-to-peer online match room (WebRTC, manual signalling)
- Competitions registry (leagues, tournaments, knockouts)
- Local user accounts and admin panel
- Settings: theme, sound, admin password, Google sync client ID

### Legacy version
Original vanilla JavaScript app preserved under `/legacy`. Use it if you prefer the previous interface or need existing features that are still being ported.

## Installation

The app is a Progressive Web App (PWA). In a supported browser tap **Add to Home Screen** to install it and use it offline.

## Development

Requires Node.js 22+ and npm.

```bash
cd /c/Temp/gin-darts-scoring-sveltekit
npm install
npm run dev      # local dev server
npm run build    # static build into build/
npm run preview  # preview the production build
```

## Deploy

Pushes to `main` automatically deploy to GitHub Pages via `.github/workflows/deploy.yml`. You can also trigger a manual deploy of any branch from the Actions tab.

## Project structure

```
src/
  routes/           SvelteKit pages
  lib/
    ui/             Reusable UI components (GameScreen, Calculator, ...)
    game/           Pure JS dart engine and stats
    auth/           Local auth and Google Identity sync
    db/             IndexedDB wrapper, players, competitions
    net/            P2P signalling
    util/           Settings, current game persistence, history
static/
  legacy/           Original vanilla app
```

## Tech stack

- **Svelte 5** (runes) + **SvelteKit** (static adapter, deploys to GitHub Pages)
- **Bits UI** (`bits-ui` v2) for select / listbox / dropdown components
  (instead of native `<select>`); see `src/lib/ui/Select.svelte`
- **Engine**: pure JS in `src/lib/competition/engine.js` — single elim,
  double elim, round-robin (single + double), and a manual-groups
  override path that the Create wizard uses for the matrix seeding
- **Storage**: IndexedDB via `idb-keyval` for games, players, matches
  and competitions; `localStorage` for settings, NOSTR identity, and
  the in-flight game snapshot

## Features

### Local single-player PWA

- X01 setup and scoring (301 / 401 / 501 / 701 / 1001)
- Undo / redo and command sheet
- Continue saved game after closing the browser
- Per-player statistics with throwing-order insights
- Local user accounts and admin panel
- Competitions registry (leagues, tournaments, knockouts)
- Bot opponents with 7 difficulty levels (DartBot L1–L7)
- Settings: theme, sound, ask-checkout, Google sync client ID

### Decentralized infrastructure (NOSTR + Yjs + IPFS)

The 0.4.5 line adds a fully-decentralized layer for tournaments and
online play. **None of it is required** for local play — the app
falls back to local-only mode whenever a relay is unreachable.

- **NOSTR identity** (`src/lib/nostr/identity.js`): a secp256k1
  keypair is deterministically derived from the signed-in Google
  user id. There is no fallback keypair for anonymous users.
- **Calendar** (`/calendar`): read-only view of every tournament
  published on the public NOSTR relays as `kind: 30001` events
  with a `t = darts-tournament` tag. Search / filter is in-memory.
- **Player history** (`/history`): looks up a license id, asks the
  relays for events with `#i = <id>`, follows the published
  `data_url` JSON, and computes career stats (W/L, 3-dart average,
  180s, high checkout, clubs).
- **Live multi-device sync** (`src/lib/sync/yjsRoom.js`): a Yjs
  CRDT room, opened per match, transported over `y-webrtc` and
  persisted locally with `y-indexeddb`. The engine stays the
  source of truth; the Y.Map is just a fast broadcast channel.
- **NOSTR checkpoint** (`src/lib/nostr/checkpoint.js`): after every
  throw, a `kind: 30001, t = darts-checkpoint` event is published
  to the public relays so a tablet that rebooted or lost WebRTC
  can recover the latest state.
- **Archive** (`src/lib/archive.js`): on match end, the final
  JSON is uploaded to Google Drive (free, persistent) and
  optionally to IPFS via Pinata (admin pastes a Pinata JWT in
  Settings). A `kind: 30001, t = darts-archive` event with the
  `data_url` is then published.

## License

Same license as the original project.

## Author

Acharian
