<script>
	import { onMount } from 'svelte';
	import { fetchTournaments, parseTournamentEvent, DEFAULT_RELAYS } from '$lib/nostr/calendar.js';
	import { getStoredKeypair } from '$lib/nostr/identity.js';

	let loading = $state(true);
	let error = $state(/** @type {string} */ (''));
	let tournaments = $state(/** @type {any[]} */ ([]));
	let query = $state(/** @type {string} */ (''));
	// x-only public key of the currently signed-in user,
	// or empty string for anonymous. Used to flag the
	// user's own events with an Edit link in the list
	// below. Recomputed on mount; we don't watch for
	// sign-in changes because the calendar is already
	// pulled on every Reload.
	let myPubkey = $state(/** @type {string} */ (''));

	// The NOSTR event carries the start time in an ISO
	// stamp like "2026-04-15" or "2026-04-15T18:00". The
	// raw stamp is fine for sorting, but the user
	// wants to read the day and the hour at a glance,
	// so we project it into a friendly "Sat 15 Apr
	// 2026, 18:00" string. Date-only stamps render
	// without the time bit so we don't mislead the
	// reader into thinking the time is known.
	function formatStarts(/** @type {string} */ iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		const datePart = d.toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
		// The time component is only present when the
		// stamp contains a "T" (e.g. "2026-04-15T18:00").
		// Pure date strings ("2026-04-15") skip it.
		if (!iso.includes('T')) return datePart;
		const timePart = d.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit'
		});
		return `${datePart}, ${timePart}`;
	}

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

	onMount(() => {
		// Hydrate `myPubkey` so the Edit link in the list
		// below can light up for the signed-in user. We
		// read once; if the user signs in later they can
		// just hit Reload.
		try {
			const kp = getStoredKeypair();
			myPubkey = kp?.publicKey || '';
		} catch {
			myPubkey = '';
		}
		load();
	});

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
							<strong class="name">
								{#if t.legacy}
									Untitled (legacy event)
								{:else}
									{t.name || 'Untitled competition'}
								{/if}
							</strong>
							<div class="meta">
								{#if t.date}<span>{formatStarts(t.date)}</span>{/if}
								{#if t.location}<span> · {t.location}</span>{/if}
								{#if t.format}<span> · {t.format}</span>{/if}
							</div>
						</div>
						<div class="row-actions">
							{#if myPubkey && t.pubkey === myPubkey}
								<!-- The signed-in user is the
								     author of this NOSTR event.
								     Surface an Edit shortcut
								     that takes them straight
								     to the existing edit
								     route. We can only edit
								     tournaments that have a
								     stable `tournamentId`
								     (parsed from the `d`
								     tag); round events use
								     `round-{roundId}` and
								     can be edited through
								     their parent league. -->
								<a
									class="btn ghost small"
									href={t.tournamentId?.startsWith('round-')
										? `/competitions/${(t.tournamentId || '').replace(/^round-/, '')}/edit`
										: `/competitions/${t.tournamentId || t.id}/edit`}
									aria-label="Edit this competition"
								>
									Edit
								</a>
							{/if}
							{#if t.data_url}
								<a class="btn ghost small" href={t.data_url} target="_blank" rel="noopener">Open bracket</a>
							{/if}
						</div>
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
