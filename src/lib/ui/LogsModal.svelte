<script>
	/**
	 * Modal that lists the most recent log entries per
	 * category. One tab per category; the user clicks
	 * through to switch. The list is newest-first; the
	 * timestamp is rendered as a short HH:MM:SS so the
	 * pane stays compact.
	 */
	import { onMount } from 'svelte';
	import { LOG_CATEGORIES, LOG_CATEGORY_LABELS } from '$lib/debug/categories.js';
	import { getLogs, clearLogs } from '$lib/debug/logger.js';

	let { open = false, onClose = () => {} } = $props();

	let activeTab = $state(/** @type {string} */ ('nostr'));
	let entries = $state(/** @type {any[]} */ ([]));
	let loading = $state(false);

	async function refresh(/** @type {string} */ cat) {
		loading = true;
		try {
			entries = await getLogs(cat, 200);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) refresh(activeTab);
	});

	async function clear() {
		await clearLogs(activeTab);
		entries = [];
	}

	function fmtTime(/** @type {number} */ ts) {
		const d = new Date(ts);
		const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
		return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	}

	function onBackdrop(/** @type {MouseEvent} */ e) {
		if (e.target === e.currentTarget) onClose();
	}

	function onKey(/** @type {KeyboardEvent} */ e) {
		if (e.key === 'Escape') onClose();
	}

	onMount(() => {
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div class="backdrop" onclick={onBackdrop} role="presentation">
		<div class="modal" role="dialog" aria-modal="true" aria-label="Debug logs">
			<header>
				<h2>Debug logs</h2>
				<button class="btn ghost" type="button" onclick={onClose} aria-label="Close">✕</button>
			</header>

			<nav class="tabs" role="tablist">
				{#each LOG_CATEGORIES as cat (cat)}
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === cat}
						class:active={activeTab === cat}
						onclick={() => { activeTab = cat; refresh(cat); }}
					>
						{LOG_CATEGORY_LABELS[cat]}
					</button>
				{/each}
			</nav>

			<div class="bar">
				<span class="muted">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
				<button class="btn ghost small" type="button" onclick={clear}>Clear {LOG_CATEGORY_LABELS[activeTab]}</button>
			</div>

			<div class="list">
				{#if loading}
					<p class="muted">Loading…</p>
				{:else if entries.length === 0}
					<p class="muted">No log entries yet for {LOG_CATEGORY_LABELS[activeTab]}.</p>
				{:else}
					{#each entries as e (e.ts)}
						<div class="entry">
							<span class="ts">{fmtTime(e.ts)}</span>
							<span class="msg">{e.message}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed; inset: 0; z-index: 100;
		background: rgba(0, 0, 0, 0.6);
		display: flex; align-items: center; justify-content: center;
		padding: var(--space-md);
	}
	.modal {
		background: var(--bg, #14181f);
		border: 1px solid var(--line);
		border-radius: var(--radius, 8px);
		width: min(640px, 100%);
		max-height: 80vh;
		display: flex; flex-direction: column;
		overflow: hidden;
	}
	header {
		display: flex; align-items: center; justify-content: space-between;
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--line);
	}
	header h2 { margin: 0; font-size: var(--text-md); }
	.tabs {
		display: flex; gap: 2px;
		padding: var(--space-xs) var(--space-sm);
		border-bottom: 1px solid var(--line);
	}
	.tabs button {
		flex: 1 1 0; padding: var(--space-xs) var(--space-sm);
		background: transparent; color: var(--muted);
		border: 1px solid transparent; border-radius: var(--radius, 6px);
		font: inherit; cursor: pointer;
	}
	.tabs button.active { background: var(--surface); color: var(--text); border-color: var(--line); }
	.bar {
		display: flex; align-items: center; justify-content: space-between;
		padding: var(--space-xs) var(--space-md);
		font-size: var(--text-sm);
	}
	.list {
		overflow-y: auto;
		padding: var(--space-xs) var(--space-md);
		flex: 1 1 auto;
		font-family: var(--mono, ui-monospace, monospace);
		font-size: var(--text-sm);
	}
	.entry {
		display: grid; grid-template-columns: max-content 1fr;
		gap: var(--space-sm);
		padding: 4px 0;
		border-bottom: 1px dashed var(--line);
	}
	.ts { color: var(--muted); }
	.msg { word-break: break-all; }
	.btn.small { font-size: var(--text-sm); padding: 4px 8px; }
</style>
