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
	import { recordGameHistory, recordGameResult, deleteGameHistory, gameHistoryEntryFromState } from '$lib/util/history.js';
	import { deepClone } from '$lib/util/deepClone.js';
	import { loadSetting } from '$lib/util/settings.js';

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
	let showEndEarlyModal = $state(false);
	// Pending checkout-attempts question. Set when a human player
	// just had a turn where the out-rule / target / score combo
	// could have aimed at a close-out. The modal asks 1/2/3 and
	// writes the answer back to player.history[historyIdx].
	// Shape: { historyIdx, max, isLegWin, playerIndex }.
	let pendingCheckout = $state(/** @type {any} */ (null));
	let past = $state(/** @type {any[]} */ ([]));
	let future = $state(/** @type {any[]} */ ([]));

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

	let botTimer = null;
	let lastBotIndex = -1;
	let isCommitting = false;

	async function commitTurn(total) {
		if (!game || game.winner != null) return;
		if (isCommitting) return; // prevent re-entry while a commit is in flight
		isCommitting = true;
		lastCommitError = '';
		try {
			const before = snapshot();
			const result = submitTurnTotal01(game, total);
			if (result.events.some(e => e.type === 'bust')) {
				lastCommitError = 'Bust!';
			}
			// Checkout-attempts question: if the engine reports the
			// player COULD have aimed at the close-out this turn, ask
			// the human how many darts they actually used. Bots skip
			// the modal — we auto-record the max for them. If the
			// user has disabled "Ask checkout attempts" in settings,
			// also auto-record the max (the setting only hides the
			// modal, not the event itself).
			const askCheckout = loadSetting('askCheckout') !== false;
			const caEvt = /** @type {any} */ (result.events.find(e => e.type === 'checkout-attempt'));
			if (caEvt) {
				const histIdx = game.players[caEvt.playerIndex].history.length - 1;
				if (caEvt.isBot || !askCheckout) {
					game.players[caEvt.playerIndex].history[histIdx].checkoutAttempts = caEvt.max;
				} else {
					pendingCheckout = {
						historyIdx: histIdx,
						max: caEvt.max,
						isLegWin: caEvt.isLegWin,
						playerIndex: caEvt.playerIndex,
					};
				}
			}
			game = deepClone(result.state);
			// Capture whether this commit was a leg-finishing throw so
			// that undo can roll back the auto-record and the saved
			// game deletion below. If the player mis-clicks on the
			// finishing dart they can undo the last throw and try
			// again — the stats record is removed and the saved
			// currentGame is restored in IDB.
			const isLegFinishingThrow = before.winner == null && game.winner != null && game.endedAt;
			let legWinUndoEntry = null;
			if (isLegFinishingThrow) {
				// Keep the pre-finish state in memory so the modal
				// / saved game / history entry can all be reversed on
				// undo.
				legWinUndoEntry = {
					isLegWin: true,
					preFinishState: deepClone(before),
					legWinEntryId: null,
				};
			}
			past = legWinUndoEntry
				? [...past, legWinUndoEntry]
				: [...past, before];
			future = [];
			await persist();
			// Auto-record to history when the game ends.
			let legWinEntryId = null;
			if (game.winner != null && game.endedAt) {
				try {
					const entry = gameHistoryEntryFromState(game);
					legWinEntryId = await recordGameHistory(entry);
					// Tag the past entry with the recorded id so undo
					// can delete it from the history store.
					if (legWinEntryId && legWinUndoEntry) {
						legWinUndoEntry.legWinEntryId = legWinEntryId;
					}
					await clearCurrentGame();
				} catch (e) {
					console.warn('auto-record game history failed', e);
				}
			}
		} finally {
			isCommitting = false;
		}
		// Reset so the next bot turn (a different player, or the same
		// player after a full round) is scheduled fresh. Without this
		// the bot only throws the first time it becomes current.
		lastBotIndex = -1;
		scheduleBotIfNeeded();
	}

	// Persist the player's answer to the checkout-attempts question
	// and clear the modal. Called from the modal's 1/2/3 buttons.
	async function recordCheckoutAttempts(n) {
		if (!pendingCheckout || !game) return;
		const { historyIdx, playerIndex } = pendingCheckout;
		if (game.players[playerIndex]?.history?.[historyIdx]) {
			game.players[playerIndex].history[historyIdx].checkoutAttempts = n;
		}
		pendingCheckout = null;
		game = deepClone(game);
		await persist();
	}

	function isCurrentBot() {
		if (!game) return false;
		return !!game.players[game.current]?.isBot;
	}

	// Allow picking the opening player by clicking their card in the
	// scoreboard, but only before anyone has thrown. After the first
	// turn the engine owns `current` and a manual change would skip a
	// player's throws.
	const canPickStarting = $derived(
		!!game && game.winner == null &&
		game.players.every(p => (p.history?.length ?? 0) === 0)
	);

	async function setStartingPlayer(idx) {
		if (!canPickStarting) return;
		if (idx < 0 || idx >= game.players.length) return;
		game = { ...game, current: idx };
		await persist();
		scheduleBotIfNeeded();
	}

	function runBotTurn() {
		if (!game || game.winner != null) return;
		if (isCommitting) return;
		const p = game.players[game.current];
		if (!p?.isBot) return;
		if (game.current === lastBotIndex) return; // already scheduled for this player
		lastBotIndex = game.current;
		const darts = playTurn(p.score, { in: game.opts?.in, out: game.opts?.out }, p.botLevel || 5);
		const total = darts.reduce((s, d) => s + dartValue(d), 0);
		commitTurn(total);
	}

	function scheduleBotIfNeeded() {
		if (botTimer) {
			clearTimeout(botTimer);
			botTimer = null;
		}
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
		// A leg-finishing throw saves a special marker entry that
		// records the pre-finish state plus the id of the stats
		// entry that was auto-recorded. Undoing such a throw
		// needs to (a) delete the stats entry, (b) restore the
		// pre-finish state in IDB, and (c) restore the in-memory
		// game to the pre-finish state.
		if (previous && previous.isLegWin && previous.preFinishState) {
			if (previous.legWinEntryId) {
				try {
					await deleteGameHistory(previous.legWinEntryId);
				} catch (e) {
					console.warn('undo: deleteGameHistory failed', e);
				}
			}
			restore(previous.preFinishState);
		} else {
			restore(previous);
		}
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
		// If the redo target is a leg-finishing state (game over
		// + endedAt), re-record the stats entry. The history id
		// will differ from the original, but the player can undo
		// to remove it.
		if (game && game.winner != null && game.endedAt) {
			try {
				const entry = gameHistoryEntryFromState(game);
				await recordGameHistory(entry);
			} catch (e) {
				console.warn('redo: recordGameHistory failed', e);
			}
		}
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
			try { await recordGameResult(game); } catch {}
			try { await clearCurrentGame(); } catch {}
		}
		window.location.href = `${base}/`;
	}

	function cancelExit() {
		showExitModal = false;
	}

	async function finishGame() {
		// Allow finishing the game manually even before someone reaches
		// zero (mirrors the Legacy "Finish" button, which works at any
		// time). If no winner was determined by the engine, treat the
		// player with the lowest current score as the winner.
		if (game.winner == null) {
			let leader = 0;
			for (let i = 1; i < game.players.length; i++) {
				if (game.players[i].score < game.players[leader].score) leader = i;
			}
			game = { ...game, winner: leader, endedAt: Date.now() };
		}
		const entry = gameHistoryEntryFromState(game);
		try { await recordGameHistory(entry); } catch {}
		try { await recordGameResult(game); } catch {}
		await clearCurrentGame();
		goto(`${base}/stats?newGame=true`);
	}

	// Index of the player currently leading the match. For x01 the lowest
	// remaining score leads; for cricket/shanghai the highest leads.
	// Ties go to the first player in the list.
	function leadingPlayerIndex() {
		const type = game?.type || 'x01';
		if (type === 'x01') {
			let best = Infinity, idx = 0;
			for (let i = 0; i < game.players.length; i++) {
				if (game.players[i].score < best) { best = game.players[i].score; idx = i; }
			}
			return idx;
		}
		let best = -Infinity, idx = 0;
		for (let i = 0; i < game.players.length; i++) {
			if ((game.players[i].score || 0) > best) { best = game.players[i].score || 0; idx = i; }
		}
		return idx;
	}

	function confirmEndEarly() {
		if (!game || game.winner != null) return;
		showCommands = false;
		showEndEarlyModal = true;
	}

	function cancelEndEarly() {
		showEndEarlyModal = false;
	}

	async function doEndEarly() {
		if (!game || game.winner != null) return;
		showEndEarlyModal = false;
		game = { ...game, winner: leadingPlayerIndex(), endedAt: Date.now() };
		await finishGame();
	}

	function moreCommand(cmd) {
		if (cmd === 'undo') undo();
		else if (cmd === 'redo') redo();
		else if (cmd === 'finish') {
			if (game.winner != null) finishGame();
			else confirmEndEarly();
		}
		else if (cmd === 'exit') exitGame();
		showCommands = false;
	}

		$effect(() => {
			if (typeof window === 'undefined') return;
			const log = () => {
				const gs = document.querySelector('.game-screen');
				const sb = document.querySelector('.scoreboard');
				const slot = document.querySelector('.calculator-slot');
				const calc = document.querySelector('.calculator');
				const hs = document.querySelector('.history-strip, .history-empty');
				const tb = document.querySelector('.game-toolbar');
				const v = { w: window.innerWidth, h: window.innerHeight };
				const sbH = sb?.getBoundingClientRect().height ?? 0;
				const calcH = calc?.getBoundingClientRect().height ?? 0;
				const ratio = calcH > 0 ? (sbH / calcH).toFixed(2) : 'n/a';
				console.log('[layout]', v, {
					gameScreen: gs?.getBoundingClientRect().height,
					toolbar: tb?.getBoundingClientRect().height,
					history: hs?.getBoundingClientRect().height,
					scoreboard: sbH,
					calculator: calcH,
					ratio: `${sbH}:${calcH} = 1:${ratio}`,
					goal12: `1:2 → sb ${Math.round(calcH/2)}px, 1.2:1 → sb ${Math.round(calcH*1.2)}px`
				});
			};
			log();
			const t = setTimeout(log, 500);
			return () => clearTimeout(t);
		});
		</script>

