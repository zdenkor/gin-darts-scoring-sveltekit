<script>
	import { new01, submitTurnTotal01 } from '$lib/game/engine.js';
	import PlayerCard from '$lib/ui/PlayerCard.svelte';
	import Calculator from '$lib/ui/Calculator.svelte';
	import HistoryStrip from '$lib/ui/HistoryStrip.svelte';
	import GameToolbar from '$lib/ui/GameToolbar.svelte';

	/** @type {{names?: string[], start?: number, inRule?: string, outRule?: string, legsToWin?: number, setsToWin?: number}} */
	let {
		names = ['Player 1', 'Player 2'],
		start = 501,
		inRule = 'single',
		outRule = 'double',
		legsToWin = 1,
		setsToWin = 1
	} = $props();

	let game = $state(/** @type {any} */ (null));
	let lastCommitError = $state('');

	$effect.pre(() => {
		game = new01(names, { start, in: inRule, out: outRule, legsToWin, setsToWin });
	});

	const currentPlayer = $derived(game?.players[game.current]);

	function commitTurn(total) {
		lastCommitError = '';
		const result = submitTurnTotal01(game, total);
		if (result.events.some(e => e.type === 'bust')) {
			lastCommitError = 'Bust!';
		}
		game = structuredClone(result.state);
	}

	function exitGame() {
		// TODO: confirm + navigate
		console.log('exit');
	}
</script>

<div class="game-screen">
	<GameToolbar {setsToWin} {legsToWin} gameMode={`X01 ${start}`} onExit={exitGame} />

	<div class="scoreboard" style:--cols={game.players.length}>
		{#each game.players as player, i}
			<PlayerCard
				name={player.name}
				score={player.score}
				start={start}
				legsWon={player.legsWon}
				setsWon={player.setsWon}
				dartsThrown={player.dartsThrown}
				isActive={i === game.current}
				outRule={game.outRule}
				checkoutDarts={3}
			/>
		{/each}
	</div>

	<HistoryStrip players={game.players} />

	{#if lastCommitError}
		<div class="bust-banner">{lastCommitError}</div>
	{/if}

	{#if game.winner != null}
		<div class="winner-banner">{game.players[game.winner].name} wins!</div>
	{/if}

	<Calculator onCommit={commitTurn} />
</div>

<style>
	.game-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		height: 100%;
		min-height: 0;
	}
	.scoreboard {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-md);
		flex: 0 0 auto;
	}
	@container app (min-width: 560px) {
		.scoreboard {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@container app (min-width: 1000px) {
		.scoreboard {
			grid-template-columns: repeat(var(--cols, 2), 1fr);
		}
	}
	.bust-banner {
		background: var(--danger);
		color: #2a070c;
		padding: var(--space-sm) var(--space-md);
		border-radius: 10px;
		text-align: center;
		font-weight: 700;
		animation: shake .3s ease;
	}
	.winner-banner {
		background: var(--accent);
		color: #062018;
		padding: var(--space-md);
		border-radius: var(--radius);
		text-align: center;
		font-weight: 700;
		font-size: var(--text-lg);
	}
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}
</style>
