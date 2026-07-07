<script>
	import { checkoutSuggestions } from '$lib/game/engine.js';

	/** @type {{name: string, score: number, start: number, legsWon?: number, setsWon?: number, dartsThrown?: number, isActive?: boolean, outRule?: string, checkoutDarts?: number}} */
	let {
		name,
		score,
		start,
		legsWon = 0,
		setsWon = 0,
		dartsThrown = 0,
		isActive = false,
		outRule = 'single',
		checkoutDarts = 3
	} = $props();

	const avg = $derived(dartsThrown > 0 ? ((start - score) / dartsThrown * 3).toFixed(1) : '0.0');
	const checkouts = $derived(score > 0 && score <= 170 ? checkoutSuggestions(score, outRule, checkoutDarts) : []);
	const isLong = $derived(String(score).length > 2);
</script>

<div class="player-card" class:active={isActive}>
	<div class="card-header">
		<span class="name">{name}</span>
		<span class="sets">S:{setsWon} L:{legsWon}</span>
	</div>
	<div class="score" class:long={isLong}>{score}</div>
	<div class="footer">
		<span class="avg">Avg: {avg}</span>
		{#if checkouts.length > 0}
			<span class="checkout">Out: {checkouts.slice(0, 3).join(', ')}</span>
		{/if}
	</div>
</div>

<style>
	.player-card {
		background: var(--surface);
		border: 2px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-xs) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: 0;
		container-type: inline-size;
		container-name: player;
		transition: border-color .15s ease;
		min-height: 0;
		overflow: hidden;
		justify-content: space-between;
	}
	.player-card.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent), var(--shadow);
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-xs);
		min-height: 0;
	}
	.name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sets {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.score {
		font-size: clamp(1.75rem, 10cqi, 3.5rem);
		font-weight: 700;
		text-align: center;
		line-height: 1;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		padding: var(--space-xs) 0;
	}
	.score.long {
		font-size: clamp(1.5rem, 9cqi, 3rem);
	}
	.footer {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-xs);
		color: var(--muted);
		min-height: 0;
	}
	.checkout {
		color: var(--accent);
	}
@container player (min-width: 20rem) {
		.score { font-size: clamp(2rem, 12cqi, 4rem); }
	}
@container player (min-width: 35rem) {
		.score { font-size: clamp(2.25rem, 10cqi, 4.5rem); }
	}
</style>
