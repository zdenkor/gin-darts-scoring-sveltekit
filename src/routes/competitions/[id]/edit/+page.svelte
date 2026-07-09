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

	onMount(async () => {
		loading = true;
		try {
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

	async function save() {
		if (saving) return;
		error = '';
		const name = (editName || '').trim();
		if (!name) {
			error = 'Name is required.';
			return;
		}
		saving = true;
		try {
			const updated = await updateCompetition({
				...competition,
				name,
				season: Number(editSeason) || new Date().getFullYear(),
				notes: editNotes || '',
				status: editStatus,
				legsToWin: Math.max(1, Number(editLegsToWin) || 1),
				setsToWin: Math.max(1, Number(editSetsToWin) || 1),
			});
			competition = updated;
			// Push to Drive if signed in.
			if (await isSignedIn()) {
				try {
					await pushCompetition(updated, matches, []);
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

			<form class="form" onsubmit={(e) => { e.preventDefault(); save(); }}>
				<h2>Basics</h2>
				<label class="field">
					<span>Name</span>
					<input type="text" bind:value={editName} required />
				</label>
				<label class="field">
					<span>Season</span>
					<input type="number" min="2000" max="2100" bind:value={editSeason} />
				</label>
				<label class="field">
					<span>Status</span>
					<select bind:value={editStatus}>
						<option value="upcoming">Upcoming</option>
						<option value="active">Active</option>
						<option value="complete">Complete</option>
					</select>
				</label>

				<h2>Rules</h2>
				<div class="grid-2">
					<label class="field">
						<span>Legs to win</span>
						<input type="number" min="1" max="21" bind:value={editLegsToWin} />
					</label>
					<label class="field">
						<span>Sets to win</span>
						<input type="number" min="1" max="11" bind:value={editSetsToWin} />
					</label>
				</div>

				<h2>Notes</h2>
				<label class="field">
					<span>Notes (private, only stored locally)</span>
					<textarea bind:value={editNotes} rows="4" placeholder="Anything the players should know…"></textarea>
				</label>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="form-actions">
					<button class="btn primary" type="submit" disabled={saving}>
						{saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
					</button>
					<button class="btn ghost" type="button" onclick={cancel}>Cancel</button>
				</div>
			</form>

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
</style>
