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

## License

Same license as the original project.

## Author

Acharian
