<script>
	/**
	 * Reusable competition form. Used by:
	 *   - /competitions (Create mode) — opens when the user
	 *     clicks 'Create competition', starts with defaults.
	 *   - /competitions/[id]/edit (Edit mode) — pre-fills the
	 *     state from the existing record via the existing
	 *     prop.
	 *
	 * Both modes render the same three tabs from
	 * CompetitionWizard: Competition Setup, Registration,
	 * Seeding & Draw. The same engine builder
	 * (buildSingleMatch / buildTournament / buildLeague) is
	 * used in both modes, so the resulting competition +
	 * matches structure is identical.
	 *
	 * The parent owns the actual persistence. This component
	 * calls onSave(competition, matches) when the user clicks
	 * 'Save' (edit) or 'Generate bracket' (create). The
	 * parent decides whether to call createCompetitionWithMatches
	 * (create) or updateCompetition + rewrite matches (edit).
	 */
	import { X01_IN_OPTIONS, X01_OUT_OPTIONS } from '$lib/game/engine.js';
	import {
		buildSingleMatch,
		buildTournament,
		buildLeague,
		buildTeamGame
	} from '$lib/competition/engine.js';
	import { searchSVKCache } from '$lib/auth/svk.js';
	import CompetitionWizard from '$lib/ui/CompetitionWizard.svelte';

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
		{ value: 'round robin knockout', label: 'Round robin + KO' },
		{ value: 'double round robin', label: 'Double round robin' },
		{ value: 'single game', label: 'Single game' }
	];
	const SEEDINGS = [
		{ value: 'ordered', label: 'Ordered' },
		{ value: 'random', label: 'Random' }
	];
	const COMP_TYPES = [
		{ value: 'league', label: 'League' },
		{ value: 'tournament', label: 'Tournament' },
		{ value: 'team', label: 'Team' }
	];

	/**
	 * @type {{
	 *   mode?: 'create' | 'edit',
	 *   existing?: any | null,
	 *   saving?: boolean,
	 *   onSave?: (payload: { competition: any, matches: any[] }) => void | Promise<void>,
	 *   onCancel?: () => void,
	 *   submitLabel?: string
	 * }}
	 */
	let {
		mode = 'create',
		existing = null,
		saving = false,
		onSave = () => {},
		onCancel = () => {},
		submitLabel = ''
	} = $props();

	// Form state. Defaults match the create-mode defaults
	// from 0.3.4. In edit mode the onMount block below
	// overwrites them from `existing`.
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
	let formStatus = $state('upcoming');
	let formNotes = $state('');
	/** @type {{id: number, name: string}[]} */
	let formPlayers = $state([{ id: 0, name: 'Gin' }, { id: 1, name: 'Alex' }]);
	let formError = $state('');
	let formTab = $state(0);
	let formMatches = $state(/** @type {any[]} */ ([]));
	let previewGroupTab = $state(0);
	let initialised = $state(false);

	// Seed from `existing` once, on mount, when in edit mode.
	$effect(() => {
		if (initialised) return;
		if (mode === 'edit' && existing) {
			formName = existing.name || '';
			formSeason = existing.season ?? new Date().getFullYear();
			formStatus = existing.status || 'upcoming';
			formType = existing.type || 'league';
			formParticipantFormat = existing.participantFormat || 'singles';
			formEliminationFormat = existing.eliminationFormat || existing.format || 'round robin';
			formSeeding = existing.seeding || 'ordered';
			formGroups = existing.groups ?? 1;
			formAdvancePerGroup = existing.advancePerGroup ?? 1;
			formGameMode = existing.gameMode || 'x01';
			const go = existing.gameOpts || {};
			formStart = go.start ?? 501;
			formInRule = go.in || 'single';
			formOutRule = go.out || 'double';
			formLegsToWin = existing.legsToWin ?? 1;
			formSetsToWin = existing.setsToWin ?? 1;
			formNotes = existing.notes || '';
			formPlayers = (existing.players || []).map((name, i) => ({ id: i, name }));
			// Keep the same id, don't generate a new one.
		}
		initialised = true;
	});

	// Round-robin distribution for the live preview, mirroring
	// the engine's distribution (player i → bucket i % groups).
	let previewGroupAssignments = $derived.by(() => {
		const g = Math.max(1, Number(formGroups) || 1);
		const names = formPlayers.map(p => p.name.trim()).filter(Boolean);
		const buckets = Array.from({ length: g }, () => []);
		names.forEach((p, i) => buckets[i % g].push(p));
		return buckets;
	});
	let previewAdvanceCount = $derived(
		Math.max(1, Number(formAdvancePerGroup) || 1) * Math.max(1, Number(formGroups) || 1)
	);
	let previewKOSize = $derived.by(() => {
		let p = 1;
		while (p < previewAdvanceCount) p *= 2;
		return p;
	});
	let previewTotalGroupPairs = $derived(
		previewGroupAssignments.reduce((acc, g) => acc + Math.max(0, g.length * (g.length - 1) / 2), 0)
	);
	let previewKOMatches = $derived(previewAdvanceCount >= 2 ? Math.max(0, previewKOSize - 1) : 0);
	let previewTotalMatches = $derived(previewTotalGroupPairs + previewKOMatches);

	// Match sequence map for the preview matrix. Engine
	// generates matches in the standard round-robin order
	// (i=0..n, j=i+1..n), so pair (i, j) in the matrix gets
	// the cumulative index from that loop. We compute the
	// same ordering here so the cell number matches the
	// actual match number the engine will assign. The
	// matrix is symmetric — cell (i, j) and (j, i) show the
	// same number.
	let previewMatchMap = $derived.by(() => {
		const g = previewGroupAssignments[previewGroupTab] || [];
		const map = {};
		let seq = 0;
		for (let i = 0; i < g.length; i++) {
			for (let j = i + 1; j < g.length; j++) {
				seq++;
				map[`${i}-${j}`] = seq;
				map[`${j}-${i}`] = seq;
			}
		}
		return map;
	});

	// True when the chosen format includes a knockout
	// stage that the user is generating up-front. Pure
	// round-robin (advance = 1) and double round-robin
	// without KO have no bracket to build — the matches
	// list is the whole schedule. Single/double elim and
	// round-robin + KO do have a bracket.
	let canGenerateBracket = $derived(
		formAdvancePerGroup > 1 ||
		formEliminationFormat === 'single elimination' ||
		formEliminationFormat === 'double elimination'
	);

	// ---- Player + SVK picker helpers (same as 0.3.6 create page) ----
	let svkPickerQuery = $state('');
	let svkPickerResults = $state(/** @type {any[]} */ ([]));
	let svkPickerTimer = null;

	function addPlayer() {
		if (formPlayers.length >= 16) return;
		formPlayers = [...formPlayers, { id: Date.now(), name: `Player ${formPlayers.length + 1}` }];
	}

	function removePlayer(/** @type {number} */ idx) {
		if (formPlayers.length <= 2) return;
		formPlayers = formPlayers.filter((_, i) => i !== idx);
	}

	function updatePlayerName(/** @type {number} */ idx, /** @type {string} */ name) {
		const next = formPlayers.slice();
		next[idx] = { ...next[idx], name };
		formPlayers = next;
	}

	function onSVKPickerInput() {
		if (svkPickerTimer) clearTimeout(svkPickerTimer);
		const q = svkPickerQuery.trim();
		if (!q) {
			svkPickerResults = [];
			return;
		}
		svkPickerTimer = setTimeout(async () => {
			const all = await searchSVKCache({ q });
			const taken = new Set(formPlayers.map(p => p.name.toLowerCase()));
			svkPickerResults = (all || []).filter(r => {
				const full = `${r.surname || ''} ${r.firstName || ''}`.trim().toLowerCase();
				return full && !taken.has(full);
			});
		}, 250);
	}

	function addSVKPlayer(r) {
		if (formPlayers.length >= 16) return;
		const name = `${r.surname} ${r.firstName}`.trim();
		if (!name) return;
		formPlayers = [...formPlayers, { id: Date.now(), name }];
		svkPickerQuery = '';
		svkPickerResults = [];
	}

	// ---- Engine call (shared with create page) ----
	function buildBracket() {
		formError = '';
		const playerNames = formPlayers.map(p => p.name.trim()).filter(Boolean);
		if (playerNames.length < 2) {
			formError = 'At least two players are required.';
			return null;
		}
		const meta = {
			name: formName.trim() || 'Untitled competition',
			ownerId: existing?.ownerId ?? null,
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
			status: formStatus,
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
			result = buildLeague({
				...meta,
				groups: formGroups,
				advancePerGroup: formAdvancePerGroup,
				doubleRoundRobin: formEliminationFormat === 'double round robin'
			});
		}
		// Stable string ids. In edit mode we keep the existing
		// competition id; in create mode we mint a new one.
		const newId = existing?.id || `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		result.competition.id = newId;
		result.matches = (result.matches || []).map((m, i) => ({
			...m,
			competitionId: newId,
			id: `m-${newId}-${i}`
		}));
		return result;
	}

	async function handleSubmit() {
		if (saving) return;
		const result = buildBracket();
		if (!result) return;
		await onSave({ competition: result.competition, matches: result.matches });
	}
</script>

<form class="form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
	<CompetitionWizard mode={mode} bind:competition={formType} bind:matches={formMatches} bind:activeTab={formTab}>
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

				<h3>Live preview</h3>
				<p class="hint">
					Players distribute round-robin into the groups (player 1 → Group 1, player 2 → Group 2, …).
					Below: <strong>{previewTotalGroupPairs}</strong> group match{previewTotalGroupPairs === 1 ? '' : 'es'}
					{#if previewKOMatches > 0}
						+ <strong>{previewKOMatches}</strong> knockout match{previewKOMatches === 1 ? '' : 'es'}
					{/if}
					= <strong>{previewTotalMatches}</strong> total.
				</p>

				{#if previewGroupAssignments.length > 1}
					<nav class="preview-group-tabs" role="tablist" aria-label="Group preview">
						{#each previewGroupAssignments as _g, gi (gi)}
							<button
								type="button"
								role="tab"
								aria-selected={previewGroupTab === gi}
								class="preview-group-tab"
								class:active={previewGroupTab === gi}
								onclick={() => (previewGroupTab = gi)}
							>
								Group {gi + 1}
								<span class="muted small">({previewGroupAssignments[gi].length})</span>
							</button>
						{/each}
					</nav>
				{/if}

				{#if previewGroupAssignments[previewGroupTab]?.length >= 2}
					<div class="matrix-wrap">
						<table class="matrix">
							<thead>
								<tr>
									<th></th>
									{#each previewGroupAssignments[previewGroupTab] as _s, j (j)}
										<th class="col-head">P{j + 1}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each previewGroupAssignments[previewGroupTab] as _row, i (i)}
									<tr>
										<th class="row-head">P{i + 1}</th>
										{#each previewGroupAssignments[previewGroupTab] as _col, j (j)}
											<td class:diag={i === j}>
												{#if i === j}—{:else}{previewMatchMap[`${i}-${j}`] ?? '·'}{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="hint">Add at least 2 players in the Registration tab to see the matrix.</p>
				{/if}
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
				<button class="btn primary" type="submit" disabled={saving}>
					{saving ? 'Saving…' : (submitLabel || (mode === 'edit' ? (canGenerateBracket ? 'Save & rebuild bracket' : 'Save changes') : (canGenerateBracket ? 'Generate bracket' : 'Create competition')))}
				</button>
				<button class="btn ghost" type="button" onclick={onCancel} disabled={saving}>
					Cancel
				</button>
			</div>
		</svelte:fragment>
	</CompetitionWizard>
</form>

<style>
	.muted { color: var(--muted); }
	.small { font-size: var(--text-sm); }
	.error { color: var(--danger, #ff6b6b); font-weight: 700; }
	.form { margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--line); }
	.form h3 {
		margin: var(--space-md) 0 var(--space-sm);
		font-size: var(--text-md);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.form h3:first-of-type { margin-top: 0; }
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
	.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); }
	.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-md); }
	.players {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin-bottom: var(--space-md);
	}
	.player-row {
		display: grid;
		grid-template-columns: 2.4rem 1fr auto;
		align-items: center;
		gap: var(--space-sm);
	}
	.player-num { color: var(--muted); font-variant-numeric: tabular-nums; }
	.add-btn { width: 100%; }
	.svk-picker { margin-top: var(--space-md); }
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
		color: var(--text);
		border-radius: 10px;
		padding: 6px 10px;
		font: inherit;
	}
	.svk-picker-list {
		list-style: none;
		padding: 0;
		margin: 4px 0 0;
		max-height: 14rem;
		overflow-y: auto;
	}
	.svk-picker-item {
		width: 100%;
		text-align: left;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 6px 10px;
		color: var(--text);
		font: inherit;
		cursor: pointer;
		margin-bottom: 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.svk-picker-main { display: flex; align-items: center; gap: 4px; }
	.svk-picker-sub { font-size: var(--text-xs); }
	.svk-id { font-size: var(--text-xs); }
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
	.matrix-wrap { overflow-x: auto; margin: var(--space-sm) 0 var(--space-md); }
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
	.form-actions {
		display: flex;
		gap: var(--space-md);
		justify-content: flex-end;
		margin-top: var(--space-md);
	}
	@media (max-width: 40rem) {
		.grid-2, .grid-3 { grid-template-columns: 1fr; }
		.form-actions { flex-direction: column; }
	}
</style>
