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
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		container-type: inline-size;
		container-name: player;
		transition: border-color .15s ease;
	}
	.player-card.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent), var(--shadow);
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-md);
	}
	.name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sets {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.score {
		font-size: clamp(2.5rem, 22cqi, 6rem);
		font-weight: 700;
		text-align: center;
		line-height: 1;
	}
	.score.long {
		font-size: clamp(1.75rem, 16cqi, 4rem);
	}
	.footer {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.checkout {
		color: var(--accent);
	}
@container player (min-width: 320px) {
		.score { font-size: clamp(3rem, 18cqi, 7rem); }
	}
</style>
