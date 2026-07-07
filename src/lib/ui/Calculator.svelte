<script>
	import { onMount } from 'svelte';

	/** @type {{onCommit: (value: number) => void, onChange?: (value: number) => void, onUndo?: () => void, onRedo?: () => void, onMore?: () => void, canUndo?: boolean, canRedo?: boolean, disabled?: boolean}} */
	let {
		onCommit,
		onChange = () => {},
		onUndo,
		onRedo,
		onMore,
		canUndo = false,
		canRedo = false,
		disabled = false
	} = $props();

	const TILES = [
		'1', '2', '3',
		'4', '5', '6',
		'7', '8', '9',
		'⌫', '0', '↵'
	];
	const FAST_SCORES = [26, 41, 45, 60, 81, 85, 100, 140];
	const LEFT_FAST = FAST_SCORES.slice(0, 4);
	const RIGHT_FAST = FAST_SCORES.slice(4);

	let buffer = $state('0');
	let formRef = $state(/** @type {HTMLFormElement|null} */ (null));

	function updateDisplay() {
		onChange?.(parseInt(buffer, 10) || 0);
	}

	function pressDigit(digit) {
		if (disabled) return;
		if (buffer === '0') buffer = digit;
		else if (buffer.length < 4) buffer += digit;
		updateDisplay();
	}

	function backspace() {
		if (disabled) return;
		if (buffer.length > 1) buffer = buffer.slice(0, -1);
		else buffer = '0';
		updateDisplay();
	}

	function commit() {
		if (disabled) return false;
		const value = parseInt(buffer, 10) || 0;
		if (value > 180) return false;
		console.log('Calculator commit', value);
		onCommit(value);
		buffer = '0';
		updateDisplay();
		return false;
	}

	function fastScore(value) {
		if (disabled) return;
		buffer = String(value);
		updateDisplay();
		console.log('fastScore', value);
		formRef?.requestSubmit();
	}

	function handleTile(tile) {
		if (tile === '⌫') backspace();
		else if (tile === '↵') formRef?.requestSubmit();
		else pressDigit(tile);
	}

	function onKeyDown(e) {
		if (disabled) return;
		if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
		else if (e.key === 'Backspace') backspace();
		else if (e.key === 'Enter') {
			e.preventDefault();
			formRef?.requestSubmit();
		}
	}

	function reset() {
		buffer = '0';
		updateDisplay();
	}

	function handleNativeClick(e) {
		const target = /** @type {HTMLElement} */ (e.target).closest('button');
		if (!target || target.disabled) return;
		const text = target.textContent?.trim();
		if (!text) return;
		if (target.type === 'submit') {
			e.preventDefault();
			commit();
			return;
		}
		if (text === '↶') { onUndo?.(); return; }
		if (text === '↷') { onRedo?.(); return; }
		if (text === '00') { reset(); return; }
		if (text === '⋯') { onMore?.(); return; }
		if (FAST_SCORES.includes(Number(text))) { fastScore(Number(text)); return; }
		handleTile(text);
	}

	onMount(() => {
		const form = formRef;
		if (!form) return;
		form.addEventListener('click', handleNativeClick);
		return () => form.removeEventListener('click', handleNativeClick);
	});
</script>

<svelte:window onkeydown={onKeyDown} />

