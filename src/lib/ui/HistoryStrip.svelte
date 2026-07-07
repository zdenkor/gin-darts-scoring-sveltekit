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
	 *
	 * For the player who did NOT throw in this round, we show their
	 * current score (so the row always shows the running state of both
	 * players) and leave the "Scored" cell blank (no dash).
	 */
	/** @type {{players: Array<{name: string, score?: number, history?: Array<{what?: string, delta?: number, scoreAfter?: number, round?: number, thrown?: number, remain?: number, bust?: boolean}>}>}} */
	let { players = [] } = $props();

	const maxRounds = $derived(
		Math.max(0, ...players.map(p => p.history?.length || 0))
	);
	const rounds = $derived(Array.from({ length: maxRounds }, (_, i) => i + 1));
	let stripRef = $state(/** @type {HTMLDivElement|null} */ (null));

	// Auto-scroll to the bottom so the most recent throws are
	// visible without the user having to scroll manually.
	$effect(() => {
		if (stripRef && rounds.length) {
			stripRef.scrollTop = stripRef.scrollHeight;
		}
	});

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

	/**
	 * Returns { thrown, remain, bust, threw } for a given player at a
	 * given global throw number. History entries are stored in throw order
	 * (interleaved between players), so player.history[i] is the player's
	 * i-th throw globally. If the player hasn't thrown that many times
	 * yet, the cell is empty.
	 */
	function entryFor(playerIndex, throwNumber /* 1-based global */) {
		const player = players[playerIndex];
		if (!player) return null;
		const raw = player.history?.[throwNumber - 1];
		const norm = normalize(raw);
		if (!norm) return { thrown: null, remain: player.score ?? 0, bust: false, threw: false };
		return { ...norm, threw: true };
	}
</script>

{#if maxRounds > 0}
	<div class="history-strip" bind:this={stripRef}>
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
					<span class="thrown" class:empty={!e1?.threw}>
						{e1 && e1.threw ? e1.thrown : ''}
					</span>
					<span class="remain" class:empty={!e1?.threw}>
						{e1 ? e1.remain : ''}
					</span>
				{/if}
				<span class="dart">{round * 3}</span>
				{#if players.length >= 2}
					{@const e2 = entryFor(1, round)}
					<span class="thrown" class:empty={!e2?.threw}>
						{e2 && e2.threw ? e2.thrown : ''}
					</span>
					<span class="remain" class:empty={!e2?.threw}>
						{e2 ? e2.remain : ''}
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
		font-size: calc(var(--text-xs) * 1.25);
		min-height: 2.5rem;
		max-height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		flex-shrink: 1;
		height: 100%;
	}
	@container app (min-width: 30rem) {
		.history-strip { font-size: calc(var(--text-sm) * 1.25); }
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
		/* empty cell: no number, no dash — just blank */
		opacity: 0.35;
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
		min-height: 2.5rem;
		max-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 1;
		height: 100%;
	}
	@container app (min-width: 30rem) {
		.history-strip { font-size: calc(var(--text-sm) * 1.25); }
		.history-empty { padding: var(--space-sm); }
	}
	@media (orientation: landscape) and (max-height: 520px) {
		.history-strip, .history-empty { display: none; }
	}
</style>
