<script>
	import { helpVisible } from '$lib/util/help.js';

	/** @type {{ topic: string, body: string }} */
	let { topic, body } = $props();

	let open = $state(false);

	function show() {
		open = true;
	}
	function close() {
		open = false;
	}
	function onKey(/** @type {KeyboardEvent} */ e) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKey} />

<button
	type="button"
	class="help-icon"
	title={`Help: ${topic}`}
	aria-label={`Help: ${topic}`}
	onclick={show}
	style:display={$helpVisible ? 'inline-flex' : 'none'}
>ⓘ</button>

{#if open}
	<div class="help-modal" role="dialog" aria-modal="true" aria-label={topic}>
		<button class="help-backdrop" type="button" aria-label="Close help" onclick={close}></button>
		<div class="help-modal-box">
			<div class="help-modal-header">
				<h3>{topic}</h3>
				<button type="button" class="help-close" onclick={close} aria-label="Close">×</button>
			</div>
			<div class="help-modal-body">
				{#each body.split(/\n\s*\n/) as paragraph}
					<p>{paragraph}</p>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.help-icon {
		width: 18px;
		height: 18px;
		min-width: 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 1px solid var(--line);
		background: transparent;
		color: var(--muted);
		font-size: 11px;
		line-height: 1;
		margin-left: 6px;
		padding: 0;
		cursor: help;
		vertical-align: middle;
	}
	.help-icon:hover {
		color: var(--text);
		border-color: var(--text);
		background: rgba(255, 255, 255, 0.08);
	}
	.help-icon:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.help-modal {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}
	.help-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.help-modal-box {
		position: relative;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-md);
		width: min(90vw, 32rem);
		max-height: 80vh;
		overflow: auto;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
	}
	.help-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	.help-modal-header h3 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.help-close {
		background: transparent;
		border: 0;
		color: var(--muted);
		font-size: 1.5em;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.3em;
	}
	.help-close:hover { color: var(--text); }
	.help-modal-body p { line-height: 1.5; margin: 0 0 var(--space-sm); }
	.help-modal-body p:last-child { margin-bottom: 0; }
	.help-modal-body ul { padding-left: 18px; margin: 8px 0; }
	.help-modal-body li { margin-bottom: 4px; }
</style>
