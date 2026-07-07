<script>
	import { checkoutSuggestions } from '$lib/game/engine.js';

	/** @type {{name: string, score: number, start: number, legsWon?: number, setsWon?: number, dartsThrown?: number, isActive?: boolean, outRule?: string, checkoutDarts?: number, compact?: boolean}} */
	let {
		name,
		score,
		start,
		legsWon = 0,
		setsWon = 0,
		dartsThrown = 0,
		isActive = false,
		outRule = 'single',
		checkoutDarts = 3,
		compact = false
	} = $props();

	const avg = $derived(dartsThrown > 0 ? ((start - score) / dartsThrown * 3).toFixed(1) : '0.0');
	const checkouts = $derived(score > 0 && score <= 170 ? checkoutSuggestions(score, outRule, checkoutDarts) : []);
	const isLong = $derived(String(score).length > 2);
</script>

<div class="player-card" class:active={isActive} class:compact>
	<div class="card-header">
		<span class="name">{name}</span>
		<span class="sets">S:{setsWon} L:{legsWon}</span>
	</div>
	<div class="score" class:long={isLong}>{score}</div>
	{#if !compact}
		<div class="footer">
			<span class="avg">Avg: {avg}</span>
			{#if checkouts.length > 0}
				<span class="checkout">Out: {checkouts.slice(0, 3).map(c => c.description).join(', ')}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.player-card {
		background: var(--surface);
		border: 2px solid var(--line);
		border-radius: var(--radius);
		padding: calc(var(--space-xs) * 0.5);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		container-type: size;
		container-name: player;
		transition: border-color .15s ease;
		min-height: 0;
		overflow: hidden;
		height: 100%;
		justify-content: center;
	}
	.player-card.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent), var(--shadow);
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: clamp(1rem, 6cqi, 2rem);
		min-height: 0;
		flex: 0 0 auto;
		flex-shrink: 0;
		gap: var(--space-xs);
	}
	.name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.sets {
		color: var(--muted);
		font-size: clamp(1rem, 6cqi, 2rem);
		white-space: nowrap;
		flex: 0 0 auto;
	}
	.score {
		font-size: clamp(2rem, 12cqi, 4rem);
		font-weight: 700;
		text-align: center;
		line-height: 1;
		flex: 0 0 auto;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	.score.long {
		font-size: clamp(1.75rem, 11cqi, 3.5rem);
	}
	.footer {
		display: flex;
		justify-content: space-between;
		font-size: clamp(1rem, 6cqi, 2rem);
		color: var(--muted);
		min-height: 0;
		flex: 0 0 auto;
		flex-shrink: 0;
		gap: var(--space-xs);
	}
	.checkout {
		color: var(--accent);
	}
	@container player (min-width: 20rem) {
		.score { font-size: clamp(2.5rem, 14cqi, 5rem); }
		.card-header, .footer { font-size: clamp(1.25rem, 7cqi, 2.5rem); }
	}
	@container player (min-width: 35rem) {
		.score { font-size: clamp(3rem, 12cqi, 6rem); }
		.card-header, .footer { font-size: clamp(1.5rem, 6cqi, 3rem); }
	}
	@container player (max-height: 8rem) {
		.score { font-size: clamp(1.5rem, 8cqi, 2.5rem); }
		.player-card { padding: 2px; }
		.card-header, .footer { font-size: clamp(0.75rem, 4cqi, 1.25rem); }
	}
	.player-card.compact {
		width: calc(50% - var(--space-xs) * 0.5);
		min-width: 140px;
		max-width: 220px;
		flex-shrink: 0;
	}
	.player-card.compact .score {
		font-size: clamp(1.75rem, 14cqi, 3rem);
	}
	.player-card.compact .card-header,
	.player-card.compact .footer {
		font-size: clamp(0.875rem, 7cqi, 1.5rem);
	}
	@container player (max-height: 6rem) {
		.player-card.compact { min-width: 120px; }
		.player-card.compact .score { font-size: clamp(1.5rem, 12cqi, 2.5rem); }
		.player-card.compact .card-header,
		.player-card.compact .footer { font-size: clamp(0.75rem, 6cqi, 1.25rem); }
	}
	@container player (min-width: 12rem) {
		.player-card.compact .score { font-size: clamp(2rem, 18cqi, 4rem); }
		.player-card.compact .card-header,
		.player-card.compact .footer { font-size: clamp(1rem, 9cqi, 2rem); }
	}
	@container player (min-width: 18rem) {
		.player-card.compact .score { font-size: clamp(2.5rem, 16cqi, 5rem); }
		.player-card.compact .card-header,
		.player-card.compact .footer { font-size: clamp(1.25rem, 8cqi, 2.5rem); }
	}
	@container player (min-height: 14rem) {
		.score { font-size: clamp(2.5rem, 14cqi, 5.5rem); }
		.card-header, .footer { font-size: clamp(1.25rem, 7cqi, 2.75rem); }
	}
	@container player (min-height: 20rem) {
		.score { font-size: clamp(3rem, 16cqi, 7rem); }
		.card-header, .footer { font-size: clamp(1.5rem, 8cqi, 3.5rem); }
	}
	@media (prefers-reduced-motion: reduce) {
		.player-card { transition: none; }
	}
</style>
