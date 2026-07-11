# Contributing to Gin's Dart's Scoring System

This file is the contributor guide. It tells humans and AI
coding agents (Hermes Agent, Claude Code, Cursor, Copilot, etc.)
how to write code that lands cleanly in this repo. Read it
**before** editing any code.

If you are an AI agent, also read [AGENTS.md](./AGENTS.md) — it
has the same rules plus agent-specific do/don'ts.

## Project shape

```
src/
  routes/                SvelteKit pages
    +layout.svelte       App shell, header, footer
    setup/               X01 setup screen
    competitions/        Competition list + create + detail + edit
    calendar/            NOSTR calendar (read-only)
    history/             Player history (NOSTR + local)
    settings/            App settings, admin, debug logs
    login/               Google sign-in
  lib/
    game/                Pure JS dart engine (X01 scoring)
    competition/         Tournament engine (elim, round-robin, league)
    auth/                Google OAuth, SVK registry
    db/                  IndexedDB wrapper, competitions, matches
    nostr/               NOSTR identity, calendar, history, checkpoint
    sync/                Yjs + y-webrtc + y-indexeddb (live sync)
    scoring/             League points table + standings
    debug/               Debug logger (IDB) + categories
    archive/             Archive upload (Drive + IPFS + NOSTR)
    util/                Settings, history, helpers
    ui/                  Reusable Svelte components
    state/               Svelte 5 runes stores
  app.html               Meta + viewport + theme color
  app.css                Global styles + tokens
static/                  Static assets, PWA icons, legacy app
```

## Engine rules — DO NOT modify

The dart engine lives in `src/lib/game/engine.js` and the
competition engine in `src/lib/competition/engine.js`. These
are the canonical state. They are **off-limits** for changes
that change behaviour, scoring, or wire format. Bug fixes
are fine; new features that need engine data must
**read** the engine's existing shape, not extend it.

If a feature really needs new engine data (e.g. a new
"checkoutAttempts" counter), the change must:
1. Add the field to the engine's return shape (one place).
2. Use it from the UI / a wrapper, never re-derive it.
3. Stay backwards-compatible with older saved games
   (the field can be `undefined`).

## Code style

- **Svelte 5 runes everywhere.** New code uses `$state`,
  `$derived`, `$effect`, `$props`, `$bindable`. No legacy
  `writable` stores.
- **Bits UI** (`bits-ui` v2) for select / listbox / dropdown
  primitives — see `src/lib/ui/Select.svelte`. Prefer that
  wrapper over native `<select>`.
- **Container queries**, not `@media`. Follow the existing
  pattern when adding a new screen; declare
  `container-type: inline-size` (or `size` for height-aware
  layouts) on the page root and use `cqi` / `cqb` in
  `clamp()` for fonts and padding.
- **Safe-area-inset** for header / footer on iOS notches
  and home indicators. Don't remove it.
- **Scoped CSS** inside `<style>` blocks per component.
  No global classes except in `app.css` (tokens + reset).
- **Two-space indent, no semicolons in .svelte** (Svelte's
  formatter handles the rest).

## Naming

- Files: `kebab-case.js` / `kebab-case.svelte`.
- Svelte components: `PascalCase.svelte` (e.g. `GameScreen.svelte`).
- Stores / runes: `camelCase` (e.g. `formName`).
- Constants: `UPPER_SNAKE` (e.g. `DEFAULT_RELAYS`).
- Test files: `*.test.js` co-located in `src/lib/<area>/`.

## Commit + version policy

This is the user-driven workflow. The user picks the
version and pushes. Agents must:

1. **One feature = one commit.** If a feature touches N
   files, do all of them in one commit. If the diff
   spans two features, split it with `git reset --soft
   HEAD~N` and re-commit.
2. **Bump `package.json` only when the user asks.** The
   user owns the version. Do not auto-bump on commit.
3. **`package.json` must match the commit message.** If
   the user says "commit 0.4.6", the version in
   `package.json` is **exactly** `0.4.6` in the same
   commit, every time.
4. **Never push without explicit user instruction.**
   Never use `--force`. Use `--force-with-lease` only
   if the user explicitly asks.
5. **`git fetch && git pull --ff-only` first** in
   multi-agent repos. Always.
6. **Assets** that the user pushed (screenshots, etc.)
   stay **untracked** unless the user authorises adding
   them.

## Verification

This repo's dev sandbox can't bind TCP ports. The only
reliable way to test changes against real data is
`https://zdenkor.github.io/gin-darts-scoring-sveltekit/`.
Use `browser_navigate` / `browser_snapshot` /
`browser_console`. If the page reports a stale version in
the footer, the GitHub Actions deploy failed — check the
Actions log via the GitHub API.

Before every commit:

