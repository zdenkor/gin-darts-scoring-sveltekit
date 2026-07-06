<script>
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { X01_IN_OPTIONS, X01_OUT_OPTIONS } from '$lib/game/engine.js';

	const START_OPTIONS = [301, 401, 501, 701, 1001];

	let players = $state(['Gin', 'Alex']);
	let start = $state(501);
	let inRule = $state('single');
	let outRule = $state('double');
	let legsToWin = $state(1);
	let setsToWin = $state(1);

	function addPlayer() {
		if (players.length < 4) players = [...players, `Player ${players.length + 1}`];
	}
	function removePlayer(index) {
		players = players.filter((_, i) => i !== index);
	}
	function updateName(index, value) {
		players = players.map((n, i) => i === index ? value : n);
	}

	function startGame() {
		const names = players.map(n => n.trim()).filter(Boolean);
		if (names.length < 1) return;
		const params = new URLSearchParams({
			names: names.join(','),
			start: String(start),
			in: inRule,
			out: outRule,
			legs: String(legsToWin),
			sets: String(setsToWin)
		});
		goto(`${base}/game?${params.toString()}`);
	}
</script>

<div class="screen setup-screen">
	<div class="card">
		<h1>New X01 game</h1>

		<div class="section">
			<h2>Players</h2>
			{#each players as name, i}
				<div class="player-row">
					<span class="player-num">P{i + 1}</span>
					<input
						type="text"
						value={name}
						oninput={(e) => updateName(i, e.currentTarget.value)}
						placeholder={`Player ${i + 1}`}
					/>
					{#if players.length > 1}
						<button class="btn ghost" type="button" onclick={() => removePlayer(i)}>✕</button>
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
			<button class="btn primary" type="button" onclick={startGame}>Start game</button>
		</div>
	</div>
</div>

<style>
	.setup-screen h1 {
		margin: 0 0 var(--space-md);
		font-size: var(--text-xl);
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
	.player-num {
		font-weight: 700;
		color: var(--accent);
		min-width: 2em;
	}
	.player-row input {
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
</style>
