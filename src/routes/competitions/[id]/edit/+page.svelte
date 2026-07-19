<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		getCompetition,
		updateCompetition,
		listMatches,
	} from '$lib/db/competitions.js';
	import { leagueStandings } from '$lib/competition/engine.js';
	import { isSignedIn } from '$lib/auth/google.js';
	import { pushCompetition, markDirty } from '$lib/auth/sync.js';
	import CompetitionForm from '$lib/ui/CompetitionForm.svelte';
	import RoundsEditor from '$lib/ui/RoundsEditor.svelte';

	let competition = $state(/** @type {any} */ (null));
	let matches = $state(/** @type {any[]} */ ([]));
	let standings = $state(/** @type {any[]} */ ([]));
	let loading = $state(true);
	let saving = $state(false);
	let saved = $state(false);
	let error = $state('');

	// Editable fields. We surface only the "surface" properties
	// the user can reasonably change without re-rolling the
	// bracket: name, season, notes, status, legsToWin, setsToWin.
	// Changing the format / player list / groups would invalidate
	// every existing match and needs a full re-roll, which is a
	// much larger change. The user can delete and re-create the
	// competition for that.
	let editName = $state('');
	let editSeason = $state(new Date().getFullYear());
	let editNotes = $state('');
	let editStatus = $state('upcoming');
	let editLegsToWin = $state(1);
	let editSetsToWin = $state(1);

	const compId = $derived(/** @type {string} */ ($page.params.id));

	// Group matrix state. The current buildLeague output is a
	// 2D array (groups x players). The matrix state below is
	// still useful for the handleEditSave flow: concurrency
	// and matchOrderSeed are placeholder fields the user
	// expects to round-trip through the form, and
	// matrixSlots is reseeded from the loaded record so the
	// initial preview has the right names.
	let matrixGroupIndex = $state(0);
	let matrixSlots = $state(/** @type {string[]} */ ([]));
	let concurrency = $state(1);
	let matchOrderSeed = $state(0);

	onMount(async () => {
		loading = true;
		try {
			// Sign-in gate. Edit is a write operation that
			// eventually pushes to Drive, so anonymous
			// users get bounced to the login page just
			// like Create does. The `return=/competitions/.../edit`
			// param brings them back here after sign-in.
			if (!(await isSignedIn())) {
				goto(`${base}/login?return=/competitions/${compId}/edit`);
				return;
			}
			competition = await getCompetition(compId);
			if (!competition) {
				error = `Competition ${compId} not found.`;
			} else {
				matches = await listMatches(compId);
				if (competition.type === 'league') {
					standings = leagueStandings(competition, matches);
				}
				// Seed the editable fields from the loaded record.
				editName = competition.name || '';
				editSeason = competition.season || new Date().getFullYear();
				editNotes = competition.notes || '';
				editStatus = competition.status || 'upcoming';
				editLegsToWin = competition.legsToWin || 1;
				editSetsToWin = competition.setsToWin || 1;
				// Seed matrix slots from groupAssignments[0] (we
				// show the first group; cycling comes later).
				const ga = competition.groupAssignments || [];
				const currentGroup = ga[matrixGroupIndex] || ga[0] || [];
				matrixSlots = currentGroup.slice();
				concurrency = competition.concurrency || 1;
			}
		} catch (e) {
			error = String(e?.message || e);
		} finally {
			loading = false;
		}
	});

	function back() {
		goto(`${base}/competitions/${compId}`);
	}

	function cancel() {
		goto(`${base}/competitions/${compId}`);
	}

	// Called by <CompetitionForm> when the user clicks Save
	// (Edit mode). The form has rebuilt the competition +
	// matches from scratch via the engine — we just need to
	// persist them. Concurrency / matchOrderSeed are
	// placeholders preserved from the existing record.
	async function handleEditSave({ competition: newComp, matches: newMatches }) {
		if (saving) return;
		saving = true;
		error = '';
		try {
			const updated = await updateCompetition({
				...newComp,
				concurrency: Math.max(1, Number(concurrency) || 1),
				matchOrderSeed
			});
			competition = updated;
			matches = newMatches;
			if (updated.type === 'league') {
				standings = leagueStandings(updated, newMatches);
			}
			if (await isSignedIn()) {
				try {
					await pushCompetition(updated, newMatches, []);
				} catch (e) {
					console.warn('Drive push on edit failed', e);
					markDirty(`comp:${updated.id}`);
				}
			}
			saved = true;
			setTimeout(() => (saved = false), 1500);
		} catch (e) {
			error = String(e?.message || e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="screen scrollable">
	<div class="card">
		<div class="card-header">
			<h1>Edit competition</h1>
			<button class="btn ghost" type="button" onclick={back}>Back</button>
		</div>

		{#if loading}
			<p class="muted">Loading competition…</p>
		{:else if error && !competition}
			<p class="error">{error}</p>
		{:else if competition}
			<p class="muted small">
				ID: <code>{competition.id}</code> · {matches.length} match{matches.length === 1 ? '' : 'es'}
				{#if competition.type === 'league' && standings.length}
					· {standings.length} player{standings.length === 1 ? '' : 's'} in league table
				{/if}
			</p>

			<CompetitionForm
				mode="edit"
				existing={competition}
				{saving}
				onSave={handleEditSave}
				onCancel={back}
				lockType={Boolean(competition.parentLeagueId)}
				hiddenTabs={competition.parentLeagueId ? ['scoring'] : []}
			/>

			<RoundsEditor bind:competition={competition} />

			<section class="locked">
				<h3>What you can't edit here</h3>
				<p class="hint">
					Format, player list, groups and seeding are locked once a competition is created — changing them would invalidate every match in the bracket. If you need to change those, delete this competition and create a new one.
				</p>
			</section>
		{/if}
	</div>
</div>

<style>
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.muted { color: var(--muted); }
	.small { font-size: var(--text-sm); }
	.error { color: var(--danger, #ff6b6b); font-weight: 700; }
	.form { margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--line); }
	.form h2 {
		margin: var(--space-md) 0 var(--space-sm);
		font-size: var(--text-md);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.form h2:first-of-type { margin-top: 0; }
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
	.grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-md);
	}
	.form-actions {
		display: flex;
		gap: var(--space-md);
		justify-content: flex-end;
		margin-top: var(--space-md);
	}
	.player-roster {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.player-roster li {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		align-items: center;
		gap: var(--space-sm);
		padding: 6px 10px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 8px;
	}
	.player-roster-name {
		font-weight: 600;
	}
	.player-roster-input {
		background: var(--bg);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 8px;
		padding: 4px 8px;
		font: inherit;
	}
	.locked {
		margin-top: var(--space-lg);
		padding: var(--space-md);
		background: var(--surface);
		border: 1px dashed var(--line);
		border-radius: 10px;
	}
	.locked h3 {
		margin: 0 0 var(--space-sm);
		font-size: var(--text-md);
		color: var(--muted);
	}
	.hint { margin: 0; color: var(--muted); }
	@media (max-width: 40rem) {
		.grid-2 { grid-template-columns: 1fr; }
		.form-actions { flex-direction: column; }
	}

	/* Round-robin matrix — rows are the player slots (with
	   dropdowns), the grid below is the pair matrix. Diagonal
	   cells are highlighted (a player can't play themselves). */
	.matrix-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin: var(--space-sm) 0 var(--space-md);
	}
	.matrix-slots {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.matrix-slots li {
		display: grid;
		grid-template-columns: 2.4rem 1fr auto;
		align-items: center;
		gap: var(--space-sm);
	}
	.matrix-slots .row-num {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.matrix-slots select {
		background: var(--bg);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 8px;
		padding: 6px 10px;
		font: inherit;
	}
	.matrix-wrap {
		overflow-x: auto;
		margin: var(--space-md) 0;
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
	table.matrix td.ready {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	/* Standings table — same shape as the matrix header so the
	   user can scan the names and the matrix at a glance. */
	table.standings {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		margin: var(--space-sm) 0;
	}
	table.standings th,
	table.standings td {
		padding: 6px 10px;
		border-bottom: 1px solid var(--line);
		text-align: left;
	}
	table.standings thead th { color: var(--muted); font-weight: 600; }
	table.standings td:last-child { text-align: right; }

	.btn.small { padding: 4px 8px; font-size: var(--text-sm); }
</style>
