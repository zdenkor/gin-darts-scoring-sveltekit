<script>
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import fullScreenIcon from '$lib/assets/full-screen.svg?raw';
	import fullScreenExitIcon from '$lib/assets/full-screen-exit.svg?raw';

	/** @type {{setsToWin?: number, legsToWin?: number, gameMode?: string, onExit?: () => void, onFullscreen?: () => void}} */
	let {
		setsToWin = 1,
		legsToWin = 1,
		gameMode = 'X01',
		onExit = () => {},
		onFullscreen = () => {}
	} = $props();

	let isFullscreen = $state(false);

	function syncFullscreen() {
		isFullscreen = !!document.fullscreenElement;
	}

	async function toggleFullscreen() {
		if (!document.fullscreenElement) {
			try { await document.documentElement.requestFullscreen(); } catch {}
		} else {
			try { await document.exitFullscreen(); } catch {}
		}
		syncFullscreen();
	}

	$effect(() => {
		document.addEventListener('fullscreenchange', syncFullscreen);
		syncFullscreen();
		return () => document.removeEventListener('fullscreenchange', syncFullscreen);
	});
</script>

<div class="game-toolbar">
	<div class="meta">
		<div><strong>Sets:</strong> {setsToWin}</div>
		<div><strong>Legs:</strong> {legsToWin}</div>
		<div><strong>Game:</strong> {gameMode}</div>
	</div>
	<div class="toolbar-actions">
		<button class="icon-btn" type="button" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onclick={toggleFullscreen}>
			<span class="icon-svg">{@html isFullscreen ? fullScreenExitIcon : fullScreenIcon}</span>
		</button>
		<button class="icon-btn danger" type="button" title="Turn off / Exit game" aria-label="Turn off / Exit game" onclick={onExit}>
			<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
				<path fill-rule="evenodd" d="M17.7510477,5.00945512 C18.1156885,4.65317657 18.6832031,4.63202809 19.07193,4.94158256 L19.1651661,5.02585826 L19.2621783,5.12532271 C21.0085837,6.96960051 22,9.40828462 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,9.5209679 2.90708036,7.18194928 4.52382631,5.35934352 L4.74867188,5.11404263 L4.83483391,5.02585826 C5.22080233,4.63083063 5.85392472,4.6234867 6.24895234,5.00945512 C6.61359323,5.36573366 6.64790008,5.93260493 6.34744581,6.32840766 L6.26535549,6.42357355 L6.1900436,6.50047785 C4.79197458,7.97689773 4,9.92499537 4,12 C4,16.418278 7.581722,20 12,20 C16.418278,20 20,16.418278 20,12 C20,10.0342061 19.2891973,8.18231218 18.0348658,6.74705738 L17.8208065,6.51175792 L17.7346445,6.42357355 C17.3486761,6.02854592 17.35602,5.39542354 17.7510477,5.00945512 Z M12,2 C12.5522847,2 13,2.44771525 13,3 L13,11 C13,11.5522847 12.5522847,12 12,12 C11.4477153,12 11,11.5522847 11,11 L11,3 C11,2.44771525 11.4477153,2 12,2 Z"/>
			</svg>
		</button>
	</div>
</div>

<style>
	.game-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
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
		width: clamp(2.4rem, 6.5cqi, 3rem);
		height: clamp(2.4rem, 6.5cqi, 3rem);
		border-radius: 0.5em;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-lg);
		line-height: 1;
		cursor: pointer;
	}
	.icon-btn:hover { background: #232c3d; }
	.icon-btn > svg {
		width: 80%;
		height: 80%;
		display: block;
	}
	.icon-svg { display: inline-flex; align-items: center; justify-content: center; width: 80%; height: 80%; color: inherit; }
	.icon-svg :global(svg) { width: 100%; height: 100%; display: block; color: inherit; }
	.icon-btn.danger {
		color: var(--danger);
		background: transparent;
	}
	.icon-btn.danger > svg {
		width: 80%;
		height: 80%;
		display: block;
	}
	.icon-btn.danger:hover {
		background: rgba(239, 68, 68, 0.15);
	}
@container app (max-width: 22.5rem) {
	.meta { font-size: var(--text-xs); gap: var(--space-sm); }
}
@media (min-width: 80rem) {
	.meta { font-size: var(--text-md); gap: var(--space-lg); }
	.toolbar-actions { gap: var(--space-sm); }
}
@media (prefers-reduced-motion: reduce) {
	.icon-btn { transition: none; }
}
</style>