```bash
npm run build      # must finish with "✔ done"
npm run check      # svelte-check; baseline is ~790 errors
```

The baseline is non-blocking. A commit that adds new
files may grow the count; the rule is **no new errors
beyond the file you added**. Use the count delta to
sanity-check that you didn't break something else.

## Decentralized infrastructure

- **NOSTR identity** is bound to the signed-in Google
  account. Don't add a random-keypair fallback for
  anonymous users.
- **Yjs / y-webrtc** is a broadcast channel, not a store.
  The engine is the source of truth. The Y.Map is just
  a fast peer-to-peer pipe.
- **NOSTR events are world-readable.** No PII in tags.
  Use the Google-derived public key as the identity, the
  match id as the correlation key, and a `data_url`
  pointing at the admin's own Google Drive for the full
  JSON.
- **Default relay list** lives in
  `src/lib/nostr/calendar.js` (`DEFAULT_RELAYS`). The
  same list is reused by `checkpoint.js` and
  `archive.js` — keep them in sync.
- **Archive uploads are fire-and-forget.** Network
  failures must never undo a finished game. Add new
  upload steps in the same try/catch style as the
  existing `archiveCompetition()` helper.

## Dart-specific conventions

- **X01** is the default game mode. The `start` is 301,
  401, 501, 701, or 1001. Engine validates
  double-out / double-in from `state.opts.out` /
  `state.opts.in`.
- **League** is a parent record that owns an array of
  `rounds[]`. Each round is a self-contained
  sub-tournament with its own date / location. The
  round name defaults to `(league name) — kolo (n)`.
- **Scoring** is editable per league via the Scoring
  tab in the wizard. The defaults are the canonical
  1-8 / 9-16 / 17-32 / 33-60 brackets (see
  `src/lib/scoring/points.js`).
- **Standings** are computed from the matches the
  engine already produced, in
  `src/lib/scoring/standings.js`. They are read-only.
- **Stats** are aggregated in `recordGameResult` in
  `src/lib/util/history.js` from the engine's
  `player.history[]` array. Every per-turn flag the
  engine sets (`is180`, `is171`, `isCheckout`, etc.)
  flows through to the lifetime stats.

## UI rules

The app scales from a 360px mobile viewport all the way to
a 4K TV (3840x2160). Two different design challenges have
to be solved together: **fluid layout scaling** (CSS) and
**lean state tracking** (Svelte 5).

### 1. Fluid typography — `clamp()` over media queries

Don't add endless media queries. Use a fluid scaling system
with `clamp()` and viewport units. Text, margins, and
padding then expand proportionally on their own:

```css
:root {
  /* Scales smoothly from mobile to 4K */
  --font-base: clamp(1rem, 0.8rem + 1vw, 2.5rem);
  --font-title: clamp(1.75rem, 1.2rem + 2.5vw, 6rem);
  --spacing-gap: clamp(1rem, 0.5rem + 2vw, 4rem);
  --container-padding: clamp(1rem, 2vw, 6rem);
}
body { font-size: var(--font-base); padding: var(--container-padding); }
h1 { font-size: var(--font-title); line-height: 1.1; }
```

On a 4K TV, `1vw` is 38.4px — the layout scales up
without looking swallowed by empty space.

### 2. Svelte 5 `MediaQuery` for structural changes

Pure CSS handles typography and structural layout, but
some UI swaps (e.g. mobile bottom-nav vs TV sidebar) need
reactive state. Use `MediaQuery` from `svelte/reactivity`:

```svelte
<script>
  import { MediaQuery } from 'svelte/reactivity';
  const is4KDisplay = new MediaQuery('min-width: 2560px');
</script>

{#if is4KDisplay.current}
  <div class="tv-dashboard">...</div>
{:else}
  <div class="standard-layout"><slot /></div>
{/if}
```

> **SSR warning.** SvelteKit renders on the server first
> without knowing the client's screen size. Default
> layouts must degrade gracefully (mostly pure CSS media
> queries) to avoid a visual flicker during hydration.

### 3. Image scaling — `@sveltejs/enhanced-img`

A 4K display needs high-resolution assets, but serving
those to a mobile device burns data. Use SvelteKit's
built-in image optimisation so the browser picks the
optimal resolution:

```svelte
<script>
  import heroImage from '$lib/assets/hero.jpg?enhanced';
</script>
<enhanced:img
  src={heroImage}
  alt="Hero"
  sizes="(min-width: 2560px) 3840px, (min-width: 1920px) 1920px, 100vw"
/>
```

### 4. TV D-pad navigation

On a Smart TV / Android TV wrapper, users don't tap — they
use a D-pad. Add explicit spatial-navigation focus state
so the focused element is visually loud:

