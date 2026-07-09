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

	// Group matrix state. The current buildLeague output is a
	// 2D array (groups x players). The matrix below lets the
	// user see the round-robin pairs visually and (later) edit
	// the assignment via dropdowns. W-L-Legs-Rank is computed
	// live from the engine.
	let matrixGroupIndex = $state(0);
	let matrixSlots = $state(/** @type {string[]} */ ([]));
	let concurrency = $state(1);
	let matchOrderSeed = $state(0);

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

	// Available player names for the dropdown: union of all
	// groups plus the matrix's own slots so the user can shuffle.
	let allPlayerNames = $derived.by(() => {
		const ga = competition?.groupAssignments || [];
		const set = new Set();
		for (const g of ga) for (const p of g) if (p) set.add(p);
		// Also include any names the user typed into the matrix
		// that aren't in the source list (e.g. added a name but
		// haven't saved the competition yet).
		for (const s of matrixSlots) if (s && !set.has(s)) set.add(s);
		return Array.from(set);
	});

	function matrixSlot(i) {
		return matrixSlots[i] || '';
	}

	function setMatrixSlot(i, name) {
		const next = matrixSlots.slice();
		while (next.length <= i) next.push('');
		next[i] = name;
		matrixSlots = next;
		matchOrderSeed++;
	}

	function addMatrixSlot() {
		matrixSlots = [...matrixSlots, ''];
	}

	function removeMatrixSlot(i) {
		if (matrixSlots.length <= 2) return;
		matrixSlots = matrixSlots.filter((_, idx) => idx !== i);
	}

	function matrixAutomatic() {
		// Fill empty slots with a deterministic default name so
		// the user can see the matrix fully populated. Existing
		// filled slots are kept.
		const n = matrixSlots.length;
		matrixSlots = matrixSlots.map((s, i) => s || `Player ${i + 1}`);
		matchOrderSeed++;
	}

	function matrixRandom() {
		// Shuffle the slot names in place. The set of names is
		// unchanged — only the order moves.
		const arr = matrixSlots.slice();
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		matrixSlots = arr;
		matchOrderSeed++;
	}

	function matrixClear() {
		matrixSlots = matrixSlots.map(() => '');
		matchOrderSeed++;
	}

	// Build the matrix grid for display: array of rows, each row
	// is an array of cells. cellText(i, j) is the cell label.
	function cellText(i, j) {
		if (i === j) return '—';
		return `${matrixSlot(i) || '?'} vs ${matrixSlot(j) || '?'}`;
	}

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
			// Persist matrix group slot (we only edit group 0
			// for now; other groups stay as engine seeded
			// them). Concurrency is a placeholder for a future
			// "N matches at a time" feature.
			const newGroups = (competition.groupAssignments || []).map((g, gi) =>
				gi === matrixGroupIndex ? matrixSlots.filter(Boolean) : g
			);
			const updated = await updateCompetition({
				...competition,
				name,
				season: Number(editSeason) || new Date().getFullYear(),
				notes: editNotes || '',
				status: editStatus,
				legsToWin: Math.max(1, Number(editLegsToWin) || 1),
				setsToWin: Math.max(1, Number(editSetsToWin) || 1),
				groupAssignments: newGroups,
				concurrency: Math.max(1, Number(concurrency) || 1),
				matchOrderSeed,
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

				<h2>Group {matrixGroupIndex + 1} — round-robin matrix</h2>
				<p class="hint">
					Edit the player slots for this group, then save to rebuild the
					matches. Each cell is a pair; the diagonal (i = j) is locked.
				</p>

				<div class="matrix-toolbar">
					<button class="btn ghost" type="button" onclick={matrixAutomatic}>
						Automatic assignment
					</button>
					<button class="btn ghost" type="button" onclick={matrixRandom}>
						Random
					</button>
					<button class="btn ghost danger" type="button" onclick={matrixClear}>
						Clear
					</button>
				</div>

				<ol class="matrix-slots">
					{#each matrixSlots as _slot, i (i)}
						<li>
							<span class="row-num">{i + 1}</span>
							<select
								value={matrixSlot(i)}
								onchange={(e) => setMatrixSlot(i, /** @type {HTMLSelectElement} */ (e.currentTarget).value)}
							>
								<option value="">— empty —</option>
								{#each allPlayerNames as name (name)}
									<option value={name}>{name}</option>
								{/each}
							</select>
							{#if matrixSlots.length > 2}
								<button class="btn ghost small" type="button" onclick={() => removeMatrixSlot(i)} aria-label="Remove slot {i + 1}">
									×
								</button>
							{/if}
						</li>
					{/each}
				</ol>
				<button class="btn ghost" type="button" onclick={addMatrixSlot}>+ Add slot</button>

				{#if matrixSlots.length >= 2}
					<div class="matrix-wrap">
						<table class="matrix">
							<thead>
								<tr>
									<th></th>
									{#each matrixSlots as _s, j (j)}
										<th class="col-head">P{j + 1}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each matrixSlots as _row, i (i)}
									<tr>
										<th class="row-head">P{i + 1}</th>
										{#each matrixSlots as _col, j (j)}
											<td class:diag={i === j} class:ready={i !== j && matrixSlot(i) && matrixSlot(j)}>
												{cellText(i, j)}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				<h2>Standings (live)</h2>
				{#if standings.length === 0}
					<p class="muted small">No league matches played yet — the table will fill in as you record results.</p>
				{:else}
					<table class="standings">
						<thead>
							<tr>
								<th>#</th>
								<th>Name</th>
								<th>W-L</th>
								<th>Legs ±</th>
								<th>Pts</th>
							</tr>
						</thead>
						<tbody>
							{#each standings as s, i (s.id)}
								<tr>
									<td>{i + 1}</td>
									<td>{s.id}</td>
									<td>{s.wins}-{s.losses}</td>
									<td>{s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}{s.pointsFor - s.pointsAgainst}</td>
									<td><strong>{s.score}</strong></td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}

				<h2>Concurrency</h2>
				<label class="field">
					<span>Number of matches at any one time (placeholder)</span>
					<input type="number" min="1" max="16" bind:value={concurrency} />
				</label>

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
