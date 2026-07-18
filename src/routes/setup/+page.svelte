<script>
	import { base } from '$app/paths';
	import { X01_IN_OPTIONS, X01_OUT_OPTIONS } from '$lib/game/engine.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';
	import Select from '$lib/ui/Select.svelte';

	const START_OPTIONS = [301, 401, 501, 701, 1001];
	const BOT_NAME_FOR = (lvl) => `DartBot Level ${lvl}`;
	const BOT_LEVELS = Array.from({ length: 15 }, (_, n) => n + 1);

	// Forbidden human names: anything containing "DartBot" (case-insensitive),
	// the canonical bot names (DartBot Level 1..15), or the bare "Level N" form.
	function isForbiddenHumanName(raw) {
		const v = String(raw || '');
		if (/DartBot/i.test(v)) return true;
		const trimmed = v.trim().toLowerCase();
		for (const lvl of BOT_LEVELS) {
			if (trimmed === BOT_NAME_FOR(lvl).toLowerCase()) return true;
		}
		if (/^Level\s+([1-9]|1[0-5])$/i.test(v.trim())) return true;
		return false;
	}

	let players = $state([
		{ name: 'Gin', isBot: false, originalName: 'Gin', botLevel: 5 },
		{ name: 'Alex', isBot: true, originalName: 'Player 2', botLevel: 5 }
	]);
	let start = $state(501);
	let inRule = $state('single');
	let outRule = $state('double');
	let legsToWin = $state(1);
	let setsToWin = $state(1);

	function addPlayer() {
		if (players.length < 4) {
			const newName = `Player ${players.length + 1}`;
			players = [...players, { name: newName, isBot: false, originalName: newName, botLevel: 5 }];
		}
	}
	function removePlayer(index) {
		players = players.filter((_, i) => i !== index);
	}
	function updateName(index, value) {
		if (players[index].isBot) return;
		if (isForbiddenHumanName(value)) {
			// Roll back the DOM input to the current model value.
			const el = /** @type {HTMLInputElement|null} */ (document.querySelectorAll('.player-row input[type=text]')[index]);
			if (el && el.value !== players[index].name) el.value = players[index].name;
			return;
		}
		players = players.map((p, i) => i === index
			? { ...p, name: value, originalName: value }
			: p
		);
	}
	function toggleBot(index) {
		// Anti-spam guard: never allow the last human player to flip to
		// a bot, otherwise the match runs unattended on bot vs bot.
		const nonBotCount = players.filter(p => !p.isBot).length;
		const target = players[index];
		if (target && !target.isBot && nonBotCount <= 1) return;
		players = players.map((p, i) => {
			if (i !== index) return p;
			if (p.isBot) {
				// bot → human: restore originalName, default to "Player N" if missing
				const restored = (p.originalName || `Player ${i + 1}`).trim() || `Player ${i + 1}`;
				return { ...p, isBot: false, name: restored, originalName: restored };
			} else {
				// human → bot: capture current name as originalName, set canonical bot name
				const lvl = p.botLevel ?? 5;
				return { ...p, isBot: true, botLevel: lvl, name: BOT_NAME_FOR(lvl), originalName: p.originalName || p.name };
			}
		});
	}

	const allBots = $derived(players.length > 0 && players.every(p => p.isBot));
	const nonBotCount = $derived(players.filter(p => !p.isBot).length);
	function updateBotLevel(index, value) {
		const lvl = Number(value);
		players = players.map((p, i) => i === index
			? { ...p, botLevel: lvl, name: BOT_NAME_FOR(lvl) }
			: p
		);
	}

	function gameUrl() {
		const entries = players
			.map(p => ({ name: p.name.trim(), isBot: p.isBot, botLevel: p.botLevel ?? 5 }))
			.filter(p => p.name);
		if (entries.length < 1) return null;
		const params = new URLSearchParams({
			names: entries.map(p => p.name).join(','),
			bots: entries.map(p => (p.isBot ? String(p.botLevel) : '')).join(','),
			start: String(start),
			in: inRule,
			out: outRule,
			legs: String(legsToWin),
			sets: String(setsToWin)
		});
		return `${base}/game/?${params.toString()}`;
	}
	let url = $derived(gameUrl());
</script>

