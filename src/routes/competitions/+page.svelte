<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		listCompetitions,
		createCompetitionWithMatches,
		createChildTournamentsForLeague,
		deleteCompetition,
		seedCompetitionsIfEmpty,
		listMatches
	} from '$lib/db/competitions.js';
	import { isSignedIn } from '$lib/auth/google.js';
	import { pushCompetition, markDirty } from '$lib/auth/sync.js';
	import { getStoredKeypair } from '$lib/nostr/identity.js';
	import { publishTournament } from '$lib/nostr/calendar.js';
	import { log } from '$lib/debug/logger.js';
	import CompetitionForm from '$lib/ui/CompetitionForm.svelte';

	// Tab visibility for the empty-state banner. We show
	// the four actions (Open / Edit / Watch / Delete) when
	// the list has entries, and the Create button when the
	// list is empty. No local form state any more — the
	// reusable <CompetitionForm> handles everything.
	let competitions = $state(/** @type {any[]} */ ([]));
	let matchCounts = $state(/** @type {Record<string, number>} */ ({}));
	let loading = $state(true);
	let formOpen = $state(false);

	let formError = $state('');
	let saving = $state(false);
	// Finer-grained progress for the saving dialog.
	// `saving` flips true the moment the user clicks
	// Save; `savingPhase` tracks which sub-step is
	// running so the dialog can show "Saving locally…"
	// vs "Publishing to NOSTR…" vs "Pushing to Drive…"
	// instead of a single opaque spinner. The values
	// mirror the comments in handleCreateSave below.
	let savingPhase = $state(/** @type {'local' | 'children' | 'drive' | 'nostr' | 'done' | ''} */ (''));

	// Human-readable labels for each saving phase.
	// Kept here (not in handleCreateSave) so the
	// template can swap copy without polluting the
	// control flow.
	const savingLabels = {
		local: 'Saving competition to local storage…',
		children: 'Creating child tournaments for each round…',
		drive: 'Pushing competition to Google Drive…',
		nostr: 'Publishing to NOSTR relays (this can take 10–15 seconds)…',
		done: 'Done!'
	};
	/** @param {'local' | 'children' | 'drive' | 'nostr' | 'done' | ''} phase */
	function savingLabel(/** @type {string} */ phase) {
		return savingLabels[/** @type {keyof typeof savingLabels} */ (phase)] || 'Saving…';
	}

	// Called by <CompetitionForm> when the user clicks the
	// submit button (Create mode). The form component has
	// already validated and built the bracket — we just
	// persist it and trigger the Drive push. The form owns
	// its own state, so there's nothing to reset here.
	async function handleCreateSave({ competition, matches }) {
		saving = true;
		savingPhase = 'local';
		formError = '';
		try {
			savingPhase = 'local';
			const created = await createCompetitionWithMatches(competition, matches);
			// For league competitions, fan out per-round
			// child tournaments. The child has its own
			// date / time / location, takes the league
			// scoring, and links back via parentLeagueId.
			if (created.competition?.type === 'league') {
				savingPhase = 'children';
				try {
					await createChildTournamentsForLeague(created.competition);
				} catch (e) {
					console.warn('createChildTournamentsForLeague failed', e);
				}
			}
			// Push to Drive if signed in. If push fails
			// (offline, network error, signed out) we mark
			// the competition dirty so a future sync sweep
			// can retry.
			if (await isSignedIn()) {
				savingPhase = 'drive';
				try {
					await pushCompetition(created.competition, created.matches, []);
				} catch (e) {
					console.warn('Drive push on create failed', e);
					markDirty(`comp:${created.competition.id}`);
				}
			}
			// NOSTR publish — fire-and-forget, same pattern
			// as the Drive push. We need a NOSTR keypair
			// (derived only for signed-in accounts) and a
			// competition name. If publish fails the
			// competition is still saved locally; the
			// calendar just doesn't list it.
			savingPhase = 'nostr';
			await log('nostr', `handleCreateSave: starting NOSTR publish for ${created.competition.id} (type=${created.competition.type})`);
			try {
				const kp = getStoredKeypair();
				if (!kp?.secretKey) {
					await log('nostr', `handleCreateSave: getStoredKeypair returned no secretKey — user not signed in, skipping publish`);
				} else if (!created.competition.name) {
					await log('nostr', `handleCreateSave: competition has no name, skipping publish`);
				} else {
					await log('nostr', `handleCreateSave: publishing parent ${created.competition.id}`);
					// For leagues the parent record may not have
					// its own date/time (those live on each
					// round), so we fall back to the first round's
					// date so the calendar can still sort the
					// league meaningfully. Non-league events use
					// the Setup tab's date+time directly.
					const parentStarts = (() => {
						const roundDates = (created.competition.rounds || [])
							.map((/** @type {any} */ r) => r?.date)
							.filter((/** @type {any} */ d) => typeof d === 'string' && d.length > 0)
							.sort();
						const d = created.competition.date || roundDates[0] || '';
						const t = created.competition.time || '';
						if (!d) return '';
						return t ? `${d}T${t}` : d;
					})();

					await publishTournament({
						secretKey: kp.secretKey,
						tournament: {
							id: created.competition.id,
							name: created.competition.name,
							date: parentStarts,
							location: created.competition.location || '',
							format: created.competition.format || created.competition.type || '',
							// v0.4.26: ship the type so the
							// calendar can render a league / tournament
							// distinction. Parent of a league has
							// type='league'; standalone tournament
							// keeps 'tournament'.
							type: created.competition.type || '',
							// Ship the rich-text rules and a
							// round summary alongside the
							// parent so the calendar can
							// show a quick league preview
							// without forcing the reader
							// to open the bracket link.
							// For leagues, the per-round
							// schedule lives at
							// competition.rounds
							// (the form's `rounds` are
							// preserved on the league
							// record).
							rules: created.competition.rules || '',
							rounds: Array.isArray(created.competition.rounds)
								? created.competition.rounds.map((/** @type {any} */ r) => ({
									name: r.name || '',
									date: r.date || '',
									time: r.time || '',
									location: r.location || ''
								}))
								: []
						}
					});
					// For leagues, publish every round as its
					// own tournament event so the calendar
					// shows each round on its date. We
					// forward the round's user-edited name
					// (set in the Scheduling tab as
					// "League Season Round N") and combine
					// date+time into a single ISO stamp that
					// NOSTR calendars can sort by.
					if (created.competition.type === 'league' && Array.isArray(created.competition.rounds)) {
						let publishedRounds = 0;
						let skippedRounds = 0;
						for (const r of created.competition.rounds) {
							if (!r.date) { skippedRounds += 1; continue; } // only rounds with a date go on the calendar
							// Round name: prefer the user-edited
							// `r.name` (set in the Scheduling tab
							// as "League Season Round N"); fall
							// back to a generated string for
							// rounds that the admin didn't rename.
							const roundName = r.name || `${created.competition.name} Round ${r.roundNumber}`;
							// ISO stamp: combine date+time so the
							// calendar can sort and show the
							// actual start time, not just the day.
							const starts = r.time ? `${r.date}T${r.time}` : r.date;
							await publishTournament({
								secretKey: kp.secretKey,
								tournament: {
									id: r.id,
									name: roundName,
									date: starts,
									location: r.location || created.competition.location || '',
									format: created.competition.type,
									// v0.4.26: child round events are
									// always league rounds.
									type: 'league'
								}
							});
							publishedRounds += 1;
						}
						await log('nostr', `handleCreateSave: league rounds published=${publishedRounds} skipped(no date)=${skippedRounds}`);
					}
					await log('nostr', `handleCreateSave: NOSTR publish phase complete for ${created.competition.id}`);
				}
			} catch (e) {
				await log('nostr', `handleCreateSave: NOSTR publish threw — ${e?.message || e}`);
				console.warn('Nostr publish on create failed', e);
			}
			// After a successful save we close the wizard and
			// return to the main Svelte dashboard. refresh() is
			// still called so the list view behind us stays
			// current if the user navigates back.
			await refresh();
			await goto(`${base}/dashboard`);
		} catch (e) {
			formError = String(e?.message || e);
		} finally {
			saving = false;
			savingPhase = '';
		}
	}

	async function refresh() {
		loading = true;
		await seedCompetitionsIfEmpty();
		competitions = await listCompetitions();
		// Pull match count per competition so the row can
		// show "N matches" without making a second query
		// at render time.
		const counts = {};
		for (const c of competitions) {
			const ms = await listMatches(c.id);
			counts[c.id] = ms.length;
		}
		matchCounts = counts;
		loading = false;
	}

	onMount(refresh);

	async function remove(id, name) {
		if (!confirm(`Delete competition "${name}"?`)) return;
		await deleteCompetition(id);
		await refresh();
	}

	function back() {
		// The list view sits one level up; navigate home so
		// the user lands on the main menu (or wherever the
		// user came from).
		goto(`${base}/`);
	}

	function badgeColor(status) {
		if (status === 'active') return 'var(--accent)';
		if (status === 'upcoming') return 'var(--warn, #e8b923)';
		return 'var(--muted)';
	}

	function formatLabel(s) {
		return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}