```svelte
<script>
  let focusedIndex = $state(0);
  const items = ['Dashboard', 'Live Stats', 'History', 'Settings'];
  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') focusedIndex = (focusedIndex + 1) % items.length;
    else if (e.key === 'ArrowUp') focusedIndex = (focusedIndex - 1 + items.length) % items.length;
    else if (e.key === 'Enter') selectItem(items[focusedIndex]);
  }
</script>
<svelte:window onkeydown={handleKeyDown} />
{#each items as item, i}
  <button class="menu-item" class:focused={focusedIndex === i}>{item}</button>
{/each}

<style>
  .menu-item.focused {
    border-color: var(--accent);
    transform: scale(1.08);
    background: var(--surface);
  }
</style>
```

### 5. Tabs (responsive)

Tabs look great side-by-side on desktop, but on a 360px
mobile screen they don't fit. With Bits UI (low-level
primitives, no enforced CSS) you control the behaviour
yourself. Three patterns cover "very devices":

**Pattern 1 — horizontal scroll (simplest).** Tabs stay
side-by-side, the user scrolls them with a finger on
mobile. Hide the scrollbar so it looks native:

```svelte
<Tabs.Root value="tab1" class="w-full">
  <Tabs.List class="flex w-full flex-nowrap gap-2 overflow-x-auto border-b pb-px">
    <Tabs.Trigger value="tab1" class="whitespace-nowrap px-4 py-2 data-[state=active]:border-b-2">
      General
    </Tabs.Trigger>
    <!-- more triggers -->
  </Tabs.List>
  <Tabs.Content value="tab1" class="py-4">…</Tabs.Content>
</Tabs.Root>

<style>
  :global(.scrollbar-none::-webkit-scrollbar) { display: none; }
  :global(.scrollbar-none) { -ms-overflow-style: none; scrollbar-width: none; }
</style>
```

Key Tailwind classes: `overflow-x-auto`, `flex-nowrap`,
`whitespace-nowrap`.

**Pattern 2 — native `<select>` on mobile, tabs on
desktop.** Best UX when there are many tabs and you
don't want the user to scroll right forever. Bits UI
supports two-way `bind:value` so the same state drives
both UIs:

```svelte
<script>
  let activeTab = $state("general");
</script>

<!-- Mobile only -->
<div class="block md:hidden mb-4">
  <label for="tabs" class="sr-only">Section</label>
  <select id="tabs" bind:value={activeTab} class="w-full rounded-md border py-2 pl-3 pr-10">
    <option value="general">General</option>
    <option value="rules">Game rules</option>
    <option value="players">Players</option>
  </select>
</div>

<!-- Desktop / tablet (hidden on mobile) -->
<Tabs.Root bind:value={activeTab} class="w-full">
  <Tabs.List class="hidden md:flex border-b gap-4">
    <Tabs.Trigger value="general" class="px-4 py-2 data-[state=active]:border-b-2">General</Tabs.Trigger>
    <!-- more triggers -->
  </Tabs.List>
  <Tabs.Content value="general" class="py-4">…</Tabs.Content>
</Tabs.Root>
```

**Pattern 3 — vertical layout for tablets / landscape
monitors.** Move the tab list into a left sidebar,
content into the right column. Bits UI supports
`orientation="vertical"`:

```svelte
<Tabs.Root value="round1" orientation="vertical" class="flex flex-col md:grid md:grid-cols-12 gap-6 w-full">
  <Tabs.List class="flex md:flex-col flex-row overflow-x-auto md:overflow-x-visible gap-1 md:col-span-3 border-b md:border-b-0 md:border-r">
    <Tabs.Trigger value="round1" class="w-full text-left px-4 py-3 rounded-lg data-[state=active]:bg-blue-50">
      Round 1
    </Tabs.Trigger>
    <!-- more triggers -->
  </Tabs.List>
  <div class="md:col-span-9 w-full">
    <Tabs.Content value="round1">…</Tabs.Content>
  </div>
</Tabs.Root>
```

**Which to pick.** For brackets, schedules, stats
(where you need to see lots of data), **Pattern 1
(scroll)** or **Pattern 2 (mobile select)** is the
safest choice on any mobile display.

### 6. TV / Kiosk (Android TV, Google TV, Tizen, WebOS)

For a TV in a bar / club, or a scoreboard display,
the responsive rules flip entirely. The user is sitting
several metres away, has **no fingers** for scrolling and
**no mouse**. Either they use a D-pad remote, or the
display is **passive** (kiosk / dashboard) and rotates
through the info on its own.

**Passive mode — auto-rotating tabs.** When the TV
serves as a scoreboard, no one will click. The app
cycles through the tabs itself (e.g. Groups → Bracket
→ Standings → Live match). Bind the `activeTab` state
to a `setInterval` and Bits UI's `bind:value` does the
rest:

```svelte
<script>
  import { Tabs } from 'bits-ui';
  import { onMount } from 'svelte';

  const order = ['groups', 'bracket', 'standings'];
  let activeTab = $state('groups');

  onMount(() => {
    const id = setInterval(() => {
      const i = order.indexOf(activeTab);
      activeTab = order[(i + 1) % order.length];
    }, 8000); // rotate every 8 s
    return () => clearInterval(id);
  });
</script>

<Tabs.Root bind:value={activeTab} class="w-full text-xl">
  <Tabs.List class="flex justify-between border-b-2 bg-zinc-900 p-4">
    <Tabs.Trigger value="groups"    class="px-6 py-3 rounded-md data-[state=active]:bg-orange-600 data-[state=active]:text-white">Groups</Tabs.Trigger>
    <Tabs.Trigger value="bracket"   class="px-6 py-3 rounded-md data-[state=active]:bg-orange-600 data-[state=active]:text-white">Bracket</Tabs.Trigger>
    <Tabs.Trigger value="standings" class="px-6 py-3 rounded-md data-[state=active]:bg-orange-600 data-[state=active]:text-white">Standings</Tabs.Trigger>
  </Tabs.List>
  <div class="p-8 text-2xl">
    <Tabs.Content value="groups">…</Tabs.Content>
    <Tabs.Content value="bracket">…</Tabs.Content>
    <Tabs.Content value="standings">…</Tabs.Content>
  </div>
</Tabs.Root>
```

**Active mode — D-pad navigation.** When the user IS
navigating with a D-pad remote (e.g. Android TV box):

- **Keep orientation.** Bits UI maps left/right arrow
  keys to tab switching on a horizontal list out of
  the box. Don't fight it.
- **`activationMode="manual"`.** Default mode activates
  a tab the moment it receives focus — that re-renders
  the heavy content (e.g. a whole bracket) on every
  arrow press. With `manual` the user navigates freely
  and confirms with `OK / Enter`.
- **Massive focus state.** A 2-px outline is invisible
  from 3 m. Use a thick ring + background change.

```svelte
<Tabs.Root value="board1" activationMode="manual" class="w-full">
  <Tabs.List class="flex gap-4 bg-zinc-950 p-3 rounded-xl">
    <Tabs.Trigger
      value="board1"
      class="px-8 py-4 text-xl font-bold rounded-lg outline-none
             focus-visible:ring-4 focus-visible:ring-orange-500 focus-visible:text-white focus-visible:bg-zinc-800
             data-[state=active]:bg-orange-600 data-[state=active]:text-white"
    >Board 1 (Live)</Tabs.Trigger>
    <Tabs.Trigger
      value="board2"
      class="px-8 py-4 text-xl font-bold rounded-lg outline-none
             focus-visible:ring-4 focus-visible:ring-orange-500 focus-visible:text-white focus-visible:bg-zinc-800
             data-[state=active]:bg-orange-600 data-[state=active]:text-white"
    >Board 2 (Live)</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="board1" class="p-6 text-white">…</Tabs.Content>
  <Tabs.Content value="board2" class="p-6 text-white">…</Tabs.Content>
</Tabs.Root>
```

**TV-specific rules at a glance:**

- **Scale the text up.** Swap `text-sm` / `text-base`
  for `text-xl` / `text-2xl` / `text-4xl`. TV design
  is huge by design.
- **Dark UI.** TVs in bright rooms (bars, clubs) burn
  retinas and pixels with light themes. Use high-contrast
  text on a dark surface (`bg-zinc-950`).

## UI rules — Checklist

- [ ] Don't hardcode fixed dimensions: Use percentages, fr units (CSS Grid), or flex-basis for layout blocks.
- [ ] Limit layout widths: On a 4K TV, lines of text can stretch infinitely, ruining text readability. Set a maximum readable container width (e.g., max-width: 1800px; margin: 0 auto;) for standard prose pages, or pivot to multi-column grids.
- [ ] Test with browser zoom: You don't need a physical 4K TV to test this. Open Chrome/Firefox DevTools, set your device emulation resolution to 3840x2160, and scale the zoom down to fit your current monitor.
- [ ] Tabs use Pattern 1 / 2 / 3 — never let them overflow off-screen on a 360px viewport.

## When in doubt

The user is not a coder — they read the running game, not
the code. When a question would require technical terms
(`D2 < 0`, `legWinEntryId`, `_idSeq`), rephrase as game
language: "you had X points, threw Y, expected a popup,
got nothing" — and ask for a concrete example before
changing anything. The user's instinct is the right
starting point; the agent's job is to translate it into
code, not to extrapolate.