{#if game}
	<div class="game-screen">
		<GameToolbar {setsToWin} {legsToWin} {inRule} {outRule} gameMode={String(start)} onExit={exitGame} />

		<HistoryStrip players={game.players} />

		<div class="scoreboard" class:compact={game.players.length > 2} style:--cols={game.players.length}>
			{#each game.players as player, i}
				<button
					type="button"
					class="player-slot"
					class:active={i === game.current}
					class:clickable={canPickStarting}
					onclick={() => setStartingPlayer(i)}
					disabled={!canPickStarting && i !== game.current}
					aria-label={canPickStarting
						? `Set ${player.name} as starting player`
						: (i === game.current ? `${player.name}, current player` : `${player.name}`)}
				>
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
				</button>
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
				currentScore={game?.players[game.current]?.score ?? null}
			/>
		</div>

		{#if showCommands}
			<div class="command-sheet" role="dialog" aria-modal="true">
				<button class="command-item" disabled={past.length === 0} onclick={() => moreCommand('undo')}>↶ Undo</button>
				<button class="command-item" disabled={future.length === 0} onclick={() => moreCommand('redo')}>↷ Redo</button>
				<button class="command-item" onclick={() => moreCommand('stats')}>Stats</button>
				<button class="command-item" onclick={() => moreCommand('finish')}>Finish game</button>
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

		{#if showEndEarlyModal}
			<div class="exit-modal" role="dialog" aria-modal="true">
				<div class="exit-modal-box">
					<h3>End match early?</h3>
					<p class="muted">The current match will be saved to history with the leading player marked as the winner.</p>
					<div class="exit-actions">
						<button class="btn" onclick={cancelEndEarly}>Cancel</button>
						<button class="btn danger" onclick={doEndEarly}>End match</button>
					</div>
				</div>
			</div>
			<div class="command-backdrop" onclick={cancelEndEarly} aria-hidden="true"></div>
		{/if}

		{#if pendingCheckout}
			<div class="exit-modal" role="dialog" aria-modal="true">
				<div class="exit-modal-box">
					<h3>Checkout attempts</h3>
					<p class="muted">
						How many of your 3 darts were aimed at the close-out
						{#if pendingCheckout.isLegWin}(including the finishing dart){/if}?
					</p>
					<div class="exit-actions">
						{#each Array.from({ length: pendingCheckout.max + 1 }, (_, i) => i) as n}
							<button class="btn primary" onclick={() => recordCheckoutAttempts(n)}>{n}</button>
						{/each}
					</div>
				</div>
			</div>
			<div class="command-backdrop" aria-hidden="true"></div>
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
		grid-template-rows: auto 1fr 6rem auto;
		gap: 0;
		height: 100%;
		min-height: 0;
		padding: var(--space-xs);
		overflow: hidden;
		container-type: size;
		container-name: game-screen;
		width: 100%;
		max-width: 90rem;
		margin-inline: auto;
		user-select: none;
		-webkit-user-select: none;
	}
	.game-screen > .scoreboard { margin-bottom: 0; }
	@media (min-width: 120rem) {
		.game-screen {
			max-width: 80rem;
			gap: var(--space-md);
			padding: var(--space-md);
		}
	}
	@container game-screen (min-height: 900px) {
		.game-screen { padding: var(--space-sm); }
	}
	@container game-screen (max-height: 520px) {
		.game-screen { padding: 2px; }
	}
	.scoreboard {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-xs);
		min-height: 0;
		overflow: hidden;
	}
	.player-slot {
		display: block;
		width: 100%;
		min-height: 0;
		padding: 0;
		margin: 0;
		background: none;
		border: 0;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: default;
	}
	.player-slot.clickable {
		cursor: pointer;
	}
	.player-slot:disabled {
		cursor: default;
	}
	.player-slot.clickable:hover :global(.player-card) {
		border-color: var(--accent);
	}
	.player-slot.active :global(.player-card) {
		border-color: var(--accent);
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
	.scoreboard.compact :global(.player-slot) {
		flex: 0 0 calc(50% - var(--space-xs) * 0.5);
		scroll-snap-align: start;
	}
	.scoreboard.compact :global(.player-card) {
		max-width: none;
		width: auto;
	}
	@container game-screen (max-height: 560px) {
		.scoreboard.compact { gap: 2px; }
		.scoreboard.compact :global(.player-card) {
			flex: 0 0 calc(50% - 1px);
		}
	}
	@container game-screen (min-width: 25rem) {
		.scoreboard:not(.compact) { grid-template-columns: repeat(2, 1fr); }
	}
	@container game-screen (min-width: 50rem) {
		.scoreboard:not(.compact) { grid-template-columns: repeat(var(--cols, 2), 1fr); }
	}
	.calculator-slot {
		min-height: 0;
		height: auto;
		max-height: 100%;
		overflow: hidden;
		flex-shrink: 0;
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