<form bind:this={formRef} class="calculator" role="group" aria-label="Score entry" onsubmit={(e) => { e.preventDefault(); commit(); }}>
	<div class="calc-display">
		<span class="calc-entered">{buffer}</span>
	</div>

	<div class="actions">
			<button class="action-btn" type="button" disabled={!canUndo || disabled} onclick={() => onUndo?.()}>↶</button>
			<button class="action-btn" type="button" disabled={!canRedo || disabled} onclick={() => onRedo?.()}>↷</button>
			<button class="action-btn" type="submit" disabled={disabled}>＝</button>
			<button class="action-btn" type="button" disabled={disabled} onclick={reset}>00</button>
			<button class="action-btn" type="button" onclick={() => onMore?.()} aria-label="More commands">⋯</button>
		</div>

		<div class="calc-body">
			<div class="fast-col left">
				{#each LEFT_FAST as score}
					<button class="fast-btn" type="button" disabled={disabled} onclick={() => fastScore(score)}>{score}</button>
				{/each}
			</div>

			<div class="numpad">
				{#each TILES as tile}
					{#if tile === '↵'}
						<button class="num-btn primary" type="submit" disabled={disabled}>{tile}</button>
					{:else if tile === '⌫'}
						<button class="num-btn danger" type="button" disabled={disabled} onclick={() => handleTile(tile)}>
							{tile}
						</button>
					{:else}
						<button class="num-btn" type="button" disabled={disabled} onclick={() => handleTile(tile)}>
							{tile}
						</button>
					{/if}
				{/each}
			</div>

		<div class="fast-col right">
			{#each RIGHT_FAST as score}
				<button class="fast-btn" type="button" disabled={disabled} onclick={() => fastScore(score)}>{score}</button>
			{/each}
		</div>
	</div>
</form>

<style>
	.calculator {
		container-type: inline-size;
		container-name: calculator;
		background: var(--bg-2);
		border-top: 1px solid var(--line);
		padding: var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		width: 100%;
		height: auto;
		max-height: 100%;
		min-height: 0;
		max-width: clamp(40rem, 60vw, 80rem);
		margin-inline: auto;
	}
	.calc-display {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-xs) var(--space-sm);
		text-align: right;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		min-height: 0;
		line-height: 1;
		flex: 0 0 auto;
	}
	.calc-entered {
		font-size: var(--text-lg);
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	@container calculator (min-width: 30rem) {
		.calc-entered { font-size: var(--text-xl); }
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: var(--space-xs);
		flex: 0 0 auto;
	}
	.action-btn {
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: var(--text-md);
		cursor: pointer;
		transition: background .1s ease;
		padding: var(--space-xs);
		min-height: clamp(2.6rem, 5vh, 3.5rem);
		min-width: 0;
		flex: 1;
	}
	.action-btn.primary {
		/* Equals = tlačidlo nie je primárne akcia (primárne je Enter) */
	}
	.action-btn.primary:hover {
		/* no-op */
	}
	.action-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.calc-body {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		grid-auto-rows: minmax(clamp(2.5rem, 6vh, 4rem), 1fr);
		gap: var(--space-xs);
		min-height: 0;
		overflow: hidden;
	}
	@media (orientation: landscape) and (max-height: 500px) {
		.calc-body { grid-template-columns: 1fr; grid-auto-rows: minmax(clamp(2.2rem, 7vh, 3rem), 1fr); }
		.fast-col { display: none; }
	}
	@container calculator (max-width: 26rem) {
		.calc-body { grid-template-columns: 1fr; }
		.fast-col { display: none; }
	}
	.fast-col {
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: repeat(4, minmax(clamp(2.5rem, 6vh, 4rem), 1fr));
		gap: var(--space-xs);
		min-height: 0;
	}
	.fast-btn {
		background: var(--surface);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: var(--text-md);
		cursor: pointer;
		transition: background .1s ease;
		min-width: 0;
		width: 100%;
		min-height: 0;
		padding: var(--space-xs);
		flex: 1;
	}
	.numpad {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(4, minmax(clamp(2.5rem, 6vh, 4rem), 1fr));
		gap: var(--space-xs);
		min-height: 0;
	}
	.num-btn {
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: var(--text-md);
		cursor: pointer;
		transition: background .1s ease;
		padding: var(--space-xs);
		min-height: 0;
		min-width: 0;
		flex: 1;
	}
	.num-btn:hover, .fast-btn:hover {
		background: #232c3d;
	}
	.num-btn:active, .fast-btn:active {
		transform: translateY(1px);
	}
	.num-btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #062018;
	}
	.num-btn.primary:hover {
		background: #2cd49a;
	}
	.num-btn.danger {
		background: var(--danger);
		border-color: var(--danger);
		color: #2a070c;
	}
	.num-btn.danger:hover {
		background: #ff6b80;
	}
	.num-btn.wide {
		grid-column: span 2;
	}
	.num-btn:disabled, .fast-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	@container calculator (min-width: 30rem) {
		.action-btn { font-size: var(--text-lg); }
		.num-btn, .fast-btn { font-size: var(--text-lg); }
	}
	@media (min-width: 80rem) {
		.action-btn { font-size: var(--text-lg); padding: var(--space-sm); }
		.num-btn, .fast-btn { font-size: var(--text-lg); padding: var(--space-sm); }
	}
	@media (prefers-reduced-motion: reduce) {
		.action-btn, .num-btn, .fast-btn { transition: none; }
		.num-btn:active, .fast-btn:active { transform: none; }
	}
</style>
