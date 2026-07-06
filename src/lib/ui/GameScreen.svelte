<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { new01, submitTurnTotal01 } from '$lib/game/engine.js';
	import PlayerCard from '$lib/ui/PlayerCard.svelte';
	import Calculator from '$lib/ui/Calculator.svelte';
	import HistoryStrip from '$lib/ui/HistoryStrip.svelte';
	import GameToolbar from '$lib/ui/GameToolbar.svelte';
	import { saveCurrentGame, loadCurrentGame, clearCurrentGame } from '$lib/util/currentGame.js';
	import { recordGameHistory, gameHistoryEntryFromState } from '$lib/util/history.js';

	/** @type {{names?: string[] | null, start?: number, inRule?: string, outRule?: string, legsToWin?: number, setsToWin?: number}} */
	let {
		names = null,
		start = 501,
		inRule = 'single',
		outRule = 'double',
		legsToWin = 1,
		setsToWin = 1
	} = $props();

	let game = $state(/** @type {any} */ (null));
	let lastCommitError = $state('');
	let showCommands = $state(false);
	let past = $state(/** @type {any[]} */ ([]));
	let future = $state(/** @type {any[]} */ ([]));

	let persistTimer = 0;

	async function init() {
		const saved = await loadCurrentGame();
		const hasSaved = saved && saved.players?.length && !saved.endedAt;
		const wantsNew = Array.isArray(names) && names.length > 0;
		if (hasSaved && !wantsNew) {
			game = structuredClone(saved);
		} else {
			const playerNames = wantsNew ? names : ['Player 1', 'Player 2'];
			game = new01(playerNames, { start, in: inRule, out: outRule, legsToWin, setsToWin });
			if (hasSaved) {
				try { await clearCurrentGame(); } catch {}
			}
		}
		past = [];
		future = [];
	}

	$effect(() => {
		const state = game;
		if (!state) return;
		if (persistTimer) clearTimeout(persistTimer);
		persistTimer = setTimeout(() => {
			if (!state.endedAt) saveCurrentGame(state);
			else clearCurrentGame();
		}, 500);
	});

	onMount(() => {
		init();
		return () => {
			if (persistTimer) clearTimeout(persistTimer);
		};
	});

	const currentPlayer = $derived(game?.players[game.current]);

	function snapshot() {
		return structuredClone(game);
	}

	function restore(state) {
		game = structuredClone(state);
	}

	function commitTurn(total) {
		if (!game || game.winner != null) return;
		lastCommitError = '';
		const before = snapshot();
		const result = submitTurnTotal01(game, total);
		if (result.events.some(e => e.type === 'bust')) {
			lastCommitError = 'Bust!';
		}
		game = structuredClone(result.state);
		past = [...past, before];
		future = [];
	}

	function undo() {
		if (past.length === 0) return;
		const previous = past[past.length - 1];
		future = [snapshot(), ...future];
		past = past.slice(0, -1);
		restore(previous);
		lastCommitError = '';
	}

	function redo() {
		if (future.length === 0) return;
		const next = future[0];
		past = [...past, snapshot()];
		future = future.slice(1);
		restore(next);
		lastCommitError = '';
	}

	function exitGame() {
		if (game && !game.endedAt && !confirm('Leave the current game? Progress is saved locally.')) return;
		goto(`${base}/`);
	}

	async function finishGame() {
		if (game.winner == null) return;
		const entry = gameHistoryEntryFromState(game);
		await recordGameHistory(entry);
		await clearCurrentGame();
		goto(`${base}/stats?newGame=true`);
	}

	function moreCommand(cmd) {
		if (cmd === 'undo') undo();
		else if (cmd === 'redo') redo();
		else if (cmd === 'finish' && game.winner != null) finishGame();
		else if (cmd === 'exit') exitGame();
		showCommands = false;
	}
</script>

{#if game}
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
					dartsThrown={player.dartsThrown || 0}
					isActive={i === game.current}
					outRule={game.opts?.out}
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

		<Calculator
			onCommit={commitTurn}
			onUndo={undo}
			onRedo={redo}
			canUndo={past.length > 0}
			canRedo={future.length > 0}
			onMore={() => (showCommands = true)}
			disabled={game.winner != null}
		/>

		{#if showCommands}
			<div class="command-sheet" role="dialog" aria-modal="true">
				<button class="command-item" disabled={past.length === 0} onclick={() => moreCommand('undo')}>↶ Undo</button>
				<button class="command-item" disabled={future.length === 0} onclick={() => moreCommand('redo')}>↷ Redo</button>
				<button class="command-item" onclick={() => moreCommand('stats')}>Stats</button>
				<button class="command-item" disabled={game.winner == null} onclick={() => moreCommand('finish')}>Finish game</button>
				<button class="command-item danger" onclick={() => moreCommand('exit')}>Exit game</button>
				<button class="command-item" onclick={() => (showCommands = false)}>Cancel</button>
			</div>
			<div class="command-backdrop" onclick={() => (showCommands = false)}></div>
		{/if}
	</div>
{:else}
	<div class="screen">
		<div class="card">
			<p class="muted">Loading game…</p>
			<button class="btn" onclick={() => goto(`${base}/`)}>Back to menu</button>
		</div>
	</div>
{/if}

<style>
	.game-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		height: 100%;
		min-height: 0;
		container-type: inline-size;
		container-name: game-screen;
	}
	.scoreboard {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-md);
		flex: 0 0 auto;
	}
	@container game-screen (min-width: 560px) {
		.scoreboard {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@container game-screen (min-width: 1000px) {
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
	.command-sheet {
		position: fixed;
		left: 50%;
		bottom: var(--space-md);
		transform: translateX(-50%);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm);
		display: grid;
		gap: var(--space-xs);
		min-width: 240px;
		z-index: 110;
	}
	.command-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.5);
		z-index: 100;
	}
	.command-item {
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 10px;
		padding: var(--space-sm) var(--space-md);
		text-align: left;
		font-weight: 600;
	}
	.command-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.command-item.danger {
		background: var(--danger);
		color: #2a070c;
	}
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}
</style>
