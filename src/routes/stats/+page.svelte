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
	let expandedMatchId = $state(/** @type {string|null} */ (null));

	// Group rawDarts into per-leg rows for the match-history view.
	// rawDarts is a flat log of { by, total, darts, isLegWin,
	// isCheckout, bust } events; we group consecutive non-endLeg
	// events until an endLeg marker.
	function legsOf(entry) {
		const raw = entry.rawDarts || [];
		const legs = [];
		let cur = [];
		for (const ev of raw) {
			if (ev.endLeg) {
				legs.push(cur);
				cur = [];
			} else if (ev.total != null || ev.segments != null) {
				cur.push(ev);
			}
		}
		if (cur.length) legs.push(cur);
		return legs;
	}

	function playerName(entry, idx) {
		return (entry.players && entry.players[idx]) || `Player ${idx + 1}`;
	}

	function turnLabel(ev) {
		if (ev.bust) return 'BUST';
		if (ev.isLegWin) return `LEG WIN ${ev.total}`;
		return `${ev.total}`;
	}

	// Busts aren't returned by computeStats — derive them from the
	// rawDarts event log so the UI can show the count per player.
	const busts = $derived.by(() => {
		const out = {};
		for (const g of history) {
			for (const ev of g.rawDarts || []) {
				if (ev.bust && ev.by) out[ev.by] = (out[ev.by] || 0) + 1;
			}
		}
		return out;
	});

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

	function pct(n) {
		return n != null ? `${fmt(n, { decimals: 1 })}%` : '—';
	}

	function intOrDash(n) {
		return n ? fmt(n, { integer: true }) : '–';
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

<div class="screen scrollable">
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
					<div class="stat highlight">
						<span class="stat-value">{stats.games}</span>
						<span class="stat-label">Games</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.matchesWon}</span>
						<span class="stat-label">Matches won</span>
					</div>
				</div>

				<div class="stat-section">
					<h3>Averages</h3>
					<div class="stats-grid">
						<div class="stat"><span class="stat-value">{formatAvg(stats.average)}</span><span class="stat-label">Average</span></div>
						<div class="stat"><span class="stat-value">{formatAvg(stats.first3Average)}</span><span class="stat-label">First 3</span></div>
						<div class="stat"><span class="stat-value">{formatAvg(stats.first9Average)}</span><span class="stat-label">First 9</span></div>
						<div class="stat"><span class="stat-value">{formatAvg(stats.withThrowAverage)}</span><span class="stat-label">With throw</span></div>
						<div class="stat"><span class="stat-value">{formatAvg(stats.againstThrowAverage)}</span><span class="stat-label">Against throw</span></div>
						<div class="stat"><span class="stat-value">{formatAvg(stats.maxAverage)}</span><span class="stat-label">Max average</span></div>
					</div>
				</div>

				<div class="stat-section">
					<h3>High turns</h3>
					<div class="stats-grid">
						<div class="stat"><span class="stat-value">{fmt(stats.count180, { integer: true })}</span><span class="stat-label">180s</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.count171, { integer: true })}</span><span class="stat-label">171s</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.count170Plus, { integer: true })}</span><span class="stat-label">170+</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.count140Plus, { integer: true })}</span><span class="stat-label">140+</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.count100Plus, { integer: true })}</span><span class="stat-label">100+</span></div>
					</div>
				</div>

				<div class="stat-section">
					<h3>Checkouts</h3>
					<div class="stats-grid">
						<div class="stat highlight"><span class="stat-value">{intOrDash(stats.highestCheckout)}</span><span class="stat-label">Highest checkout</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.checkout100Plus, { integer: true })}</span><span class="stat-label">Checkout 100+</span></div>
						<div class="stat"><span class="stat-value">{pct(stats.legsWonCheckoutPcnt)}</span><span class="stat-label">Checkout %</span></div>
					</div>
				</div>

				<div class="stat-section">
					<h3>Legs</h3>
					<div class="stats-grid">
						<div class="stat"><span class="stat-value">{fmt(stats.legsWon, { integer: true })}</span><span class="stat-label">Legs won</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.legsPlayed, { integer: true })}</span><span class="stat-label">Legs played</span></div>
						<div class="stat"><span class="stat-value">{pct(stats.legsWonPcnt)}</span><span class="stat-label">Legs won %</span></div>
						<div class="stat"><span class="stat-value">{intOrDash(stats.bestLegDarts)}</span><span class="stat-label">Best leg (darts)</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.legsTo9, { integer: true })}</span><span class="stat-label">Legs to 9</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.legsTo12, { integer: true })}</span><span class="stat-label">Legs to 12</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.legsTo15, { integer: true })}</span><span class="stat-label">Legs to 15</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.legsTo18, { integer: true })}</span><span class="stat-label">Legs to 18</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.legsTo21, { integer: true })}</span><span class="stat-label">Legs to 21</span></div>
					</div>
				</div>

				<div class="stat-section">
					<h3>Throwing order</h3>
					<div class="stats-grid">
						<div class="stat"><span class="stat-value">{fmt(stats.legsThrowingFirst, { integer: true })}</span><span class="stat-label">Legs throwing first</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.legsThrowingSecond, { integer: true })}</span><span class="stat-label">Legs throwing second</span></div>
						<div class="stat"><span class="stat-value">{pct(stats.legsWonFirstPcnt)}</span><span class="stat-label">% Won throwing first</span></div>
						<div class="stat"><span class="stat-value">{pct(stats.legsWonSecondPcnt)}</span><span class="stat-label">% Won throwing second</span></div>
					</div>
				</div>

				<div class="stat-section">
					<h3>Totals</h3>
					<div class="stats-grid">
						<div class="stat"><span class="stat-value">{fmt(stats.numberOfDarts, { integer: true })}</span><span class="stat-label">Number of darts</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.totalPoints, { integer: true })}</span><span class="stat-label">Total points</span></div>
						<div class="stat"><span class="stat-value">{fmt(stats.matchesWon, { integer: true })}</span><span class="stat-label">Nights won</span></div>
						<div class="stat"><span class="stat-value">{formatAvg(stats.maxAverage)}</span><span class="stat-label">Max average of matches</span></div>
						<div class="stat"><span class="stat-value">{fmt(busts[selectedPlayer] || 0, { integer: true })}</span><span class="stat-label">Busts</span></div>
					</div>
				</div>

				<div class="stat-section">
					<h3>Match history</h3>
					<p class="muted small">Click a match to see how each leg progressed.</p>
					{#if history.length === 0}
						<p class="muted">No matches recorded yet.</p>
					{:else}
						<div class="match-list">
							{#each history as m (m.id)}
								{@const isOpen = expandedMatchId === m.id}
								{@const ms = legsOf(m)}
								<div class="match-row" class:open={isOpen}>
									<button
										type="button"
										class="match-summary"
										onclick={() => (expandedMatchId = isOpen ? null : m.id)}
										aria-expanded={isOpen}
									>
										<span class="match-name">{m.players?.join(' vs ') || 'Match'}</span>
										<span class="match-meta">
											{#if m.startScore}<span class="badge">{m.startScore}</span>{/if}
											{#if m.outRule}<span class="badge">{m.outRule}</span>{/if}
											{#if m.winner != null}<span class="badge win">Winner: {playerName(m, m.winner)}</span>{/if}
											<span class="match-when">{m.endedAt ? new Date(m.endedAt).toLocaleString() : ''}</span>
										</span>
										<span class="chev">{isOpen ? '▾' : '▸'}</span>
									</button>
									{#if isOpen}
										<div class="match-detail">
											{#if ms.length === 0}
												<p class="muted small">No turn log for this match.</p>
											{:else}
												{#each ms as turns, li}
													<div class="leg">
														<div class="leg-head">Leg {li + 1}</div>
														<ol class="turn-list">
															{#each turns as t, ti}
																<li>
																	<span class="turn-idx">{ti + 1}.</span>
																	<span class="turn-player">{playerName(m, t.by)}</span>
																	<span class="turn-total">{turnLabel(t)}</span>
																</li>
															{/each}
														</ol>
													</div>
												{/each}
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
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

	.match-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.match-row {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.match-row.open { border-color: var(--accent); }
	.match-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		background: none;
		border: 0;
		color: var(--text);
		font: inherit;
		cursor: pointer;
		text-align: left;
	}
	.match-summary:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
	.match-name { font-weight: 700; flex: 1; }
	.match-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		align-items: center;
		font-size: var(--text-xs);
	}
	.match-when { color: var(--muted); }
	.badge {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--text);
		padding: 2px 6px;
		border-radius: 6px;
		font-size: var(--text-xs);
	}
	.badge.win { background: color-mix(in srgb, var(--accent) 30%, transparent); font-weight: 700; }
	.chev { color: var(--muted); font-size: var(--text-md); }
	.match-detail {
		padding: var(--space-sm) var(--space-md) var(--space-md);
		border-top: 1px solid var(--line);
		background: color-mix(in srgb, var(--bg) 60%, var(--surface));
	}
	.leg { margin-top: var(--space-sm); }
	.leg-head {
		font-size: var(--text-xs);
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--space-xs);
	}
	.turn-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.turn-list li {
		display: grid;
		grid-template-columns: 2em 1fr auto;
		gap: var(--space-sm);
		padding: 2px 4px;
		font-size: var(--text-sm);
	}
	.turn-idx { color: var(--muted); }
	.turn-player { color: var(--text); }
	.turn-total { color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
	.muted.small { font-size: var(--text-xs); }
</style>
