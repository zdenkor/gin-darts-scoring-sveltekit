<script>
	/**
	 * Shared history strip — Legacy layout.
	 * 2 players: [Scored P1] [To go P1] [Dart] [Scored P2] [To go P2]
	 * Rows: one per dart round (3, 6, 9, ...).
	 * Engine pushes entries into per-player history in throw order:
	 *   P1[0] = round 1, P2[0] = round 2, P1[1] = round 3, P2[1] = round 4, ...
	 * Engine stores { what, delta, scoreAfter } where:
	 *   - `delta` is the change in score (negative for x01 = thrown)
	 *   - `scoreAfter` is the player's score after the turn
	 *   - `what` starts with "BUST" if the turn busted
	 */
	/** @type {{players: Array<{name: string, history?: Array<{what?: string, delta?: number, scoreAfter?: number, round?: number, thrown?: number, remain?: number, bust?: boolean}>}>}} */
	let { players = [] } = $props();

	const maxRounds = $derived(Math.max(0, ...players.map(p => p.history?.length || 0)) * Math.max(1, players.length));
	const rounds = $derived(Array.from({ length: maxRounds }, (_, i) => i + 1));

	function normalize(entry) {
		if (!entry) return null;
		// If entry is already in {thrown, remain, bust} form, use it directly.
		if (entry.thrown != null || entry.remain != null) {
			return {
				thrown: entry.thrown ?? 0,
				remain: entry.remain ?? 0,
				bust: !!entry.bust
			};
		}
		// Engine form: { what, delta, scoreAfter }
		const isBust = typeof entry.what === 'string' && entry.what.startsWith('BUST');
		const thrown = isBust ? 0 : Math.abs(entry.delta ?? 0);
		const remain = entry.scoreAfter ?? 0;
		return { thrown, remain, bust: isBust };
	}

	function entryFor(playerIndex, roundNumber /* 1-based global */) {
		const player = players[playerIndex];
		if (!player) return null;
		const numPlayers = players.length;
		// Did this player throw in this global round?
		if ((roundNumber - 1) % numPlayers !== playerIndex) return null;
		// Their history index = number of times they threw in rounds 1..N
		const raw = player.history?.[Math.floor((roundNumber - 1 - playerIndex) / numPlayers)];
		return normalize(raw);
	}
</script>

{#if maxRounds > 0}
	<div class="history-strip">
		<div class="history-header">
			<span class="thrown">Scored</span>
			<span class="remain">To go</span>
			<span class="dart">Dart</span>
			{#if players.length >= 2}
				<span class="thrown">Scored</span>
				<span class="remain">To go</span>
			{/if}
		</div>
		{#each rounds as round}
			<div class="history-row" class:active={round === maxRounds}>
				{#if players.length >= 1}
					{@const e1 = entryFor(0, round)}
					<span class="thrown" class:empty={!e1} class:bust={e1?.bust}>
						{e1 ? e1.thrown : '—'}
					</span>
					<span class="remain" class:empty={!e1} class:bust={e1?.bust}>
						{e1 ? (e1.bust ? 'BUST' : e1.remain) : '—'}
					</span>
				{/if}
				<span class="dart">{round * 3}</span>
				{#if players.length >= 2}
					{@const e2 = entryFor(1, round)}
					<span class="thrown" class:empty={!e2} class:bust={e2?.bust}>
						{e2 ? e2.thrown : '—'}
					</span>
					<span class="remain" class:empty={!e2} class:bust={e2?.bust}>
						{e2 ? (e2.bust ? 'BUST' : e2.remain) : '—'}
					</span>
				{/if}
			</div>
		{/each}
	</div>
{:else}
	<div class="history-empty muted">No throws yet.</div>
{/if}

<style>
	.history-strip {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: var(--text-xs);
		min-height: 3.5rem;
		max-height: 3.5rem;
		overflow-y: auto;
		overflow-x: hidden;
		flex-shrink: 0;
	}
	@container app (min-width: 30rem) {
		.history-strip { font-size: var(--text-sm); }
	}
	@container game-screen (min-height: 800px) {
		.history-strip { min-height: 5rem; max-height: 5rem; }
	}
	@container game-screen (min-height: 1100px) {
		.history-strip { min-height: 7rem; max-height: 7rem; }
	}
	.history-header, .history-row {
		display: grid;
		grid-template-columns: 1fr 1fr 2em 1fr 1fr;
		gap: var(--space-xs);
		padding: calc(var(--space-xs) * 0.75) var(--space-sm);
		border-bottom: 1px solid var(--line);
		align-items: center;
	}
	.history-header {
		background: var(--bg-2);
		font-weight: 600;
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.history-row:last-child {
		border-bottom: none;
	}
	.history-row.active {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.thrown, .remain {
		text-align: center;
	}
	.remain {
		color: var(--muted);
	}
	.thrown.empty, .remain.empty {
		color: var(--muted);
		opacity: 0.5;
	}
	.bust {
		color: var(--danger);
		font-weight: 700;
	}
	.dart {
		text-align: center;
		color: var(--muted);
		font-weight: 600;
	}
	.muted { color: var(--muted); }
	.history-empty {
		text-align: center;
		padding: var(--space-xs);
		font-size: var(--text-xs);
		min-height: 3.5rem;
		max-height: 3.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	@container app (min-width: 30rem) {
		.history-strip { font-size: var(--text-sm); }
		.history-empty { padding: var(--space-sm); }
	}
	@media (min-width: 80rem) {
		.history-strip, .history-empty { min-height: 4rem; max-height: 4rem; }
	}
	@media (orientation: landscape) and (max-height: 520px) {
		.history-strip, .history-empty { display: none; }
	}
</style>
