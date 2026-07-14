<script>
	import { onMount } from 'svelte';
	import { fetchTournaments, parseTournamentEvent, deleteTournament, DEFAULT_RELAYS } from '$lib/nostr/calendar.js';
	import { getStoredKeypair } from '$lib/nostr/identity.js';
	// `base` is the configured URL prefix (empty in dev,
	// `/gin-darts-scoring-sveltekit` on GitHub Pages).
	// Raw `href="/..."` strings would otherwise resolve
	// against the bare origin and skip the prefix, so we
	// prepend `base` to every internal link below.
	import { base } from '$app/paths';

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
	// Tracks which event id the user has just asked to
	// delete, so we can show "deleting…" feedback. Keyed
	// by NOSTR event id.
	let deletingId = $state(/** @type {string} */ (''));

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

	// Issue a NIP-09 deletion request for one of the
	// signed-in user's own events. Relays that respect
	// NIP-09 will drop the original event; the rest
	// may keep it (the spec is best-effort). Either
	// way, we hide the row locally so the user
	// immediately sees their intent take effect.
	async function handleDelete(/** @type {any} */ t) {
		if (!t?.id) return;
		const ok = confirm(
			`Delete "${t.name || 'this tournament'}"?\n\n` +
			`A NOSTR NIP-09 deletion request will be sent to all relays. ` +
			`Relays that respect NIP-09 will remove the event; others may keep it.`
		);
		if (!ok) return;
		const kp = getStoredKeypair();
		if (!kp?.secretKey) {
			alert('Not signed in.');
			return;
		}
		deletingId = t.id;
		try {
			const success = await deleteTournament({
				secretKey: kp.secretKey,
				event: {
					id: t.id,
					kind: 30001,
					pubkey: t.pubkey,
					// parseTournamentEvent exposes the raw
					// tags, so we can hand them straight
					// through and let the delete function
					// pick out the `d` identifier.
					tags: t._rawTags || []
				}
			});
			if (success) {
				// Hide the row optimistically — the next
				// Reload will confirm the relay dropped it.
				tournaments = tournaments.filter((/** @type {any} */ x) => x.id !== t.id);
			} else {
				alert('No relay accepted the deletion request. Check the NOSTR logs for details.');
			}
		} catch (e) {
			alert('Delete failed: ' + (e?.message || e));
		} finally {
			deletingId = '';
		}
	}

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
								     route. We only render the
								     link when we have a
								     usable `tournamentId`
								     (parsed from the `d`
								     tag). Round events use
								     `round-{roundId}` and
								     can be edited through
								     their parent league.
								     Legacy events (JSON
								     parse failed) and events
								     without a stable `d` tag
								     are skipped — clicking
								     through to a non-existent
								     IDB record would land on
								     GitHub Pages' raw 404
								     page. -->
								{#if t.tournamentId && !t.legacy}
									{@const editId = t.tournamentId.startsWith('round-')
										? t.tournamentId.replace(/^round-/, '')
										: t.tournamentId}
									<a
										class="btn ghost small"
										href={`${base}/competitions/${editId}/edit`}
										aria-label="Edit this competition"
									>
										Edit
									</a>
								{/if}
							{/if}
							{#if t.data_url}
								<a class="btn ghost small" href={t.data_url} target="_blank" rel="noopener">Open bracket</a>
							{/if}
							{#if myPubkey && t.pubkey === myPubkey && t.tournamentId && !t.legacy}
								<button
									type="button"
									class="btn danger small"
									onclick={() => handleDelete(t)}
									disabled={deletingId === t.id}
									aria-label="Delete this competition from NOSTR"
									title="Send a NIP-09 deletion request"
								>
									{deletingId === t.id ? 'Deleting…' : 'Delete'}
								</button>
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