<div class="screen setup-screen scrollable">
	<div class="card">
		<h1>New X01 game</h1>

		<div class="section">
			<h2>Players</h2>
			{#each players as p, i}
				<div class="player-row" class:bot-row={p.isBot}>
					<span class="player-num">P{i + 1}</span>
					{#if p.isBot}
							<Select
								bind:value={p.botLevel}
								options={BOT_LEVELS.map(l => ({ value: l, label: BOT_NAME_FOR(l) }))}
								placeholder={BOT_NAME_FOR(p.botLevel || 5)}
								ariaLabel="Bot level"
								className="bot-level-select"
							/>
					{:else}
						<input
							id="player-name-{i}"
							name="player-name"
							type="text"
							value={p.name}
							oninput={(e) => updateName(i, e.currentTarget.value)}
							placeholder={`Player ${i + 1}`}
						/>
					{/if}
					<!-- Dartbot on/off toggle (text button, classic click-effect).
					     aria-pressed announces state to screen readers; class:active
					     drives the colour. -->
					<button
						type="button"
						class="bot-toggle-btn"
						class:active={p.isBot}
						onclick={() => toggleBot(i)}
						aria-pressed={p.isBot}
						disabled={!p.isBot && nonBotCount <= 1}
						title={!p.isBot && nonBotCount <= 1
							? 'At least one human player is required'
							: (p.isBot ? 'Switch to human' : 'Switch to bot')}
					>
						{p.isBot ? 'Bot ON' : 'Bot OFF'}
					</button>
					{#if players.length > 1}
						<button class="btn ghost" type="button" onclick={() => removePlayer(i)} aria-label="Remove player">✕</button>
					{/if}
				</div>
			{/each}
			{#if players.length < 4}
				<button class="btn ghost add-btn" type="button" onclick={addPlayer}>+ Add player</button>
			{/if}
		</div>

		<div class="section">
			<h2>Game options</h2>
			<div class="field">
				<label>Start score<HelpIcon topic="Start score" body="The score each player begins with. Lower numbers make games faster; 501 is the classic start. 170 is a single-dart training preset (one max-dart throw to check out). 1001 is a long format." /></label>
				<div class="option-row">
					{#each START_OPTIONS as opt}
						<button
							class="btn kind-option"
							class:primary={start === opt}
							type="button"
							onclick={() => start = opt}
						>
							{opt}
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<label>In rule<HelpIcon topic="In rule" body="SI (Single In) is the default if nothing is selected — any dart opens scoring.\n\n• DI = Double In — a double opens scoring.\n• MI = Master In — a double or bull opens scoring.\n• TI = Triple In — a triple opens scoring.\n\nSI is hidden from the picker; legacy saved games still work." /></label>
				<Select bind:value={inRule} options={X01_IN_OPTIONS} ariaLabel="In rule" />
			</div>

			<div class="field">
				<label>Out rule<HelpIcon topic="Out rule" body="SO (Single Out) is the default if nothing is selected — any dart can finish.\n\n• DO = Double Out — finish on a double (D1..D20 or D-Bull). Standard x01.\n• MO = Master Out — finish on a double, triple, or D-Bull.\n• TO = Triple Out — finish on a triple or D-Bull.\n\nSO is hidden from the picker; DO is pre-selected as the standard x01 default." /></label>
				<Select bind:value={outRule} options={X01_OUT_OPTIONS} ariaLabel="Out rule" />
			</div>

			<div class="field-row">
				<div class="field">
					<label>Legs to win<HelpIcon topic="Legs to win" body="How many legs a player must win to take the set. The first to reach this count wins." /></label>
					<input id="legs-to-win" name="legs-to-win" type="number" min="1" max="99" bind:value={legsToWin} />
					</div>

				<div class="field">
					<label>Sets to win<HelpIcon topic="Sets to win" body="How many sets a player must win to take the match. The first to reach this count wins." /></label>
					<input id="sets-to-win" name="sets-to-win" type="number" min="1" max="99" bind:value={setsToWin} />
					</div>
			</div>
		</div>

		<div class="actions">
			<a class="btn ghost" href="{base}/">Cancel</a>
			{#if url}
				<a class="btn primary" href={url}>Start game</a>
			{:else}
				<button class="btn primary" type="button" disabled>Start game</button>
			{/if}
		</div>
	</div>
</div>
<style>
	.setup-screen {
		container-type: inline-size;
		container-name: setup;
		padding: clamp(0.75rem, 4cqi, 2rem);
		padding-bottom: clamp(2rem, 8cqi, 4rem);
		box-sizing: border-box;
		width: 100%;
		max-width: 100%;
	}
	.setup-screen h1 {
		margin: 0 0 var(--space-md);
		font-size: clamp(1.5rem, 4cqi, 4rem);
	}
	.setup-screen :global(.card) {
		padding: clamp(0.75rem, 3cqi, 2rem);
		padding-bottom: clamp(2rem, 6cqi, 3rem);
	}
	.setup-screen h2 {
		margin: 0 0 var(--space-sm);
		font-size: clamp(1rem, 2.5cqi, 2rem);
		color: var(--muted);
	}
	.section {
		margin-bottom: clamp(0.75rem, 3cqi, 2rem);
	}
	.player-row {
		display: flex;
		align-items: center;
		gap: clamp(0.4rem, 1.5cqi, 1rem);
		margin-bottom: clamp(0.4rem, 1.5cqi, 1rem);
		/* Players row: P label | name input | Bot ON/OFF | ✕
		   (and the level <select> when bot is on, between
		   the input and the toggle). The input is the only
		   thing that grows; the toggle and the remove button
		   stay compact on the right edge. We disabled
		   flex-wrap so a long row never breaks the toggle
		   away from its player. */
		flex-wrap: nowrap;
	}
	.player-row.bot-row {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
		border-radius: var(--radius);
		padding: clamp(0.3rem, 1cqi, 0.6rem);
	}
	.player-num {
		font-weight: 700;
		color: var(--accent);
		min-width: 2em;
		font-size: clamp(1rem, 2cqi, 1.5rem);
		flex: 0 0 auto;
	}
	.player-row input {
		flex: 1 1 8em;
		min-width: 0;
		font-size: clamp(0.9rem, 1.8cqi, 1.4rem);
		padding: clamp(0.4rem, 1.2cqi, 0.8rem);
	}
	.bot-level-select {
		/* Compact, fixed-size select for the bot level
		   picker. Sits between the name input and the
		   Bot ON/OFF toggle. Background is opaque so the
		   dropdown options are readable on dark theme.
		   The inner trigger from src/lib/ui/Select.svelte
		   ships with width: 100%, which would expand the
		   trigger to fill the wrapper — we override it to
		   the wrapper's width here so the trigger stays
		   the same size as the wrapper. */
		flex: 0 1 12em;
		min-width: 8em;
		max-width: 14em;
		font-size: clamp(0.9rem, 1.8cqi, 1.4rem);
		padding: clamp(0.4rem, 1.2cqi, 0.8rem);
		background: var(--bg, #1a1f2b);
		color: var(--text, #e6ebf2);
		border: 1px solid var(--line, #2c3343);
		border-radius: var(--radius, 8px);
	}
	.bot-level-select :global(.sel-trigger) {
		/* The trigger inside the Bits UI Select wrapper
		   wants width: 100% by default; constrain it to
		   the wrapper's width so the row layout (P | sel |
		   Bot ON | ✕) keeps its right edge. */
		width: auto;
		min-width: 8em;
	}
	.bot-toggle-btn {
		/* Stay on the right edge, never shrink, never
		   wrap onto a second line. */
		flex: 0 0 auto;
		white-space: nowrap;
	}
	.player-row > .btn.ghost {
		/* The ✕ remove button needs the same compact
		   treatment — otherwise flex tries to grow it
		   like the name input and pushes the toggle off
		   the right edge of the row. */
		flex: 0 0 auto;
	}
	.add-btn {
		width: 100%;
		font-size: clamp(0.9rem, 1.8cqi, 1.4rem);
	}
	.option-row {
		display: flex;
		flex-wrap: wrap;
		gap: clamp(0.4rem, 1.5cqi, 1rem);
	}
	.kind-option {
		flex: 1 1 80px;
		font-size: clamp(0.95rem, 2cqi, 1.6rem);
		padding: clamp(0.5rem, 1.5cqi, 1rem);
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: clamp(0.5rem, 2cqi, 1.5rem);
	}
	.field label {
		font-size: clamp(0.85rem, 1.6cqi, 1.2rem);
	}
	.field select,
	.field input {
		font-size: clamp(0.95rem, 1.8cqi, 1.4rem);
		padding: clamp(0.4rem, 1.2cqi, 0.8rem);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: clamp(0.5rem, 2cqi, 1.5rem);
		margin-top: clamp(1rem, 4cqi, 2.5rem);
	}
	.actions a, .actions .btn {
		font-size: clamp(0.95rem, 2cqi, 1.6rem);
		padding: clamp(0.6rem, 1.8cqi, 1.2rem);
		text-decoration: none;
	}
	@container setup (max-width: 28rem) {
		.field-row { grid-template-columns: 1fr; }
		.actions { flex-direction: column; }
		.player-row { flex-direction: column; align-items: stretch; }
		.player-row input,
		.bot-level-select { width: 100%; }
		.bot-toggle-btn { width: 100%; }
	}
	@container setup (min-width: 60rem) {
		.field-row { grid-template-columns: 1fr 1fr 1fr; }
	}

/* Dartbot on/off toggle. aria-pressed carries the binary state
   to assistive tech; the visible colour flips via .active.
   Same focus / hover guards as the calc buttons so the
   pressed state clears on mobile. */
.bot-toggle-btn {
	padding: 0.5rem 1rem;
	font-weight: 700;
	font-size: var(--text-sm);
	letter-spacing: 0.05em;
	border: 2px solid var(--danger);
	border-radius: 8px;
	background-color: var(--danger);
	color: #2a070c;
	cursor: pointer;
	transition: background-color .15s ease, border-color .15s ease, transform .08s ease;
	min-height: 36px;
}
.bot-toggle-btn:focus { outline: none; -webkit-tap-highlight-color: transparent; }
.bot-toggle-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (hover: hover) {
	.bot-toggle-btn:hover { filter: brightness(1.1); }
}
.bot-toggle-btn:active { transform: scale(0.95); }
.bot-toggle-btn.active {
	background-color: var(--accent);
	border-color: var(--accent);
	color: #062018;
}
</style>
