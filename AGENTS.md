# AGENTS.md

This file tells AI coding agents (Hermes Agent, Claude Code, Cursor,
Continue, Copilot, etc.) how the project is set up and what rules
apply. Read this file **before** editing any code.

## Project: Gin's Dart's Scoring System — SvelteKit port

A PWA darts scoring app. Player-vs-bot or player-vs-player x01
(301/401/501/701/1001), with per-leg history, lifetime stats,
leagues and tournaments, and Google Drive sync for cross-device
data. This repo is the SvelteKit port; the original vanilla JS
app lives at https://github.com/zdenkor/gins-online-darts-scoring
and is the source of truth for behaviour.

## Tech stack

- SvelteKit + Svelte 5 (`$state`, `$derived`, `$props`, `$effect`)
- Static adapter (SvelteKit `output: 'export'`, no SSR)
- IndexedDB for local game / history / settings / users
- Vite + Rollup
- `bits-ui@2.18.1` for headless UI primitives (see below)
- PWA via `manifest.webmanifest` + service worker

## UI primitives: Bits UI first, SvelteKit second

The project uses **bits-ui** for headless UI primitives
(calendar, select, listbox, dropdown, popover, modal,
dialog, tabs, tooltip, etc.). **Do NOT add new native
HTML form elements** (`<select>`, `<dialog>`, etc.) or
hand-rolled popovers in feature work — wire up the
existing Bits UI component (or a project wrapper around
it) instead. The priority order when picking a UI
primitive is:

1. **Bits UI** — `bits-ui@2.18.1` (select, calendar,
   popover, dialog, tooltip, tabs, etc.). We already
   consume several; the rest of its surface is
   available off the shelf.
