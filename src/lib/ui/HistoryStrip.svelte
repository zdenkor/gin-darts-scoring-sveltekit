<script>
	/** @type {{players: Array<{history?: Array<{round: number, thrown: number, remain: number}>>>}} */
	let { players = [] } = $props();

	const maxRounds = $derived(Math.max(0, ...players.map(p => p.history?.length || 0)));
	const rounds = $derived(Array.from({ length: maxRounds }, (_, i) => i + 1));
</script>

{#if maxRounds > 0}
	<div class="history-strip" style:--cols={players.length}>
		<div class="history-header">
			<span>R</span>
			{#each players as player}
				<span>{player.name}</span>
			{/each}
		</div>
		{#each rounds as round}
			<div class="history-row">
				<span class="round">{round}</span>
				{#each players as player}
					{@const entry = player.history?.[round - 1]}
					<span class="entry" class:empty={!entry}>
						{#if entry}
							{entry.thrown} → {entry.remain}
						{:else}
							-
						{/if}
					</span>
				{/each}
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
		overflow: hidden;
		font-size: var(--text-xs);
		max-height: min(25vh, 220px);
		overflow-y: auto;
	}
	.history-header, .history-row {
		display: grid;
		grid-template-columns: 2em 1fr;
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
	.round {
		color: var(--muted);
		text-align: center;
	}
	.entry {
		text-align: center;
	}
	.entry.empty {
		color: var(--muted);
		opacity: 0.5;
	}
	.muted { color: var(--muted); }
	.history-empty {
		text-align: center;
		padding: var(--space-sm);
		font-size: var(--text-xs);
	}
@container app (min-width: 480px) {
		.history-strip { font-size: var(--text-sm); max-height: min(28vh, 260px); }
		.history-header, .history-row {
			grid-template-columns: 2em repeat(var(--cols, 2), 1fr);
			gap: var(--space-sm);
			padding: var(--space-xs) var(--space-sm);
		}
	}
</style>
