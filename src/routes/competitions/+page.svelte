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
	import {
		buildSingleMatch,
		buildTournament,
		buildLeague,
		buildTeamGame
	} from '$lib/competition/engine.js';
	import { X01_IN_OPTIONS, X01_OUT_OPTIONS } from '$lib/game/engine.js';

	const START_OPTIONS = [301, 401, 501, 701, 1001];
	const PARTICIPANT_FORMATS = [
		{ value: 'singles', label: 'Singles' },
		{ value: 'doubles', label: 'Doubles' },
		{ value: 'team', label: 'Team game' }
	];
	const ELIMINATION_FORMATS = [
		{ value: 'single elimination', label: 'Single elimination' },
		{ value: 'double elimination', label: 'Double elimination' },
		{ value: 'round robin', label: 'Round robin' },
		{ value: 'round robin knockout', label: 'Round robin + knockout' },
		{ value: 'double round robin', label: 'Double round robin' },
		{ value: 'single game', label: 'Single game' }
	];
	const SEEDINGS = [
		{ value: 'ordered', label: 'Ordered (as added)' },
		{ value: 'random', label: 'Random' },
		{ value: 'balanced', label: 'Balanced' }
	];
	const COMP_TYPES = [
		{ value: 'league', label: 'League' },
		{ value: 'tournament', label: 'Tournament' },
		{ value: 'knockout', label: 'Knockout' },
		{ value: 'single', label: 'Single game' },
		{ value: 'team', label: 'Team' }
	];

	let competitions = $state(/** @type {any[]} */ ([]));
	let matchCounts = $state(/** @type {Record<string, number>} */ ({}));
	let loading = $state(true);
	let formOpen = $state(false);

	// Form state. Defaults are picked so the form is immediately
	// useful for the most common case (x01, single elim, doubles).
	let formName = $state('');
	let formType = $state('tournament');
	let formParticipantFormat = $state('singles');
	let formEliminationFormat = $state('single elimination');
	let formSeeding = $state('ordered');
	let formGroups = $state(1);
	let formAdvancePerGroup = $state(2);
	let formDoubleRoundRobin = $state(false);
	let formGameMode = $state('x01');
	let formStart = $state(501);
	let formInRule = $state('single');
	let formOutRule = $state('double');
	let formLegsToWin = $state(1);
	let formSetsToWin = $state(1);
	let formSeason = $state(new Date().getFullYear());
	let formNotes = $state('');
	let formPlayers = $state([{ id: 0, name: 'Gin' }, { id: 1, name: 'Alex' }]);
	let formError = $state('');

	async function refresh() {
		loading = true;
		await seedCompetitionsIfEmpty();
		competitions = await listCompetitions();
		// Pull match count per competition so the row can show "N
		// matches" without making a second query at render time.
		const counts = {};
		for (const c of competitions) {
			const ms = await listMatches(c.id);
			counts[c.id] = ms.length;
		}
		matchCounts = counts;
		loading = false;
	}

	onMount(refresh);

	function back() {
		goto(`${base}/`);
	}

	function addPlayer() {
		if (formPlayers.length >= 16) return;
		formPlayers = [...formPlayers, { id: Date.now(), name: `Player ${formPlayers.length + 1}` }];
	}

	function removePlayer(/** @type {number} */ idx) {
		if (formPlayers.length <= 2) return;
		formPlayers = formPlayers.filter((_, i) => i !== idx);
	}

	function updatePlayerName(/** @type {number} */ idx, /** @type {string} */ value) {
		formPlayers = formPlayers.map((p, i) => (i === idx ? { ...p, name: value } : p));
	}

	function resetForm() {
		formName = '';
		formType = 'tournament';
		formParticipantFormat = 'singles';
		formEliminationFormat = 'single elimination';
		formSeeding = 'ordered';
		formGroups = 1;
		formAdvancePerGroup = 2;
		formDoubleRoundRobin = false;
		formGameMode = 'x01';
		formStart = 501;
		formInRule = 'single';
		formOutRule = 'double';
		formLegsToWin = 1;
		formSetsToWin = 1;
		formSeason = new Date().getFullYear();
		formNotes = '';
		formPlayers = [{ id: 0, name: 'Gin' }, { id: 1, name: 'Alex' }];
		formError = '';
	}

	function buildBracket() {
		// Convert the form state into a competition + matches
		// pair using one of the engine.js builders. The engine
		// returns numeric ids (closure _idSeq) so we rewrite
		// competition.id and every match.competitionId + match.id
		// to stable string ids before persisting.
		const playerNames = formPlayers.map(p => p.name.trim()).filter(Boolean);
		if (playerNames.length < 2) {
			formError = 'At least two players are required.';
			return null;
		}
		const meta = {
			name: formName.trim() || 'Untitled competition',
			ownerId: null,
			players: playerNames,
			gameMode: formGameMode,
			gameOpts: {
				start: formStart,
				in: formInRule,
				out: formOutRule,
				legsToWin: formLegsToWin,
				setsToWin: formSetsToWin
			},
			legsToWin: formLegsToWin,
			season: formSeason,
			notes: formNotes,
			type: formType,
			format: formEliminationFormat,
			participantFormat: formParticipantFormat,
			eliminationFormat: formEliminationFormat,
			seeding: formSeeding
		};

		let result;
		if (formEliminationFormat === 'single game') {
			result = buildSingleMatch(meta);
		} else if (formType === 'team' || formParticipantFormat === 'team') {
			result = buildTeamGame(meta);
		} else if (
			formEliminationFormat === 'single elimination' ||
			formEliminationFormat === 'double elimination'
		) {
			result = buildTournament({ ...meta, format: formEliminationFormat });
		} else {
			// round robin / round robin knockout / double round robin
			result = buildLeague({
				...meta,
				groups: formGroups,
				advancePerGroup: formAdvancePerGroup,
				doubleRoundRobin: formEliminationFormat === 'double round robin'
			});
		}
		// Generate stable string ids — see db/competitions.js.
		const newId = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		result.competition.id = newId;
		result.matches = (result.matches || []).map((m, i) => ({
			...m,
			competitionId: newId,
			id: `m-${newId}-${i}`
		}));
		return result;
	}

	async function submitForm() {
		formError = '';
		const result = buildBracket();
		if (!result) return;
		await createCompetitionWithMatches(result.competition, result.matches);
		formOpen = false;
		resetForm();
		await refresh();
	}

	async function remove(id, name) {
		if (!confirm(`Delete competition "${name}"?`)) return;
		await deleteCompetition(id);
		await refresh();
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

<div class="screen">
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
							<a class="btn ghost" href="{base}/competitions/{c.id}">Open</a>
							<button class="btn ghost danger" onclick={() => remove(c.id, c.name)}>Delete</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<button class="btn primary" onclick={() => (formOpen = true)}>Create competition</button>

		{#if formOpen}
			<form class="form" onsubmit={(e) => { e.preventDefault(); submitForm(); }}>
				<h2>New competition</h2>
				{#if formError}
					<p class="error">{formError}</p>
				{/if}

				<div class="grid-2">
					<label class="field">
						<span>Name</span>
						<input type="text" bind:value={formName} placeholder="League or tournament name" required />
					</label>
					<label class="field">
						<span>Season</span>
						<input type="text" bind:value={formSeason} placeholder="2026" />
					</label>
				</div>

				<div class="grid-3">
					<label class="field">
						<span>Type</span>
						<select bind:value={formType}>
							{#each COMP_TYPES as opt}<option value={opt.value}>{opt.label}</option>{/each}
						</select>
					</label>
					<label class="field">
						<span>Participants</span>
						<select bind:value={formParticipantFormat}>
							{#each PARTICIPANT_FORMATS as opt}<option value={opt.value}>{opt.label}</option>{/each}
						</select>
					</label>
					<label class="field">
						<span>Format</span>
						<select bind:value={formEliminationFormat}>
							{#each ELIMINATION_FORMATS as opt}<option value={opt.value}>{opt.label}</option>{/each}
						</select>
					</label>
				</div>

				{#if formEliminationFormat === 'round robin' || formEliminationFormat === 'round robin knockout' || formEliminationFormat === 'double round robin'}
					<div class="grid-2">
						<label class="field">
							<span>Groups</span>
							<input type="number" min="1" max="8" bind:value={formGroups} />
						</label>
						<label class="field">
							<span>Advance per group</span>
							<input type="number" min="1" max="4" bind:value={formAdvancePerGroup} />
						</label>
					</div>
				{:else}
					<label class="field">
						<span>Seeding</span>
						<select bind:value={formSeeding}>
							{#each SEEDINGS as opt}<option value={opt.value}>{opt.label}</option>{/each}
						</select>
					</label>
				{/if}

				<h3>Game rules</h3>
				<div class="grid-3">
					<label class="field">
						<span>Game mode</span>
						<select bind:value={formGameMode}>
							<option value="x01">x01</option>
						</select>
					</label>
					<label class="field">
						<span>Start score</span>
						<select bind:value={formStart}>
							{#each START_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
						</select>
					</label>
					<label class="field">
						<span>Out rule</span>
						<select bind:value={formOutRule}>
							{#each Object.entries(X01_OUT_OPTIONS) as [key, opt]}<option value={key}>{opt.label}</option>{/each}
						</select>
					</label>
				</div>
				<div class="grid-2">
					<label class="field">
						<span>Legs to win</span>
						<input type="number" min="1" max="99" bind:value={formLegsToWin} />
					</label>
					<label class="field">
						<span>Sets to win</span>
						<input type="number" min="1" max="99" bind:value={formSetsToWin} />
					</label>
				</div>

				<h3>Players</h3>
				<div class="players">
					{#each formPlayers as p, i (p.id)}
						<div class="player-row">
							<span class="player-num">P{i + 1}</span>
							<input
								type="text"
								value={p.name}
								oninput={(e) => updatePlayerName(i, e.currentTarget.value)}
								placeholder={`Player ${i + 1}`}
							/>
							{#if formPlayers.length > 2}
								<button class="btn ghost" type="button" onclick={() => removePlayer(i)} aria-label="Remove player">✕</button>
							{/if}
						</div>
					{/each}
					{#if formPlayers.length < 16}
						<button class="btn ghost add-btn" type="button" onclick={addPlayer}>+ Add player</button>
					{/if}
				</div>

				<label class="field">
					<span>Notes (optional)</span>
					<textarea rows="2" bind:value={formNotes} placeholder="Anything to remember about this competition"></textarea>
				</label>

				<div class="form-actions">
					<button class="btn primary" type="submit">Create</button>
					<button class="btn ghost" type="button" onclick={() => { formOpen = false; formError = ''; }}>Cancel</button>
				</div>
			</form>
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
