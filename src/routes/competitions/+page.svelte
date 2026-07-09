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
	import { searchSVKCache } from '$lib/auth/svk.js';
	import CompetitionWizard from '$lib/ui/CompetitionWizard.svelte';
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
	let formType = $state('league');
	let formParticipantFormat = $state('singles');
	let formEliminationFormat = $state('round robin');
	let formSeeding = $state('ordered');
	let formGroups = $state(1);
	let formAdvancePerGroup = $state(1);
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
	// Wizard plumbing. activeTab is 0..5; matches is empty in
	// create mode (the bracket gets generated on submit, then
	// the matches list is loaded by the list view).
	let formTab = $state(0);
	let formMatches = $state(/** @type {any[]} */ ([]));
	// SVK search state. The picker shows a search input that hits
	// the local svk_players IDB cache; clicking a result appends
	// a new player row to formPlayers. 250ms debounce keeps the
	// UI snappy while typing.
	let svkPickerQuery = $state('');
	let svkPickerResults = $state(/** @type {any[]} */ ([]));
	let svkPickerTimer = null;

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

	function onSVKPickerInput() {
		if (svkPickerTimer) clearTimeout(svkPickerTimer);
		const q = svkPickerQuery.trim();
		if (!q) {
			svkPickerResults = [];
			return;
		}
		svkPickerTimer = setTimeout(async () => {
			// Mirror the vanilla picker: search every field, not
			// just surname. The user can type "Brat", "Novák",
			// "Topoľčianky" (club) or "12345" (svkId) and the
			// matching rows show up.
			const all = await (await import('$lib/db/idb.js')).getAll('svk_players');
			const qL = q.toLowerCase();
			let matches = all.filter(p =>
				(p.surname || '').toLowerCase().includes(qL) ||
				(p.firstName || '').toLowerCase().includes(qL) ||
				(p.name || '').toLowerCase().includes(qL) ||
				(p.town || '').toLowerCase().includes(qL) ||
				(p.club || '').toLowerCase().includes(qL) ||
				(p.svkId || '').toLowerCase().includes(qL)
			);
			matches.sort((a, b) =>
				(a.surname || '').localeCompare(b.surname || '') ||
				(a.firstName || '').localeCompare(b.firstName || '')
			);
			// Hide rows the user has already added so the picker
			// doesn't keep offering the same person twice.
			const taken = new Set(formPlayers.map(p => p.name.toLowerCase()));
			svkPickerResults = matches.filter(r => {
				const fullName = `${r.surname} ${r.firstName}`.trim().toLowerCase();
				return fullName && !taken.has(fullName);
			});
		}, 200);
	}

	function addSVKPlayer(r) {
		if (formPlayers.length >= 16) return;
		const name = `${r.surname} ${r.firstName}`.trim();
		formPlayers = [...formPlayers, { id: Date.now() + Math.random(), name }];
		// Clear the query + results so the picker collapses and
		// the user sees the new row in the list.
		svkPickerQuery = '';
		svkPickerResults = [];
	}

	function updatePlayerName(/** @type {number} */ idx, /** @type {string} */ value) {
		formPlayers = formPlayers.map((p, i) => (i === idx ? { ...p, name: value } : p));
	}

	function resetForm() {
		formName = '';
		formType = 'league';
		formParticipantFormat = 'singles';
		formEliminationFormat = 'round robin';
		formSeeding = 'ordered';
		formGroups = 1;
		formAdvancePerGroup = 1;
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
		const created = await createCompetitionWithMatches(result.competition, result.matches);
		// Push to Drive if signed in. If push fails (offline,
		// network error, signed out) we mark the competition
		// dirty so a future sync sweep can retry.
		if (await isSignedIn()) {
			try {
				await pushCompetition(created.competition, created.matches, []);
			} catch (e) {
				console.warn('Drive push on create failed', e);
				markDirty(`comp:${created.competition.id}`);
			}
		}
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
			<form class="form" onsubmit={(e) => { e.preventDefault(); submitForm(); }}>
				<CompetitionWizard mode="create" bind:competition={formType} bind:matches={formMatches} bind:activeTab={formTab}>
					<svelte:fragment slot="setup">
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

						<label class="field">
							<span>Notes (optional)</span>
							<textarea rows="2" bind:value={formNotes} placeholder="Anything to remember about this competition"></textarea>
						</label>
					</svelte:fragment>

					<svelte:fragment slot="registration">
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

							<div class="svk-picker">
								<label class="svk-picker-label" for="svk-picker-input">
									🔍 Search SVK cache
								</label>
								<input
									id="svk-picker-input"
									type="text"
									class="svk-picker-input"
									bind:value={svkPickerQuery}
									oninput={onSVKPickerInput}
									placeholder="Type a name, e.g. 'Novák' or 'Ján Nov'"
									autocomplete="off"
								/>
								{#if svkPickerResults.length > 0}
									<ul class="svk-picker-list">
										{#each svkPickerResults as r (r.svkId || `${r.surname}-${r.firstName}`)}
											<li>
												<button
													type="button"
													class="svk-picker-item"
													onclick={() => addSVKPlayer(r)}
													aria-label="Add {r.surname} {r.firstName} to competition"
												>
													<span class="svk-picker-main">
														<strong>{r.surname} {r.firstName}</strong>
														{#if r.svkId}<span class="muted svk-id"> · #{r.svkId}</span>{/if}
													</span>
													{#if r.town || r.club}
														<span class="muted svk-picker-sub">
															{#if r.town}{r.town}{/if}
															{#if r.town && r.club} · {/if}
															{#if r.club}{r.club}{/if}
														</span>
													{/if}
												</button>
											</li>
										{/each}
									</ul>
								{:else if svkPickerQuery.trim()}
									<p class="hint svk-picker-empty">No SVK matches. Add the player manually above.</p>
								{/if}
							</div>
						</div>
					</svelte:fragment>

					<svelte:fragment slot="seeding">
						{#if formEliminationFormat === 'round robin' || formEliminationFormat === 'round robin knockout' || formEliminationFormat === 'double round robin'}
							<h3>Group seeding</h3>
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
							<p class="hint">
								With <strong>advance = 1</strong> the engine generates a pure round-robin (no knockouts).
								With higher values a knockout stage is added after the group stage.
							</p>
						{:else}
							<h3>Tournament seeding</h3>
							<label class="field">
								<span>Seeding</span>
								<select bind:value={formSeeding}>
									{#each SEEDINGS as opt}<option value={opt.value}>{opt.label}</option>{/each}
								</select>
							</label>
						{/if}

						<div class="form-actions">
							<button class="btn primary" type="submit">Generate bracket</button>
							<button class="btn ghost" type="button" onclick={() => { formOpen = false; formError = ''; }}>Cancel</button>
						</div>
					</svelte:fragment>
				</CompetitionWizard>
			</form>
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