2. **SvelteKit / Svelte 5** — built-in constructs
   (`$state`, `$derived`, `$props`, snippet / {#each /
   {#if}) and SvelteKit primitives
   (`$app/navigation`, `$app/paths`, etc.).
3. **Plain DOM / native HTML** — only as a last
   resort and only with a written reason in the
   commit message.

The project ships a thin wrapper for the most common
case — wrap the call in
`<Select options={…} bind:value={…} />` from
`$lib/ui/Select.svelte` instead of reaching for a
native `<select>`. The wrapper:

- accepts `options` as either an array of
  `{ value, label, desc? }` or a `Record<key, { label, desc? }>`
  map (the `X01_IN_OPTIONS` / `X01_OUT_OPTIONS` shape),
- exposes `bind:value`, `placeholder`, `ariaLabel`, `disabled`,
  `id`, `name`, `className`,
- renders as a popup on desktop, a bottom sheet on mobile
  (≤768px), and a wide overlay with large hit areas on TV
  (≥1600px), all from one component.

When a new feature needs a select, add a `<Select>` import and
use the wrapper. When a route still has a native `<select>`,
leave the refactor for a follow-up — don't mix styles in the
same commit.

## Global keyboard navigation (TV D-Pad)

`src/lib/ui/keyboardNav.js` is installed in `+layout.svelte`
on mount. It maps arrow keys to focus movement across the page
so the app works on TV browsers and as a keyboard-only fallback
on desktop:

- Right/Left: next/prev focusable element in the current row
- Up/Down: same column in the row above/below
- Enter: activates the focused element

The nav skips inputs, textareas, contenteditable elements, and
any open Bits UI popup. Do not bypass it without a reason.

## Git workflow

The user (zdenkor) is the source of truth for git operations.
Follow these rules exactly:

1. **Never auto-commit.** Wait for the user to say "commit X.Y.Z
   aj na github" (or equivalent). The user controls release
   timing.

2. **Never auto-push.** Wait for an explicit push instruction.

3. **Force-push requires explicit consent.** Always use
   `git push --force-with-lease` (never bare `--force`). If the
   user previously approved force-push for a given ref, that's
   fine; if not, ask.

4. **One feature = one commit.** Squash related changes (e.g.
   "login icons + Google OAuth + help icons for v0.2.3") into
   one commit before push. Use `git reset --soft HEAD~N` to
   combine recent commits, then commit a single message.
   Use `git reset --soft`, never `--hard` (the working tree
   must stay intact).

5. **package.json version MUST match the commit message.** When
   the user says "commit 0.2.7", `package.json` must equal
   `0.2.7` in the same commit. The user was rightfully angry
   when this was wrong (left `package.json` at 0.2.5 while
   pushing v0.2.7). Do not split version bumps into separate
   commits.

6. **Per-batch 0.0.1 version bumps.** The user (not the agent)
   decides when a version number advances.

7. **Untracked user-pushed assets stay untracked.** Files in
   `static/assets/` (e.g. `login.svg`, `logout.svg`) are
   downloaded by the user manually. Do not `git add` them on
   the user's behalf. If Actions fails with 404 on those
   assets, ask the user how to proceed (commit, sideload,
   rollback).

## Match history and the checkout-attempts modal

The game engine (in `src/lib/game/engine.js`) is responsible
for the modal asking "how many darts did you throw at the
close-out?" — see `CHECKOUT_FORMULAS.md` in this repo for the
exact rules. The table is:

| target type | max (dart attempts) |
|---|---|
| 1-dart closer (e.g. 50, 40) | 3 |
| 2-dart closer (e.g. 100, 60) | 2 |
| 3-dart closer (e.g. 170, 160) | 1 |
| Unclosable (e.g. 1, 159, 171+) | 0 (no modal) |

`max` is the same for bust and non-bust branches; the only
thing that changes is which case the engine hits. The modal in
`GameScreen.svelte` renders buttons 0..max (not 1..max) so
players can record zero darts aimed at the close.

The `docs/CHECKOUT_FORMULAS.md` file in this repo is the
authoritative version for the SvelteKit port. The equivalent
file in `gins-online-darts-scoring` is older and more
conservative; treat this repo as source of truth.

## Undo after a finished leg

The user can undo a leg-finishing throw. The flow:

1. The last commit before a leg is recorded to history
   (`recordGameHistory` returns the new entry's id) and the
   saved game is cleared from IDB.
2. The past-stack entry for that commit is tagged
   `isLegWin: true` with `preFinishState` and `legWinEntryId`.
3. Undo on such an entry: deletes the stats entry via
   `deleteGameHistory(legWinEntryId)`, restores
   `preFinishState` in memory, and writes it back to IDB.
4. Redo on a leg-finishing state: re-records the stats entry
   under a new id.

If you touch `GameScreen.svelte` or `history.js`, preserve
this flow. Do not call `clearCurrentGame` without writing the
pre-finish state to `past`.

## Scoreboard layout: `100dvh` + `container queries`

The app uses `100dvh` (dynamic viewport height) for the main
shell and CSS container queries (`@container`) for per-screen
sizing — not `@media`. Follow the existing pattern when adding
a new screen; declare `container-type: inline-size` (or
`size` for height-aware layouts) and use `cqi` / `cqb` in
`clamp()` for fonts and padding.

## Footer / header safe-area-inset

Header and Footer use `env(safe-area-inset-*)` padding for
iOS notches and home indicators. Don't remove it.

## Tech stack (current, 0.4.5)

- **Svelte 5** with runes — every store is `$state` / `$derived`,
  no legacy `writable` stores. New code should use runes too.
- **SvelteKit** with `@sveltejs/adapter-static`. Pages that
  touch the network (e.g. `/calendar`, `/history`) declare
  `export const prerender = false; export const ssr = false;`
  in a sibling `+page.js`.
- **Bits UI** (`bits-ui` v2.18) for select / listbox / dropdown
  primitives. The wrapper lives at `src/lib/ui/Select.svelte`;
  prefer that over native `<select>`.
- **nostr-tools** (`^2.23`) for the NOSTR layer — identity,
  calendar, history, checkpoint, archive. Use the `/pure` and
  `/pool` subpaths; the main `nostr-tools` import path is fine
  too, just heavier.
- **yjs** + **y-webrtc** + **y-indexeddb** for the live
  multi-device sync layer. The room helper is
  `src/lib/sync/yjsRoom.js`.
- **Pinata** for IPFS pinning, via the public REST API
  (`https://api.pinata.cloud/pinning/pinJSONToIPFS`). The
  admin pastes their Pinata JWT into Settings; the app
  reads it via `loadSetting('pinataJwt')`.
- **Google Drive** for the admin's own archive copy. The
  multipart upload uses `getAccessToken()` from
  `src/lib/auth/google.js`.

## Decentralized infrastructure rules

- **Engine stays the source of truth.** The Y.Map and the
  NOSTR checkpoint are broadcast / recovery channels, not
  the game's data store. The engine in
  `src/lib/competition/engine.js` is the canonical state.
  This rule already applied to engine logic and now also
  applies to the live sync layer — do not let the CRDT
  overwrite the engine's bookkeeping.
- **NOSTR identity is bound to the signed-in Google
  account.** Don't add a random-keypair fallback for
  anonymous users. The Header derives the key from
  `auth.displayUser.id` (or `auth.user.uid`) on first
  paint, and clears it on sign-out.
- **Archive uploads are fire-and-forget.** Network
  failures must never undo a finished game. The
  `archiveCompetition()` helper is wrapped in try/catch
  around every step; add new steps in the same style.
- **Relay lists are public, free, community-run.** The
  default relay list lives in
  `src/lib/nostr/calendar.js` (`DEFAULT_RELAYS`). The
  same list is reused by `checkpoint.js` and
  `archive.js` — keep them in sync.
- **No PII in events.** NOSTR events are world-readable.
  Don't put email addresses, real names, or anything
  sensitive in the event tags. Use the Google-derived
  public key as the identity, the match id as the
  correlation key, and a `data_url` pointing at the
  admin's own Google Drive for the full JSON.
- **Recovery belongs in the helper, not the UI.** The
  UI doesn't surface "recovered from checkpoint"
  notifications in 0.4.5 — the user just sees the
  game as it was. Add a notification only if a future
  commit explicitly asks for one.

## Local-development verification

The dev sandbox can't bind TCP ports, so the only reliable
way to test changes against real data is via
https://zdenkor.github.io/gin-darts-scoring-sveltekit/. Use
the browser_navigate / browser_snapshot / browser_console
tools. If the page reports a stale version in the footer,
the GitHub Actions deploy failed — check the Actions log via
`https://api.github.com/repos/zdenkor/gin-darts-scoring-sveltekit/actions/runs`.

## When in doubt, ask

The user is not a coder — they read the running game, not the
code. When a question would require technical terms
(`D2 < 0`, `legWinEntryId`, `_idSeq`), rephrase as game
language: "you had X points, threw Y, expected a popup, got
nothing" — and ask for a concrete example before changing
anything. The user's instinct is the right starting point;
the agent's job is to translate it into code, not to
extrapolate.
