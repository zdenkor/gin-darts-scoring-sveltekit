<script>
	import {
		fetchPlayerHistory,
		fetchTournamentDetail,
		parseHistoryEvent,
		computePlayerStats
	} from '$lib/nostr/history.js';

	let licenseId = $state(/** @type {string} */ (''));
	let loading = $state(false);
	let error = $state(/** @type {string} */ (''));
	let stats = $state(/** @type {any} */ (null));
	let tournaments = $state(/** @type {any[]} */ ([]));

	async function search(/** @type {Event | null} */ e) {
		if (e) e.preventDefault();
		const id = licenseId.trim();
		if (!id) return;
		loading = true;
		error = '';
		stats = null;
		tournaments = [];
		try {
			const events = await fetchPlayerHistory({ licenseId: id });
			const parsed = events.map(parseHistoryEvent);
			tournaments = parsed;
			// Try to follow every data_url in parallel and
			// collect the ones we manage to fetch — the
			// stats view is best-effort because the
			// public data URLs may have CORS issues or
			// the file might have been moved.
			const details = await Promise.all(parsed.map((t) => fetchTournamentDetail(t.data_url)));
			stats = computePlayerStats(id, details.filter(Boolean));
		} catch (e) {
			error = String(e?.message || e);
		} finally {
			loading = false;
		}
	}
</script>

<div class="screen scrollable">
	<div class="card">
		<header class="head">
			<h1>Player history</h1>
		</header>

		<p class="muted">
			Look up a player by their SVK license number to see every
			tournament they competed in that was published on the public
			NOSTR relays. Career stats (W/L, 3-dart average, 180s, high
			checkout) are computed from the bracket JSONs the admin
			uploaded alongside the event.
		</p>

		<form class="search-form" onsubmit={search}>
			<input
				class="search"
				type="search"
				placeholder="SVK license number (e.g. SK123456)"
				bind:value={licenseId}
				autocomplete="off"
			/>
			<button class="btn primary" type="submit" disabled={loading || !licenseId.trim()}>
				{loading ? 'Searching…' : 'Search'}
			</button>
		</form>

		{#if error}
			<p class="error">Couldn't reach the relays: {error}</p>
		{/if}

		{#if stats && stats.tournaments === 0}
			<p class="muted">No tournaments found for {stats.licenseId}.</p>
		{/if}

		{#if stats && stats.tournaments > 0}
			<section class="stats">
				<h2>Career stats</h2>
				<dl>
					<dt>Tournaments</dt><dd>{stats.tournaments}</dd>
					<dt>Wins</dt><dd>{stats.wins}</dd>
					<dt>Losses</dt><dd>{stats.losses}</dd>
					{#if stats.threeDartAverage !== null}
						<dt>3-dart average</dt><dd>{stats.threeDartAverage}</dd>
					{/if}
					{#if stats.oneEighties > 0}
						<dt>180s</dt><dd>{stats.oneEighties}</dd>
					{/if}
					{#if stats.highCheckout > 0}
						<dt>High checkout</dt><dd>{stats.highCheckout}</dd>
					{/if}
				</dl>
				{#if stats.clubs.length > 0}
					<p class="muted">
						Clubs: {stats.clubs.join(', ')}
					</p>
				{/if}
				{#if stats.formats.length > 0}
					<p class="muted">
						Formats: {stats.formats.join(', ')}
					</p>
				{/if}
			</section>

			<section class="tournaments">
				<h2>Tournaments</h2>
				<ul class="list">
					{#each tournaments as t (t.id)}
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
			</section>
		{/if}
	</div>
</div>

<style>
	.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
	.search-form { display: flex; gap: var(--space-sm); margin: var(--space-md) 0; }
	.search {
		flex: 1 1 auto;
		padding: var(--space-sm);
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--line);
		border-radius: var(--radius, 8px);
		font: inherit;
	}
	.stats { margin-top: var(--space-md); }
	.stats dl { display: grid; grid-template-columns: max-content 1fr; column-gap: var(--space-md); row-gap: var(--space-xs); margin: 0; }
	.stats dt { color: var(--muted); }
	.stats dd { margin: 0; font-weight: 600; }
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
	.error { color: #ff6b6b; font-size: var(--text-sm); }
	.btn.small { font-size: var(--text-sm); padding: 4px 8px; }
</style>