</script>

<div class="screen scrollable">
	<div class="card">
		<div class="card-header">
			<h1>Competitions</h1>
			<button class="close-btn" onclick={back} aria-label="Close" title="Close">✕</button>
		</div>

		{#if loading}
			<p class="muted">Loading competitions…</p>
		{:else if competitions.length === 0}
			<p class="muted">No competitions yet.</p>
		{:else}
			<div class="list">
				{#each competitions as c (c.id)}
					<div class="competition-row">
						<div class="info">
							<strong>{c.name}</strong>
							<span class="meta">
								<span class="badge">{formatLabel(c.type)}</span>
								{#if c.format}
									<span class="badge">{formatLabel(c.format)}</span>
								{/if}
								<span class="badge">{c.players.length} players</span>
								<span class="badge">{matchCounts[c.id] ?? 0} matches</span>
								<span class="status" style:color={badgeColor(c.status)}>{c.status}</span>
							</span>
						</div>
						<div class="row-actions">
							<a
								class="icon-action"
								href="{base}/competitions/{c.id}"
								title="Open"
								aria-label="Open {c.name}"
							>
								<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
								</svg>
							</a>
							<a
								class="icon-action"
								href="{base}/competitions/{c.id}/edit"
								title="Edit"
								aria-label="Edit {c.name}"
							>
								<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M12 20h9" />
									<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
									</svg>
									</a>
									<button
									type="button"
									class="icon-action"
									title="Watch"
								aria-label="Watch {c.name}"
								onclick={() => alert('Watch (live multiplayer) requires a backend server for real-time updates. Not implemented in this single-player build.')}
							>
								<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							</button>
							<button
								type="button"
								class="icon-action danger"
								title="Delete"
								aria-label="Delete {c.name}"
								onclick={() => remove(c.id, c.name)}
							>
								<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
									<path d="M10 11v6" />
									<path d="M14 11v6" />
									<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if !formOpen}
			<button
				class="btn primary"
				onclick={async () => {
					// The first step of creating a competition
					// is signing in. Anonymous users get bounced
					// to the Google sign-in page; the redirect
					// comes back here when the auth flow resolves.
					// `isSignedIn` is async (reads Google Identity
					// services) — must `await` it; calling without
					// `await` always returns a Promise which is
					// truthy, so the guard would let anonymous
					// users through and open the form anyway.
					if (!(await isSignedIn())) {
						goto(`${base}/login?return=/competitions`);
						return;
					}
					formOpen = true;
				}}
			>Create competition</button>
		{/if}

		{#if formOpen}
			<!-- Saving overlay. The actual form submit fires
			     onSave → handleCreateSave which flips `saving`
			     true and walks `savingPhase` through local →
			     children → drive → nostr → done. We don't try
			     to render a percent-done bar; the NOSTR phase
			     publishes in parallel across 3 relays and the
			     drives are fire-and-forget, so percent-done
			     would be a lie. A live status string is the
			     honest answer. -->
			{#if saving}
				<div class="saving-overlay" role="alert" aria-live="polite" aria-busy="true">
					<div class="saving-dialog">
						<div class="saving-spinner" aria-hidden="true"></div>
						<p class="saving-title">Saving your competition</p>
						<p class="saving-phase">{savingLabel(savingPhase)}</p>
						<p class="saving-hint">Don't close this tab — the relay upload is in progress.</p>
					</div>
				</div>
			{/if}
			<CompetitionForm
				mode="create"
				{saving}
				onSave={handleCreateSave}
				onCancel={() => { formOpen = false; formError = ''; }}
			/>
		{/if}
		</div>
		</div>

<style>
	/* Saving overlay. A semi-transparent backdrop
	   blocks the rest of the page so the user can't
	   click Cancel / Previous while NOSTR is still
	   publishing. We use the existing CSS variables
	   for surface / text / accent so the dialog
	   adapts to the active theme. */
	.saving-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(2px);
	}
	.saving-dialog {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: var(--space-lg) var(--space-xl);
		max-width: 420px;
		width: calc(100vw - var(--space-xl) * 2);
		text-align: center;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
	}
	.saving-spinner {
		width: 36px;
		height: 36px;
		margin: 0 auto var(--space-md);
		border: 3px solid var(--line);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: saving-spin 0.9s linear infinite;
	}
	@keyframes saving-spin {
		to { transform: rotate(360deg); }
	}
	.saving-title {
		font-size: var(--text-lg, 1.1rem);
		font-weight: 600;
		margin: 0 0 var(--space-xs);
	}
	.saving-phase {
		font-size: var(--text-sm);
		color: var(--muted);
		margin: 0 0 var(--space-sm);
		min-height: 1.4em; /* prevents the dialog from jumping when phase changes */
	}
	.saving-hint {
		font-size: var(--text-xs, 0.8rem);
		color: var(--muted);
		margin: 0;
		opacity: 0.7;
	}
	/* Override the global .screen / .screen.scrollable defaults so
	   the form scrolls inside the page rather than getting clipped
	   by the game-layout container in app.css. */
	.screen {
		min-height: 0;
		container-type: inline-size;
		container-name: comp;
	}
	.screen.scrollable {
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
		padding-bottom: clamp(2rem, 8cqi, 4rem);
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.list {
		display: grid;
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}
	.competition-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm) var(--space-md);
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
		flex: 1 1 auto;
	}
	.info :global(h3), .info :global(.name) {
		overflow-wrap: anywhere;
		word-break: break-word;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		color: var(--muted);
		align-items: center;
	}
	.badge {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--text);
		padding: 2px 6px;
		border-radius: 6px;
		font-size: var(--text-xs);
	}
	.status {
		font-weight: 700;
		margin-left: 4px;
	}
	.row-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
	}
	.icon-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.4em;
		height: 2.4em;
		padding: 0;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--text);
		cursor: pointer;
		text-decoration: none;
		transition: background 120ms ease, border-color 120ms ease;
	}
	.icon-action:hover {
		background: var(--surface);
		border-color: var(--accent);
		color: var(--accent);
	}
	.icon-action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.icon-action.danger:hover {
		border-color: var(--danger, #ff6b6b);
		color: var(--danger, #ff6b6b);
	}
	.form {
		margin-top: var(--space-md);
		padding-top: var(--space-md);
		border-top: 1px solid var(--line);
	}
	.form h2 {
		margin: 0 0 var(--space-sm);
		font-size: var(--text-lg);
		color: var(--muted);
	}
	.form h3 {
		margin: var(--space-md) 0 var(--space-sm);
		font-size: var(--text-md);
		color: var(--muted);
	}
	.error {
		color: var(--danger, #ff6b6b);
		font-weight: 700;
		margin: 0 0 var(--space-sm);
	}
	.grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-md);
	}
	.grid-3 {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: var(--space-md);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin-bottom: var(--space-md);
	}
	.field span {
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.field input,
	.field select,
	.field textarea {
		background: var(--bg);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 10px;
		padding: var(--space-sm);
		font-size: var(--text-md);
		font: inherit;
	}
	.players {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin-bottom: var(--space-md);
	}
	.player-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.player-row input { flex: 1; }
	.player-num {
		font-weight: 700;
		color: var(--accent);
		min-width: 2em;
	}
	.add-btn {
		width: 100%;
	}

	/* Live preview matrix in the Create wizard. Read-only —
	   shows the round-robin pairs that the engine will
	   produce for the current groups / players state. The
	   .matrix / .matrix-wrap rules are the same as the
	   Edit page so the look matches. */
	.preview-group-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		margin: var(--space-sm) 0;
	}
	.preview-group-tab {
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 4px 12px;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	.preview-group-tab.active {
		background: var(--surface);
		border-color: var(--accent);
		color: var(--text);
	}
	.preview-group-tab:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.matrix-wrap {
		overflow-x: auto;
		margin: var(--space-sm) 0 var(--space-md);
	}
	table.matrix {
		border-collapse: separate;
		border-spacing: 0;
		font-size: var(--text-sm);
	}
	table.matrix th,
	table.matrix td {
		padding: 6px 10px;
		border: 1px solid var(--line);
		text-align: left;
		white-space: nowrap;
	}
	table.matrix thead th { background: var(--surface); }
	table.matrix .row-head,
	table.matrix .col-head {
		background: var(--surface);
		color: var(--muted);
		text-align: center;
	}
	table.matrix td.diag {
		background: var(--surface-2, #2a2f3e);
		color: var(--muted);
		text-align: center;
	}

	/* SVK picker — search input + dropdown of matches below
	   the player list. Same shape as the settings preview so
	   the user recognises it. */
	.svk-picker {
		margin-top: var(--space-sm);
		padding-top: var(--space-sm);
		border-top: 1px dashed var(--line);
	}
	.svk-picker-label {
		display: block;
		font-size: var(--text-sm);
		color: var(--muted);
		margin-bottom: 4px;
	}
	.svk-picker-input {
		width: 100%;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: var(--space-sm);
		color: var(--text);
		font: inherit;
	}
	.svk-picker-list {
		list-style: none;
		padding: 0;
		margin: var(--space-sm) 0 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.svk-picker-item {
		width: 100%;
		text-align: left;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text);
		font: inherit;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.svk-picker-item:hover,
	.svk-picker-item:focus-visible {
		border-color: var(--accent);
		outline: none;
	}
	.svk-picker-main { font-size: var(--text-md); }
	.svk-picker-sub { font-size: var(--text-xs); }
	.svk-picker-empty {
		margin: var(--space-sm) 0 0;
		color: var(--muted);
	}
	@container comp (max-width: 28rem) {
		.competition-row {
			flex-wrap: wrap;
		}
		.row-actions {
			flex: 1 1 100%;
			justify-content: flex-end;
		}
		.competition-form-card {
			padding: var(--space-sm);
		}
	}
	@container app (min-width: 60rem) {
		.svk-picker-input,
		.svk-picker-item {
			font-size: var(--text-md);
			padding: 12px 16px;
		}
	}
	.form-actions {
		display: flex;
		gap: var(--space-md);
		justify-content: flex-end;
	}
	.close-btn {
		background: #000;
		color: #fff;
		border: 1px solid var(--line);
		border-radius: 8px;
		width: 2.5rem;
		height: 2.5rem;
		font-size: 1.25rem;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.close-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.muted { color: var(--muted); }
	@media (max-width: 40rem) {
		.grid-2, .grid-3 { grid-template-columns: 1fr; }
		.form-actions { flex-direction: column; }
	}
</style>
