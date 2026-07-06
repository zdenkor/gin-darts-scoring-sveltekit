<script>
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	/** @type {{setsToWin?: number, legsToWin?: number, gameMode?: string, onExit?: () => void, onFullscreen?: () => void}} */
	let {
		setsToWin = 1,
		legsToWin = 1,
		gameMode = 'X01',
		onExit = () => {},
		onFullscreen = () => {}
	} = $props();

	async function toggleFullscreen() {
		if (!document.fullscreenElement) {
			try { await document.documentElement.requestFullscreen(); } catch {}
		} else {
			try { await document.exitFullscreen(); } catch {}
		}
	}
</script>

<div class="game-toolbar">
	<div class="meta">
		<div><strong>Sets:</strong> {setsToWin}</div>
		<div><strong>Legs:</strong> {legsToWin}</div>
		<div><strong>Game:</strong> {gameMode}</div>
	</div>
	<div class="toolbar-actions">
		<button class="icon-btn" type="button" title="Fullscreen" aria-label="Fullscreen" onclick={toggleFullscreen}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d="M5 5h6v2H7v4H5V5zm8 0h6v6h-2V7h-4V5zM5 13h2v4h4v2H5v-6zm12 0h6v6h-6v-2h4v-4h-2v-2z"/>
			</svg>
		</button>
		<button class="icon-btn danger" type="button" title="Exit game" aria-label="Exit game" onclick={onExit}>⏻</button>
	</div>
</div>

<style>
	.game-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.meta {
		display: flex;
		gap: var(--space-md);
		flex-wrap: nowrap;
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.meta strong { color: var(--text); }
	.toolbar-actions {
		display: flex;
		gap: var(--space-xs);
	}
	.icon-btn {
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		width: 6.5vh;
		height: 6.5vh;
		min-width: 38px;
		min-height: 38px;
		max-width: 48px;
		max-height: 48px;
		border-radius: 0.5em;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 1.3em;
		line-height: 1;
		cursor: pointer;
	}
	.icon-btn:hover { background: #232c3d; }
	.icon-btn > svg {
		width: 80%;
		height: 80%;
		display: block;
	}
	.icon-btn.danger {
		color: var(--danger);
		background: transparent;
		font-size: 2em;
	}
	.icon-btn.danger:hover {
		background: rgba(239, 68, 68, 0.15);
	}
@container app (max-width: 360px) {
		.meta { font-size: 11px; gap: var(--space-sm); }
	}
</style>
