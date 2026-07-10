<script>
	import { onMount } from 'svelte';
	import { fetchTournaments, parseTournamentEvent, DEFAULT_RELAYS } from '$lib/nostr/calendar.js';

	let loading = $state(true);
	let error = $state(/** @type {string} */ (''));
	let tournaments = $state(/** @type {any[]} */ ([]));
	let query = $state(/** @type {string} */ (''));

	// Fetch a fresh calendar on mount. The user can
	// pull to refresh later via the Reload button; we
	// deliberately keep the page static (no polling)
	// so it doesn't pin a websocket open in the
	// background.
	async function load() {
		loading = true;
		error = '';
		try {
			const events = await fetchTournaments();
			tournaments = events.map(parseTournamentEvent);
		} catch (e) {
			error = String(e?.message || e);
		} finally {
			loading = false;
		}
	}

	onMount(load);

	// In-memory filter: matches the user query against
	// the name, location, and format fields. Kept on
	// the client side because the relay has already
	// returned everything we want — re-querying with
	// extra filters would be slower and would force
	// us to surface an additional form.
	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return tournaments;
		return tournaments.filter((t) => {
			return (
				(t.name || '').toLowerCase().includes(q) ||
				(t.location || '').toLowerCase().includes(q) ||
				(t.format || '').toLowerCase().includes(q)
			);
		});
	});
</script>

<div class="screen scrollable">
	<div class="card">
		<header class="head">
			<h1>Calendar</h1>
			<button class="btn ghost" type="button" onclick={load} disabled={loading}>
				{loading ? 'Loading…' : 'Reload'}
			</button>
		</header>

		<p class="muted">
			Darts tournaments published on the public NOSTR relays
			(kind <code>30001</code>, tag <code>darts-tournament</code>).
			This view is read-only — to publish a tournament you need to
			sign in and create it from the Competitions tab.
		</p>

		<input
			class="search"
			type="search"
			placeholder="Search by name, location, or format…"
			bind:value={query}
		/>

		{#if error}
			<p class="error">Couldn't reach the relays: {error}</p>
		{/if}

		{#if loading && tournaments.length === 0}
			<p class="muted">Loading tournaments…</p>
		{:else if visible.length === 0}
			<p class="muted">No tournaments matched the search.</p>
		{:else}
			<ul class="list">
				{#each visible as t (t.id)}
					<li class="row">
						<div class="row-main">
							<strong class="name">{t.name || 'Untitled tournament'}</strong>
							<div class="meta">
								{#if t.date}<span>{t.date}</span>{/if}
								{#if t.location}<span> · {t.location}</span>{/if}
								{#if t.format}<span> · {t.format}</span>{/if}
							</div>
						</div>
						{#if t.data_url}
							<a class="btn ghost small" href={t.data_url} target="_blank" rel="noopener">Open bracket</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<footer class="foot muted">
			Read from {DEFAULT_RELAYS.length} relays: {DEFAULT_RELAYS.join(', ')}
		</footer>
	</div>
</div>

<style>
	.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
	.search {
		width: 100%;
		padding: var(--space-sm);
		margin: var(--space-sm) 0;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--line);
		border-radius: var(--radius, 8px);
		font: inherit;
	}
	.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
	.row {
		display: flex; align-items: center; gap: var(--space-sm);
		padding: var(--space-sm);
		background: var(--bg-2, #14181f);
		border: 1px solid var(--line);
		border-radius: var(--radius, 8px);
	}
	.row-main { flex: 1 1 auto; min-width: 0; }
	.name { display: block; }
	.meta { font-size: var(--text-sm); color: var(--muted); }
	.foot { margin-top: var(--space-md); font-size: var(--text-xs); }
	.error { color: #ff6b6b; font-size: var(--text-sm); }
	.btn.small { font-size: var(--text-sm); padding: 4px 8px; }
</style>
