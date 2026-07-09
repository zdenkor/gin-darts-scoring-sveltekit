<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		listCompetitions,
		createCompetitionWithMatches,
		deleteCompetition,
		seedCompetitionsIfEmpty,
		listMatches
	} from '$lib/db/competitions.js';
	import { isSignedIn } from '$lib/auth/google.js';
	import { pushCompetition, markDirty } from '$lib/auth/sync.js';
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

	// Called by <CompetitionForm> when the user clicks the
	// submit button (Create mode). The form component has
	// already validated and built the bracket — we just
	// persist it and trigger the Drive push. The form owns
	// its own state, so there's nothing to reset here.
	async function handleCreateSave({ competition, matches }) {
		saving = true;
		formError = '';
		try {
			const created = await createCompetitionWithMatches(competition, matches);
			// Push to Drive if signed in. If push fails
			// (offline, network error, signed out) we mark
			// the competition dirty so a future sync sweep
			// can retry.
			if (await isSignedIn()) {
				try {
					await pushCompetition(created.competition, created.matches, []);
				} catch (e) {
					console.warn('Drive push on create failed', e);
					markDirty(`comp:${created.competition.id}`);
				}
			}
			formOpen = false;
			await refresh();
		} catch (e) {
			formError = String(e?.message || e);
		} finally {
			saving = false;
		}
	}

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
			<button class="btn ghost" onclick={back}>Back</button>
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

		<button class="btn primary" onclick={() => (formOpen = true)}>Create competition</button>

		{#if formOpen}
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
	/* Override the global .screen / .screen.scrollable defaults so
	   the form scrolls inside the page rather than getting clipped
	   by the game-layout container in app.css. */
	.screen {
		min-height: 0;
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
	.muted { color: var(--muted); }
	@media (max-width: 40rem) {
		.grid-2, .grid-3 { grid-template-columns: 1fr; }
		.form-actions { flex-direction: column; }
	}
</style>
