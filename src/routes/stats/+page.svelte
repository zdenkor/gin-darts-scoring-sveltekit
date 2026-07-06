<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { loadGameHistory } from '$lib/util/history.js';
	import { computeStats, listPlayers, listScopes, fmt } from '$lib/game/stats.js';

	const url = $derived($page.url);
	const newGame = $derived(!!url.searchParams.get('newGame'));

	let history = $state([]);
	let loading = $state(true);
	let selectedPlayer = $state('');
	let selectedScope = $state('all-time');
	let stats = $state(null);

	const scopes = [
		{ id: 'all-time', label: 'All time' },
		{ id: 'standalone', label: 'Standalone matches' },
	];

	async function refresh() {
		history = await loadGameHistory();
		const players = listPlayers(history);
		if (!selectedPlayer && players.length) selectedPlayer = players[0];
		loading = false;
	}

	$effect(() => {
		if (!selectedPlayer) {
			stats = null;
			return;
		}
		const scopeDef = scopes.find(s => s.id === selectedScope);
		stats = computeStats(selectedPlayer, history, { type: selectedScope });
	});

	onMount(refresh);

	function back() {
		goto(`${base}/`);
	}

	function formatAvg(n) {
		return fmt(n, { decimals: 2 });
	}

	function scopeList() {
		const { leagues, tournaments, matches } = listScopes(history);
		return [
			...scopes,
			...leagues.map(l => ({ id: `league:${l.id}`, label: `League: ${l.name}` })),
			...tournaments.map(t => ({ id: `tournament:${t.id}`, label: `Tournament: ${t.name}` })),
			...matches.map(m => ({ id: `match:${m.id}`, label: `Match: ${m.name}` })),
		];
	}

	function onScopeChange(id) {
		selectedScope = id;
	}

	const showWelcome = $derived(newGame && !loading && history.length === 0);
</script>

<div class="screen">
	<div class="card">
		<div class="card-header">
			<h1>Statistics</h1>
			<button class="btn ghost" onclick={back}>Back</button>
		</div>

		{#if showWelcome}
			<div class="welcome">
				<strong>First match finished!</strong>
				<p>Your stats will appear here after every completed game.</p>
			</div>
		{/if}

		{#if loading}
			<p class="muted">Loading stats…</p>
		{:else if history.length === 0}
			<p class="muted">No finished games yet. Play a match to see player stats.</p>
		{:else}
			<div class="filters">
				<label class="field">
					<span>Player</span>
					<select bind:value={selectedPlayer}>
						{#each listPlayers(history) as p}
							<option value={p}>{p}</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span>Scope</span>
					<select value={selectedScope} onchange={(e) => onScopeChange(e.target.value)}>
						{#each scopeList() as s}
							<option value={s.id}>{s.label}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if stats}
				<div class="stats-grid">
					<div class="stat">
						<span class="stat-value">{stats.games}</span>
						<span class="stat-label">Games</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.matchesWon}</span>
						<span class="stat-label">Matches won</span>
					</div>
					<div class="stat highlight">
						<span class="stat-value">{formatAvg(stats.average)}</span>
						<span class="stat-label">Average</span>
					</div>
					<div class="stat">
						<span class="stat-value">{formatAvg(stats.first9Average)}</span>
						<span class="stat-label">First 9</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.count100Plus}</span>
						<span class="stat-label">100+</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.count140Plus}</span>
						<span class="stat-label">140+</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.count180}</span>
						<span class="stat-label">180s</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.highestCheckout}</span>
						<span class="stat-label">Highest checkout</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.legsWon}/{stats.legsPlayed}</span>
						<span class="stat-label">Legs won/played</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.bestLegDarts || '–'}</span>
						<span class="stat-label">Best leg (darts)</span>
					</div>
				</div>

				<div class="stat-section">
					<h3>Throwing order</h3>
					<div class="stats-grid small">
						<div class="stat">
							<span class="stat-value">{formatAvg(stats.withThrowAverage)}</span>
							<span class="stat-label">With throw</span>
						</div>
						<div class="stat">
							<span class="stat-value">{formatAvg(stats.againstThrowAverage)}</span>
							<span class="stat-label">Against throw</span>
						</div>
						<div class="stat">
							<span class="stat-value">{fmt(stats.legsWonFirstPcnt, { decimals: 1 })}%</span>
							<span class="stat-label">Won throwing first</span>
						</div>
						<div class="stat">
							<span class="stat-value">{fmt(stats.legsWonSecondPcnt, { decimals: 1 })}%</span>
							<span class="stat-label">Won throwing second</span>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.filters {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	@container (min-width: 480px) {
		.filters {
			grid-template-columns: 1fr 1fr;
		}
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.field select {
		background: var(--bg);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 10px;
		padding: var(--space-sm);
		font-size: var(--text-md);
	}
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-sm);
	}
	@container (min-width: 560px) {
		.stats-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@container (min-width: 800px) {
		.stats-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.stats-grid.small {
		grid-template-columns: repeat(2, 1fr);
	}
	.stat {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm);
		text-align: center;
	}
	.stat.highlight {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
	}
	.stat-value {
		display: block;
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text);
	}
	.stat-label {
		font-size: var(--text-xs);
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.stat-section {
		margin-top: var(--space-md);
	}
	.stat-section h3 {
		font-size: var(--text-sm);
		color: var(--muted);
		margin-bottom: var(--space-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.welcome {
		background: var(--accent);
		color: #062018;
		padding: var(--space-md);
		border-radius: var(--radius);
		margin-bottom: var(--space-md);
	}
	.welcome p { margin: 0; }
	.muted { color: var(--muted); }
</style>
