<script>
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
		if (disabled) return;
		const value = parseInt(buffer, 10) || 0;
		onCommit(value);
		buffer = '0';
		updateDisplay();
	}

	function fastScore(value) {
		if (disabled) return;
		buffer = String(value);
		updateDisplay();
	}

	function handleTile(tile) {
		if (tile === '⌫') backspace();
		else if (tile === '↵') commit();
		else pressDigit(tile);
	}

	function onKeyDown(e) {
		if (disabled) return;
		if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
		else if (e.key === 'Backspace') backspace();
		else if (e.key === 'Enter') commit();
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="calculator" role="group" aria-label="Score entry">
	<div class="calc-display">
		<span class="calc-entered">{buffer}</span>
	</div>

	<div class="calc-body">
		<div class="fast-col left">
			{#each LEFT_FAST as score}
				<button class="fast-btn" type="button" disabled={disabled} onclick={() => fastScore(score)}>{score}</button>
			{/each}
		</div>

		<div class="numpad">
			{#each TILES as tile}
				<button class="num-btn" class:wide={tile === '↵' || tile === '⌫'} type="button" disabled={disabled} onclick={() => handleTile(tile)}>
					{tile}
					</button>
			{/each}
		</div>

		<div class="fast-col right">
			{#each RIGHT_FAST as score}
				<button class="fast-btn" type="button" disabled={disabled} onclick={() => fastScore(score)}>{score}</button>
			{/each}
		</div>
	</div>

	<div class="actions">
		<button class="action-btn" type="button" disabled={!canUndo || disabled} onclick={() => onUndo?.()}>↶</button>
		<button class="action-btn" type="button" disabled={!canRedo || disabled} onclick={() => onRedo?.()}>↷</button>
		<button class="action-btn primary" type="button" disabled={disabled} onclick={commit}>＝</button>
		<button class="action-btn" type="button" disabled={disabled} onclick={() => { buffer = '0'; updateDisplay(); }}>00</button>
		<button class="action-btn" type="button" onclick={() => onMore?.()} aria-label="More commands">⋯</button>
	</div>
</div>

<style>
	.calculator {
		container-type: inline-size;
		container-name: calculator;
		background: var(--bg-2);
		border-top: 1px solid var(--line);
		padding: var(--space-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
		max-width: 720px;
		margin-inline: auto;
	}
	.calc-display {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: var(--space-sm) var(--space-md);
		text-align: right;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}
	.calc-entered {
		font-size: var(--text-xl);
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.calc-body {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-sm);
	}
	@container calculator (min-width: 420px) {
		.calc-body { grid-template-columns: auto 1fr auto; }
	}
	.fast-col {
		display: none;
		grid-template-columns: 1fr;
		gap: var(--space-sm);
	}
	@container calculator (min-width: 420px) {
		.fast-col { display: grid; }
	}
	.numpad {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-sm);
	}
	.num-btn, .fast-btn, .action-btn {
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 10px;
		min-height: 44px;
		font-weight: 600;
		font-size: var(--text-md);
		cursor: pointer;
		transition: background .1s ease;
	}
	.num-btn:hover, .fast-btn:hover, .action-btn:hover {
		background: #232c3d;
	}
	.num-btn:active, .fast-btn:active, .action-btn:active {
		transform: translateY(1px);
	}
	.num-btn {
		aspect-ratio: 1.3 / 1;
	}
	.num-btn.wide {
		aspect-ratio: auto;
	}
	.num-btn:disabled, .fast-btn:disabled, .action-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.fast-btn {
		background: var(--surface);
		min-width: 56px;
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: var(--space-sm);
	}
	.action-btn {
		font-size: var(--text-lg);
		padding: var(--space-xs);
	}
	.action-btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #062018;
	}
	.action-btn.primary:hover {
		background: #2cd49a;
	}
@container calculator (min-width: 480px) {
		.action-btn { font-size: var(--text-xl); }
	}
</style>
