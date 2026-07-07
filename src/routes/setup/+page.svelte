<script>
	import { base } from '$app/paths';
	import { X01_IN_OPTIONS, X01_OUT_OPTIONS } from '$lib/game/engine.js';

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
						<select
							value={p.botLevel}
							onchange={(e) => updateBotLevel(i, e.currentTarget.value)}
							class="bot-level-select"
							aria-label="Bot level"
						>
							{#each BOT_LEVELS as lvl}
								<option value={lvl}>{BOT_NAME_FOR(lvl)}</option>
							{/each}
						</select>
					{:else}
						<input
							type="text"
							value={p.name}
							oninput={(e) => updateName(i, e.currentTarget.value)}
							placeholder={`Player ${i + 1}`}
						/>
					{/if}
					<button
						type="button"
						class="btn ghost"
						class:active={p.isBot}
						onclick={() => toggleBot(i)}
						title={p.isBot ? 'Switch to human' : 'Switch to bot'}
						aria-label={p.isBot ? 'Switch to human' : 'Switch to bot'}
					>
						🤖
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
				<label>Start score</label>
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
				<label>In rule</label>
				<select bind:value={inRule}>
					{#each Object.entries(X01_IN_OPTIONS) as [key, opt]}
						<option value={key}>{opt.label} — {opt.desc}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label>Out rule</label>
				<select bind:value={outRule}>
					{#each Object.entries(X01_OUT_OPTIONS) as [key, opt]}
						<option value={key}>{opt.label} — {opt.desc}</option>
					{/each}
				</select>
			</div>

			<div class="field-row">
				<div class="field">
					<label>Legs to win</label>
					<input type="number" min="1" max="99" bind:value={legsToWin} />
				</div>

				<div class="field">
					<label>Sets to win</label>
					<input type="number" min="1" max="99" bind:value={setsToWin} />
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
	.setup-screen h1 {
		margin: 0 0 var(--space-md);
		font-size: var(--text-xl);
	}
	.setup-screen {
		padding: var(--space-md);
		box-sizing: border-box;
	}
	.setup-screen h2 {
		margin: 0 0 var(--space-sm);
		font-size: var(--text-lg);
		color: var(--muted);
	}
	.section {
		margin-bottom: var(--space-lg);
	}
	.player-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	.player-row.bot-row {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
		border-radius: var(--radius);
		padding: var(--space-xs);
	}
	.player-num {
		font-weight: 700;
		color: var(--accent);
		min-width: 2em;
	}
	.player-row input {
		flex: 1;
	}
	.bot-level-select {
		flex: 1;
	}
	.add-btn {
		width: 100%;
	}
	.option-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.kind-option {
		flex: 1 1 80px;
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-md);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-md);
		margin-top: var(--space-lg);
	}
	.actions a { text-decoration: none; }
@container app (max-width: 400px) {
	.field-row { grid-template-columns: 1fr; }
	.actions { flex-direction: column; }
}
@media (min-width: 80rem) {
	.setup-screen h1 { font-size: clamp(2rem, 3vw, 3rem); }
	.setup-screen h2 { font-size: var(--text-xl); }
	.player-row { gap: var(--space-md); }
	.option-row { gap: var(--space-md); }
	.actions { gap: var(--space-lg); }
}
@media (min-width: 120rem) {
	.setup-screen h1 { font-size: clamp(2.5rem, 3.5vw, 4rem); }
}
@media (orientation: landscape) and (max-height: 500px) {
	.setup-screen h1 { font-size: var(--text-lg); margin-bottom: var(--space-sm); }
	.section { margin-bottom: var(--space-md); }
	.player-row { margin-bottom: var(--space-xs); }
}
</style>
