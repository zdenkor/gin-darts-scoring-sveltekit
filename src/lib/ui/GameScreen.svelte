<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { new01, submitTurnTotal01, dartValue } from '$lib/game/engine.js';
	import { playTurn } from '$lib/game/dartbot.js';
	import PlayerCard from '$lib/ui/PlayerCard.svelte';
	import Calculator from '$lib/ui/Calculator.svelte';
	import HistoryStrip from '$lib/ui/HistoryStrip.svelte';
	import GameToolbar from '$lib/ui/GameToolbar.svelte';
	import { saveCurrentGame, loadCurrentGame, clearCurrentGame } from '$lib/util/currentGame.js';
	import { recordGameHistory, gameHistoryEntryFromState } from '$lib/util/history.js';
	import { deepClone } from '$lib/util/deepClone.js';

	/** @type {{names?: string[] | null, bots?: string[], start?: number, inRule?: string, outRule?: string, legsToWin?: number, setsToWin?: number}} */
	let {
		names = null,
		bots = [],
		start = 501,
		inRule = 'single',
		outRule = 'double',
		legsToWin = 1,
		setsToWin = 1
	} = $props();

	let game = $state(/** @type {any} */ (null));
	let lastCommitError = $state('');
	let showCommands = $state(false);
	let showExitModal = $state(false);
	let past = $state(/** @type {any[]} */ ([]));
	let future = $state(/** @type {any[]} */ ([]));

	let botTimer = 0;
	let lastBotIndex = -1;

	async function init() {
		let saved = null;
		try {
			// IndexedDB can hang in some browser contexts (private mode, disabled storage).
			// Race it against a timeout so the UI never stays stuck on "Loading game…".
			saved = await Promise.race([
				loadCurrentGame(),
				new Promise((_, reject) => setTimeout(() => reject(new Error('loadCurrentGame timeout')), 3000))
			]);
		} catch (e) {
			console.warn('init: could not load saved game, starting new', e);
		}
		const hasSaved = saved && saved.players?.length && !saved.endedAt;
		const wantsNew = Array.isArray(names) && names.length > 0;
		if (hasSaved && !wantsNew) {
			game = deepClone(saved);
		} else {
			const playerNames = wantsNew ? names : ['Player 1', 'Player 2'];
			const playerBots = wantsNew && bots.length ? bots : [];
			game = new01(playerNames, { start, in: inRule, out: outRule, legsToWin, setsToWin });
			game.players.forEach((p, i) => {
				if (playerBots[i]) {
					p.isBot = true;
					p.botLevel = Number(playerBots[i]) || 5;
				}
			});
			if (hasSaved) {
				try { await clearCurrentGame(); } catch {}
			}
		}
		past = [];
		future = [];
		scheduleBotIfNeeded();
	}

	onMount(() => {
		init();
		return () => {
			if (botTimer) clearTimeout(botTimer);
		};
	});

	async function persist() {
		if (!game) return;
		if (!game.endedAt) await saveCurrentGame(game);
		else await clearCurrentGame();
	}

	function snapshot() {
		return deepClone(game);
	}

	function restore(state) {
		game = deepClone(state);
	}

	async function commitTurn(total) {
		if (!game || game.winner != null) return;
		lastCommitError = '';
		const before = snapshot();
		const result = submitTurnTotal01(game, total);
		if (result.events.some(e => e.type === 'bust')) {
			lastCommitError = 'Bust!';
		}
		game = deepClone(result.state);
		past = [...past, before];
		future = [];
		await persist();
		scheduleBotIfNeeded();
	}

	function isCurrentBot() {
		if (!game) return false;
		return !!game.players[game.current]?.isBot;
	}

	function runBotTurn() {
		if (!game || game.winner != null) return;
		const p = game.players[game.current];
		if (!p?.isBot) return;
		lastBotIndex = game.current;
		const darts = playTurn(p.score, { in: game.opts?.in, out: game.opts?.out }, p.botLevel || 5);
		const total = darts.reduce((s, d) => s + dartValue(d), 0);
		commitTurn(total);
	}

	function scheduleBotIfNeeded() {
		if (botTimer) clearTimeout(botTimer);
		if (!game || game.winner != null) return;
		const idx = game.current;
		if (game.players[idx]?.isBot && idx !== lastBotIndex) {
			botTimer = setTimeout(() => runBotTurn(), 800);
		}
	}

	async function undo() {
		if (past.length === 0) return;
		const previous = past[past.length - 1];
		future = [snapshot(), ...future];
		past = past.slice(0, -1);
		restore(previous);
		lastCommitError = '';
		lastBotIndex = -1;
		await persist();
		scheduleBotIfNeeded();
	}

	async function redo() {
		if (future.length === 0) return;
		const next = future[0];
		past = [...past, snapshot()];
		future = future.slice(1);
		restore(next);
		lastCommitError = '';
		lastBotIndex = -1;
		await persist();
		scheduleBotIfNeeded();
	}

	function exitGame() {
		showExitModal = true;
	}

	async function doExitDiscard() {
		showExitModal = false;
		try { await clearCurrentGame(); } catch {}
		window.location.href = `${base}/`;
	}

	async function doExitSaveProgress() {
		showExitModal = false;
		if (game && !game.endedAt) {
			try { await saveCurrentGame(game); } catch {}
		}
		window.location.href = `${base}/`;
	}

	async function doExitSaveAndExit() {
		showExitModal = false;
		if (game && game.winner != null) {
			const entry = gameHistoryEntryFromState(game);
			try { await recordGameHistory(entry); } catch {}
			try { await clearCurrentGame(); } catch {}
		}
		window.location.href = `${base}/`;
	}

	function cancelExit() {
		showExitModal = false;
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

		<HistoryStrip players={game.players} />

		<div class="scoreboard" class:compact={game.players.length > 2} style:--cols={game.players.length}>
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
					compact={game.players.length > 2}
				/>
			{/each}
		</div>

		{#if lastCommitError}
			<div class="bust-banner">{lastCommitError}</div>
		{/if}

		{#if game.winner != null}
			<div class="winner-banner">{game.players[game.winner].name} wins!</div>
		{/if}

		<div class="calculator-slot">
			<Calculator
				onCommit={commitTurn}
				onUndo={undo}
				onRedo={redo}
				canUndo={past.length > 0}
				canRedo={future.length > 0}
				onMore={() => (showCommands = true)}
				disabled={game.winner != null || isCurrentBot()}
			/>
		</div>

		{#if showCommands}
			<div class="command-sheet" role="dialog" aria-modal="true">
				<button class="command-item" disabled={past.length === 0} onclick={() => moreCommand('undo')}>↶ Undo</button>
				<button class="command-item" disabled={future.length === 0} onclick={() => moreCommand('redo')}>↷ Redo</button>
				<button class="command-item" onclick={() => moreCommand('stats')}>Stats</button>
				<button class="command-item" disabled={game.winner == null} onclick={() => moreCommand('finish')}>Finish game</button>
				<button class="command-item danger" onclick={() => moreCommand('exit')}>Exit game</button>
				<button class="command-item" onclick={() => (showCommands = false)}>Cancel</button>
			</div>
			<div class="command-backdrop" onclick={() => (showCommands = false)} aria-hidden="true"></div>
		{/if}

		{#if showExitModal}
			<div class="exit-modal" role="dialog" aria-modal="true">
				<div class="exit-modal-box">
					{#if game.winner != null}
						<h3>Save game?</h3>
						<p class="muted">Save the result to history.</p>
						<div class="exit-actions">
							<button class="btn danger" onclick={doExitDiscard}>Discard</button>
							<button class="btn primary" onclick={doExitSaveAndExit}>Save & exit</button>
						</div>
					{:else}
						<h3>Exit game?</h3>
						<p class="muted">Your progress is saved every turn. Resume from the main menu later.</p>
						<div class="exit-actions">
							<button class="btn" onclick={cancelExit}>Cancel</button>
							<button class="btn danger" onclick={doExitDiscard}>Discard progress</button>
							<button class="btn primary" onclick={doExitSaveProgress}>Save progress & exit</button>
						</div>
					{/if}
				</div>
			</div>
			<div class="command-backdrop" onclick={cancelExit} aria-hidden="true"></div>
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
		display: grid;
		grid-template-rows: auto auto minmax(15rem, 1fr) auto auto;
		gap: var(--space-xs);
		height: 100%;
		min-height: 0;
		padding: var(--space-xs);
		overflow: hidden;
		container-type: size;
		container-name: game-screen;
		width: 100%;
		max-width: 90rem;
		margin-inline: auto;
	}
	@media (min-width: 120rem) {
		.game-screen {
			max-width: 80rem;
			gap: var(--space-md);
			padding: var(--space-md);
		}
	}
	@container game-screen (min-height: 900px) {
		.game-screen { gap: var(--space-sm); padding: var(--space-sm); }
	}
	@container game-screen (max-height: 520px) {
		.game-screen { gap: 2px; padding: 2px; }
	}
	:global(.game-screen > .history-strip),
	:global(.game-screen > .history-empty) {
		max-height: min(15cqh, 6rem);
		min-height: 0;
		overflow: hidden;
	}
	@container game-screen (min-height: 700px) {
		:global(.game-screen > .history-strip),
		:global(.game-screen > .history-empty) { max-height: min(18cqh, 8rem); }
	}
	@container game-screen (max-height: 520px) {
		:global(.game-screen > .history-strip),
		:global(.game-screen > .history-empty) { display: none; }
	}
	.scoreboard {
		display: grid;
		grid-template-columns: 1fr;
		grid-auto-rows: 1fr;
		gap: var(--space-xs);
		min-height: 0;
		overflow: hidden;
		height: 100%;
		min-height: 15rem;
		align-self: stretch;
	}
	.scoreboard.compact {
		display: flex;
		flex-direction: row;
		gap: var(--space-xs);
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x mandatory;
		scrollbar-width: thin;
	}
	.scoreboard.compact::-webkit-scrollbar {
		height: 6px;
	}
	.scoreboard.compact::-webkit-scrollbar-track {
		background: var(--bg-2);
		border-radius: 3px;
	}
	.scoreboard.compact::-webkit-scrollbar-thumb {
		background: var(--line);
		border-radius: 3px;
	}
	.scoreboard.compact :global(.player-card) {
		flex: 0 0 calc(50% - var(--space-xs) * 0.5);
		max-width: none;
		width: auto;
		scroll-snap-align: start;
	}
	@container game-screen (max-height: 560px) {
		.scoreboard.compact { gap: 2px; }
		.scoreboard.compact :global(.player-card) {
			flex: 0 0 calc(50% - 1px);
		}
	}
	@container game-screen (min-width: 35rem) {
		.scoreboard:not(.compact) { grid-template-columns: repeat(2, 1fr); }
	}
	@container game-screen (min-width: 62.5rem) {
		.scoreboard:not(.compact) { grid-template-columns: repeat(var(--cols, 2), 1fr); }
	}
	.calculator-slot {
		min-height: 0;
		max-height: min(55cqh, 24rem);
		overflow: hidden;
	}
	@media (orientation: landscape) and (max-height: 500px) {
		:global(.game-screen) {
			grid-template-columns: minmax(0, 45%) 1fr;
			grid-template-rows: auto auto 1fr;
			grid-template-areas:
				"toolbar toolbar"
				"banner banner"
				"scoreboard calculator";
		}
		:global(.game-screen > .game-toolbar) { grid-area: toolbar; }
		:global(.game-screen > .history-strip),
		:global(.game-screen > .history-empty) { display: none; }
		:global(.game-screen > .scoreboard) {
			grid-area: scoreboard;
			max-height: 100%;
			grid-template-columns: 1fr;
		}
		:global(.game-screen > .scoreboard.compact) {
			display: flex;
			grid-template-columns: none;
		}
		:global(.game-screen > .scoreboard.compact .player-card) {
			flex: 0 0 100%;
		}
		:global(.game-screen > .bust-banner),
		:global(.game-screen > .winner-banner) {
			grid-area: banner;
			margin: 0;
		}
		:global(.game-screen > .calculator-slot) { grid-area: calculator; }
	}
	@media (orientation: landscape) and (max-height: 380px) {
		:global(.game-screen) {
			grid-template-columns: minmax(0, 38%) 1fr;
		}
	}
	.bust-banner {
		background: var(--danger);
		color: #2a070c;
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius);
		text-align: center;
		font-weight: 700;
		font-size: var(--text-sm);
		animation: shake .3s ease;
	}
	.winner-banner {
		background: var(--accent);
		color: #062018;
		padding: var(--space-xs) var(--space-md);
		border-radius: var(--radius);
		text-align: center;
		font-weight: 700;
		font-size: var(--text-md);
	}
	@media (min-width: 80rem) {
		:global(.game-screen > .game-toolbar) { font-size: var(--text-md); }
		.bust-banner { font-size: var(--text-md); padding: var(--space-sm) var(--space-md); }
		.winner-banner { font-size: var(--text-lg); padding: var(--space-sm) var(--space-lg); }
	}
	@media (prefers-reduced-motion: reduce) {
		.bust-banner { animation: none; }
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
		min-width: 15rem;
		z-index: 110;
	}
	.command-item {
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: var(--radius);
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
	.command-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		z-index: 100;
	}
	.exit-modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 110;
		width: min(90vw, 22rem);
	}
	.exit-modal-box {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-md);
		text-align: center;
	}
	.exit-modal-box h3 {
		margin: 0 0 var(--space-xs);
		font-size: var(--text-lg);
	}
	.exit-modal-box .muted {
		margin: 0 0 var(--space-md);
		font-size: var(--text-sm);
	}
	.exit-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-sm);
	}
	.exit-actions .btn {
		flex: 1 1 auto;
		min-width: 6rem;
	}
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}
</style>
