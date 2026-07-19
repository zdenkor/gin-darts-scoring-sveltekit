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
	import Bracket from '$lib/ui/Bracket.svelte';
	import ScoringEditor from '$lib/ui/ScoringEditor.svelte';
	import RoundsScheduler from '$lib/ui/RoundsScheduler.svelte';
	import RichTextEditor from '$lib/ui/RichTextEditor.svelte';
	import { freshScoring } from '$lib/scoring/points.js';

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
	// Type selects between a league (a parent record that
	// owns X round tournaments) and a tournament (a single
	// self-contained bracket / round-robin). Team / team
	// game is NOT a Type — it's a separate Participants
	// picker so a league and a tournament can both be
	// team-based. We deliberately keep Type small.
	const COMP_TYPES = [
		{ value: 'league', label: 'League' },
		{ value: 'tournament', label: 'Tournament' }
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
	let formDate = $state('');
	let formTime = $state('');
	let formLocation = $state('');
	let formRules = $state('');
	let formRoundCount = $state(0);
	// League scoring — bound to <ScoringEditor> for the
	// Scoring wizard tab. Lazy-initialised to fresh
	// defaults so the editor can mutate it in place.
	let formScoring = $state(/** @type {any} */ (null));
	// Per-round editing surface. Mirrors the `rounds`
	// array that we save to the league. RoundsScheduler
	// mutates this in place.
	let formRounds = $state(/** @type {any[]} */ ([]));
	let formParticipantFormat = $state('singles');
	let formEliminationFormat = $state('round robin');
	let formSeeding = $state('ordered');
	// The wizard needs an object with a `type` property
	// so it can branch on league / single / team / elim
	// in `visibleTabs`. We don't bind it back because
	// `formType` is the source of truth — every render
	// just builds a fresh `{ type: formType }` view.
	let formCompetition = $derived(/** @type {any} */ ({ type: formType }));
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
			formDate = existing.date || '';
			formTime = existing.time || '';
			formLocation = existing.location || '';
			formRules = existing.rules || '';
			formRoundCount = existing.roundCount || 0;
			formRounds = (existing.rounds || []).map(r => ({ ...r, players: r.players || [] }));
			formScoring = existing.scoring || freshScoring();
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
			// Fallback: legacy / sparse records may have
			// player names living only in the
			// groupAssignments matrix (the first group
			// is the only one the user can see in the
			// Edit matrix today, so we seed from that).
			if (formPlayers.length === 0 && Array.isArray(existing.groupAssignments) && existing.groupAssignments.length) {
				const flat = [];
				for (const g of existing.groupAssignments) {
					if (Array.isArray(g)) for (const name of g) if (name) flat.push(name);
				}
				formPlayers = flat.map((name, i) => ({ id: i, name }));
			}
			// Rounds hydration: leagues created before
			// the v0.4.36 IDB fix store `rounds: []` even
			// though the per-round child tournaments live
			// in the same store under `parentLeagueId`.
			// Walk those children to recover round
			// metadata (date / time / location) AND to
			// collect the union of round players back
			// into `formPlayers` when both arrays are
			// empty. The $effect body can't be `await`-ed
			// directly (Svelte forbids it), so we wrap
			// the IDB walk in an IIFE.
			if (existing.type === 'league' && (formRounds.length === 0 || formPlayers.length < 2)) {
				(async () => {
					try {
						const { listChildTournaments } = await import('$lib/db/competitions.js');
						const children = await listChildTournaments(existing.id);
						if (!children.length) return;
						if (formRounds.length === 0) {
							formRounds = children.map((c) => ({
								name: c.name || `Round ${c.roundNumber || ''}`.trim(),
								date: c.date || '',
								time: c.time || '',
								location: c.location || '',
								players: Array.isArray(c.players) ? c.players : []
							}));
							formRoundCount = children.length;
						}
						if (formPlayers.length < 2) {
							const seen = new Set(formPlayers.map((p) => p.name));
							for (const c of children) {
								for (const name of c.players || []) {
									if (!seen.has(name)) {
										seen.add(name);
										formPlayers = [...formPlayers, { id: formPlayers.length, name }];
									}
								}
							}
						}
					} catch (e) {
						// eslint-disable-next-line no-console
						console.warn('[CompetitionForm] child-tournament hydrate failed', e);
					}
				})();
			}
			// Keep the same id, don't generate a new one.
		} else if (mode === 'create') {
			// Seed the scoring block so the Scoring tab is
			// immediately usable on a fresh league.
			formScoring = freshScoring();
		}
		initialised = true;
	});

	// Mirror `formRoundCount` changes into the rounds[]
	// editing surface so the Scheduling tab has something
	// to render. Auto-generated rounds start blank — the
	// admin fills in date / time / location in the tab.
	$effect(() => {
		if (formType !== 'league') return;
		const wanted = Math.max(0, formRoundCount | 0);
		if (wanted === formRounds.length) return;
		if (wanted > formRounds.length) {
			const extra = Array.from({ length: wanted - formRounds.length }, (_, i) => ({
				id: `round-${Date.now()}-${formRounds.length + i}-${Math.random().toString(36).slice(2, 6)}`,
				roundNumber: formRounds.length + i + 1,
				name: `${formName || 'League'} ${formSeason || ''} Round ${formRounds.length + i + 1}`.replace(/\s+/g, ' ').trim(),
				date: '',
				time: '',
				location: formLocation || '',
				status: 'pending',
				players: [],
				matches: []
			}));
			formRounds = [...formRounds, ...extra];
		} else {
			formRounds = formRounds.slice(0, wanted);
		}
	});

	// Round-robin distribution for the live preview, mirroring
	// the engine's distribution (player i → bucket i % groups).
	// The user can override individual slots in the matrix via
	// the dropdown in the row header (see matrixSlotOverrides +
	// previewGroupSlots below). The engine still seeds the
	// bracket round-robin from formPlayers — the overrides are
	// preview-only so the matrix shows the user what the manual
	// distribution would look like.
	let previewGroupAssignments = $derived.by(() => {
		const g = Math.max(1, Number(formGroups) || 1);
		const names = formPlayers.map(p => p.name.trim()).filter(Boolean);
		const buckets = Array.from({ length: g }, () => []);
		names.forEach((p, i) => buckets[i % g].push(p));
		return buckets;
	});

	// Per-slot manual overrides. Keyed by [gi][si]. When the
	// user picks a different name from the row header dropdown
	// the override is stored here and previewGroupSlots reads
	// from it instead of the auto round-robin bucket.
	let matrixSlotOverrides = $state(/** @type {Record<number, Record<number, string>>} */ ({}));

	// The actual slot list shown in the matrix header. For each
	// group we expose every slot (auto or overridden). A slot
	// is the position in the matrix — the dropdown lets the
	// user pick the player that should sit there. Empty slots
	// (no player assigned, no override) show as '—' in the
	// preview, but the underlying count for preview match
	// sequence is determined by the slot count, not the
	// override value.
	let previewGroupSlots = $derived.by(() => {
		return previewGroupAssignments.map((autoGroup, gi) => {
			const overrides = matrixSlotOverrides[gi] || {};
			return autoGroup.map((autoName, si) => overrides[si] || autoName);
		});
	});

	// Available player names for the slot dropdowns. The
	// union of the auto-distribution (so the user can pick
	// anyone) and the current overrides (so a name the user
	// already put in the matrix stays selectable even if
	// it's not in the round-robin seed).
	let availablePlayers = $derived.by(() => {
		const set = new Set();
		for (const g of previewGroupSlots) for (const n of g) if (n) set.add(n);
		for (const p of formPlayers) if (p.name?.trim()) set.add(p.name.trim());
		return Array.from(set);
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

	// KO-stage match objects for the bracket preview. We
	// run the same engine the user would get on submit so
	// the preview is identical to the final bracket — if
	// the user picks a different seeding the KO pairings
	// move with it. Only the KO rounds are forwarded;
	// the group matches are still summarised above.
	let previewKOMatchList = $derived.by(() => {
		if (previewKOMatches === 0) return [];
		const players = formPlayers.map(p => p.name.trim()).filter(Boolean);
		if (players.length < 2) return [];
		if (
			formEliminationFormat === 'single elimination' ||
			formEliminationFormat === 'double elimination'
		) {
			// The tournament path has no group stage; the
			// whole bracket is the KO stage.
			const { matches } = buildTournament({
				name: 'preview', ownerId: null, players,
				format: formEliminationFormat,
				legsToWin: 1
			});
			return matches;
		}
		if (formEliminationFormat === 'round robin knockout' || formEliminationFormat === 'round robin') {
			const manualGroups = previewGroupSlots.map(group => group.filter(Boolean));
			if (formEliminationFormat === 'round robin' || formEliminationFormat === 'double round robin') {
				// No KO stage to preview.
				return [];
			}
			const { matches } = buildLeague({
				name: 'preview', ownerId: null, players,
				groups: formGroups, advancePerGroup: formAdvancePerGroup,
				doubleRoundRobin: false, manualGroups
			});
			return matches;
		}
		return [];
	});

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

	// Assign a player name to a matrix slot and clear the
	// same name from every other slot. This is how we
	// guarantee the user can't accidentally place the same
	// player in two slots at once — picking someone from
	// the dropdown removes them from the other rows, and
	// any slot they left behind goes back to the empty
	// option so the user has to repopulate it on purpose.
	// True when the given player name is already assigned
	// to a different slot in any group. The dropdown uses
	// this to grey out names that the user couldn't pick
	// without overwriting another slot. The current row
	// (gi, si) is always allowed to keep its own value so
	// the option stays selectable when re-opening the
	// picker.
	function isPlayerUsedElsewhere(/** @type {string} */ name, /** @type {number} */ gi, /** @type {number} */ si) {
		for (const [otherGi, group] of Object.entries(matrixSlotOverrides)) {
			for (const [k, v] of Object.entries(group)) {
				if (v !== name) continue;
				if (Number(otherGi) === gi && Number(k) === si) continue;
				return true;
			}
		}
		return false;
	}

	// Player names the user can pick for a given row. The
	// current row's own name is always included (so the
	// picker stays selectable when re-opening), but every
	// name that's already pinned to a different row in
	// this group is hidden. The user only sees the
	// available pool: registered players that are not
	// already on the board.
	function availablePlayersForRow(/** @type {number} */ si) {
		const currentName = previewGroupSlots[previewGroupTab]?.[si] || '';
		const taken = new Set();
		for (const [otherGi, group] of Object.entries(matrixSlotOverrides)) {
			if (Number(otherGi) !== previewGroupTab) continue;
			for (const [k, v] of Object.entries(group)) {
				if (Number(k) === si) continue;
				if (v) taken.add(v);
			}
		}
		const out = [];
		for (const p of formPlayers) {
			const name = (p.name || '').trim();
			if (!name) continue;
			if (taken.has(name)) continue;
			out.push(name);
		}
		// Keep the current value selectable even if it's
		// not in formPlayers anymore (e.g. legacy edits).
		if (currentName && !out.includes(currentName)) out.unshift(currentName);
		return out;
	}

	function assignMatrixSlot(/** @type {number} */ gi, /** @type {number} */ si, /** @type {string} */ name) {
		// Copy the current override map for this group.
		const next = { ...(matrixSlotOverrides[gi] || {}) };
		if (name) {
			// Drop the new name from every other slot.
			for (const [k, v] of Object.entries(next)) {
				if (Number(k) !== si && v === name) delete next[Number(k)];
			}
		}
		next[si] = name;
		// Also clean up the same name in the OTHER groups
		// so the user can't put the same player in Group 1
		// and Group 2 by accident.
		const allGroups = { ...matrixSlotOverrides };
		allGroups[gi] = next;
		if (name) {
			for (const [otherGi, group] of Object.entries(allGroups)) {
				if (Number(otherGi) === gi) continue;
				const cleaned = { ...group };
				let changed = false;
				for (const [k, v] of Object.entries(cleaned)) {
					if (v === name) {
						delete cleaned[Number(k)];
						changed = true;
					}
				}
				if (changed) allGroups[Number(otherGi)] = cleaned;
			}
		}
		matrixSlotOverrides = allGroups;
	}

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
		// Dátum a čas sú pre competition povinné (okrem
		// ligy, kde dátum žije na jednotlivých kolách v
		// Scheduling tabe). Bez dátumu sa event v kalendári
		// nikdy nezobrazí a vyzerá to ako "competition
		// bez začiatku". Vyžadujeme oboje — dátum aj čas —
		// aby hráč vedel kedy prísť.
		if (formType !== 'league') {
			if (!formDate) {
				formError = 'Date is required for a competition. Pick a day in the Setup tab.';
				return null;
			}
			if (!formTime) {
				formError = 'Time is required for a competition. Pick a time in the Setup tab.';
				return null;
			}
		} else {
			// League: every round needs a date + time in
			// the Scheduling tab. If any round is missing
			// them, the publish step would silently skip
			// it (`if (!r.date) continue;`) and you'd get
			// a competition whose rounds never reach the
			// calendar. Fail fast here instead.
			if (Array.isArray(formRounds) && formRounds.length > 0) {
				const missing = formRounds
					.map((r, i) => ({ name: r.name || `Round ${i + 1}`, date: r.date, time: r.time }))
					.filter(r => !r.date || !r.time);
				if (missing.length > 0) {
					const list = missing.map(r => r.name).join(', ');
					formError = `Date and time are required for every round. Missing: ${list}. Open the Scheduling tab.`;
					return null;
				}
			}
		}
		const playerNames = formPlayers.map(p => p.name.trim()).filter(Boolean);
		if (playerNames.length < 2) {
			formError = 'At least two players are required.';
			return null;
		}
		// For league-style formats we want to make sure the
		// user has actually placed every registered player
		// into a slot. The engine would otherwise fall back
		// to the round-robin default, but the matrix
		// dropdown was meant to be authoritative — the
		// user is on the hook for finishing the layout.
		if (
			formEliminationFormat === 'round robin' ||
			formEliminationFormat === 'round robin knockout' ||
			formEliminationFormat === 'double round robin'
		) {
			const assigned = new Set();
			for (const group of previewGroupSlots) {
				for (const n of group) if (n) assigned.add(n);
			}
			const missing = playerNames.filter(n => !assigned.has(n));
			if (missing.length > 0) {
				formError = `These players are not assigned to a slot yet: ${missing.join(', ')}. Pick them from the matrix dropdowns or open the Registration tab.`;
				return null;
			}
		}
		const meta = {
			name: formName.trim() || 'Untitled competition',
			ownerId: existing?.ownerId ?? null,
			// Tournament venue + date (ISO YYYY-MM-DD) are
			// captured on the Setup tab and shipped in the
			// competition shape so the calendar and history
			// can surface them later.
			date: formType === 'league' ? '' : (formDate || ''),
			time: formType === 'league' ? '' : (formTime || ''),
			location: formLocation || '',
			rules: formRules || '',
			// League shape. We pre-fill the rounds array
			// with N empty placeholders so the league is
			// "wired" as soon as the form is saved. The
			// player can then open the parent page and
			// add a date / location for each round.
			roundCount: formType === 'league' ? Math.max(0, formRoundCount | 0) : 0,
			// Per-round details (date / time / location)
			// come from the Scheduling tab. The array is
			// kept in sync with `formRoundCount` via the
			// `$effect` above. If the admin never opens
			// the Scheduling tab, we still fall back to a
			// blank auto-generated set so the shape is
			// stable.
			rounds: formType === 'league' && formRounds.length === Math.max(0, formRoundCount | 0)
				? formRounds
				: formType === 'league'
					? Array.from({ length: Math.max(0, formRoundCount | 0) }, (_, i) => ({
						id: `round-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
						roundNumber: i + 1,
						name: `${formName.trim() || 'Untitled league'} ${formSeason || ''} Round ${i + 1}`.replace(/\s+/g, ' ').trim(),
						date: '',
						time: '',
						location: formLocation || '',
						status: 'pending',
						players: [],
						matches: []
					}))
					: [],
			// League scoring — only relevant for league
			// competitions. The editor owns the deep clone
			// so we just pass it through.
			scoring: formType === 'league' ? (formScoring || freshScoring()) : null,
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
		} else if (formParticipantFormat === 'team') {
			result = buildTeamGame(meta);
		} else if (
			formEliminationFormat === 'single elimination' ||
			formEliminationFormat === 'double elimination'
		) {
			result = buildTournament({ ...meta, format: formEliminationFormat });
		} else {
			// Pull the user's manual slot picks from the
			// matrix and pass them to the engine. The engine
			// distributes by groupAssignments and runs
			// round-robin within each group. If the user
			// didn't touch the matrix (no overrides) the
			// manual layout matches the auto round-robin, so
			// passing the slots through is a no-op and the
			// bracket is identical to the legacy behaviour.
			const manualGroups = previewGroupSlots.map(group => group.filter(Boolean));
			result = buildLeague({
				...meta,
				groups: formGroups,
				advancePerGroup: formAdvancePerGroup,
				doubleRoundRobin: formEliminationFormat === 'double round robin',
				manualGroups,
				rounds: formRounds
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
		// eslint-disable-next-line no-console
		console.log('[DEBUG save] handleSubmit called, saving=' + saving + ' formType=' + formType + ' formName=' + JSON.stringify(formName) + ' formRoundCount=' + formRoundCount + ' formRounds.length=' + formRounds.length);
		if (saving) return;
		const result = buildBracket();
		// eslint-disable-next-line no-console
		console.log('[DEBUG save] buildBracket returned ' + (result ? 'truthy' : 'falsy') + ' formError=' + JSON.stringify(formError));
		if (!result) return;
		await onSave({ competition: result.competition, matches: result.matches });
	}
</script>

<form class="form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
	<!-- Form-wide error banner. The per-tab
	     `formError` placeholder inside the Setup slot
	     is still there for backwards compat, but
	     errors raised by Save (e.g. "Date is required")
	     can fire while the user is sitting on the
	     Finalization tab — that placeholder would be
	     off-screen. The banner above the wizard is
	     always visible regardless of which tab the
	     user is currently on, so the message always
	     lands somewhere the user can see it. -->
	{#if formError}
		<div class="form-error" role="alert" aria-live="polite">
			<strong>Cannot save:</strong> {formError}
		</div>
	{/if}
	<CompetitionWizard
		mode={mode}
		competition={formCompetition}
		bind:matches={formMatches}
		bind:activeTab={formTab}
		onSave={handleSubmit}
		onCancel={() => onCancel()}
	>
		<svelte:fragment slot="setup">
			{#if formError}
				<p class="error">{formError}</p>
			{/if}
			<!-- Type is the first field on the form so the
			     rest of the UI can branch on league / single /
			     team / elimination without re-shuffling. -->
			<div class="grid-3">
				<label class="field">
					<span>Type</span>
					<select id="form-type" name="form-type" bind:value={formType}>
						{#each COMP_TYPES as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</label>
				{#if formType === 'league'}
					<label class="field">
						<span>Number of rounds</span>
						<input id="form-round-count" name="form-round-count" type="number" min="0" max="52" bind:value={formRoundCount} />
					</label>
				{/if}
			</div>

			<div class="grid-3">
				<label class="field">
					<span>Name</span>
					<input id="form-name" name="form-name" type="text" bind:value={formName} placeholder="League or tournament name" required />
				</label>
				<!-- For leagues, the date / time live on each
				     round in the Scheduling tab. Showing them
				     here would be misleading (the league as a
				     whole has no single date — it spans the
				     whole season). -->
				{#if formType !== 'league'}
					<label class="field">
						<span>Date</span>
						<input id="form-date" name="form-date" type="date" bind:value={formDate} />
					</label>
					<label class="field">
						<span>Time</span>
						<input id="form-time" name="form-time" type="time" bind:value={formTime} />
					</label>
				{/if}
				<label class="field">
					<span>Location</span>
					<input id="form-location" name="form-location" type="text" bind:value={formLocation} placeholder="e.g. Nitra, pub Centrum" />
				</label>
				<label class="field">
					<span>Season</span>
					<input id="form-season" name="form-season" type="text" bind:value={formSeason} placeholder="2026" />
				</label>
			</div>

			<label class="field rules-field">
				<span>Rules</span>
				<RichTextEditor
					bind:content={formRules}
					placeholder="Describe the rules of this competition (legs, in/out, double-out, scoring, …)"
				/>
				<small class="muted">Free-form text. Shown on the competition detail page.</small>
				</label>

				<div class="grid-3">
				<label class="field">
					<span>Participants</span>
					<select id="form-participant-format" name="form-participant-format" bind:value={formParticipantFormat}>
						{#each PARTICIPANT_FORMATS as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span>Format</span>
					<select id="form-elimination-format" name="form-elimination-format" bind:value={formEliminationFormat}>
						{#each ELIMINATION_FORMATS as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</label>
				</div>

				<h3>Game rules</h3>
				<div class="grid-3">
				<label class="field">
					<span>Game mode</span>
					<select id="form-game-mode" name="form-game-mode" bind:value={formGameMode}>
						<option value="x01">x01</option>
					</select>
				</label>
				<label class="field">
					<span>Start score</span>
					<select id="form-start" name="form-start" bind:value={formStart}>
						{#each START_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span>Out rule</span>
					<select id="form-out-rule" name="form-out-rule" bind:value={formOutRule}>
						{#each Object.entries(X01_OUT_OPTIONS) as [key, opt]}<option value={key}>{opt.label}</option>{/each}
					</select>
				</label>
			</div>
			<div class="grid-2">
				<label class="field">
					<span>Legs to win</span>
					<input id="form-legs-to-win" name="form-legs-to-win" type="number" min="1" max="99" bind:value={formLegsToWin} />
				</label>
				<label class="field">
					<span>Sets to win</span>
					<input id="form-sets-to-win" name="form-sets-to-win" type="number" min="1" max="99" bind:value={formSetsToWin} />
				</label>
			</div>

			<label class="field">
				<span>Notes (optional)</span>
				<textarea id="form-notes" name="form-notes" rows="2" bind:value={formNotes} placeholder="Anything to remember about this competition"></textarea>
			</label>
		</svelte:fragment>

		<svelte:fragment slot="scheduling">
			{#if formType === 'league' && formRounds.length > 0}
				<h3>Schedule rounds</h3>
				<p class="muted small">
					Set the date / time / location of the first round,
					then "Apply to all rounds" to repeat weekly.
				</p>
				<RoundsScheduler bind:rounds={formRounds} leagueName={formName || 'League'} season={formSeason || ''} location={formLocation || ''} />
			{:else}
				<p class="muted">Scheduling is only available for league competitions with rounds.</p>
			{/if}
		</svelte:fragment>

		<svelte:fragment slot="standings">
			<h3>Standings</h3>
			<p class="muted small">
				Live standings will appear here once matches are played.
			</p>
		</svelte:fragment>

		<svelte:fragment slot="finalization">
			<h3>Finalization</h3>
			{#if formType === 'league'}
				<section class="summary">
					<h4>Summary</h4>
					<div class="summary-grid">
						<div class="summary-item">
							<strong>Name</strong>
							<span>{formName || 'Unnamed league'}</span>
						</div>
						<div class="summary-item">
							<strong>Season</strong>
							<span>{formSeason}</span>
						</div>
						<div class="summary-item">
							<strong>When / Where</strong>
							<span>
								{#if formDate}
									{[formDate, formTime].filter(Boolean).join(' ')}
								{:else if formRounds.length}
									{(formRounds.map((/** @type {any} */ r) => r?.date).filter(Boolean).sort()[0] || '')}
									{#if formRounds.length > 1}
										 – {(formRounds.map((/** @type {any} */ r) => r?.date).filter(Boolean).sort()[formRounds.length - 1] || '')}
									{/if}
								{:else}
									No date set
								{/if}
								{#if formLocation} &middot; {formLocation}{/if}
							</span>
						</div>
						<div class="summary-item">
							<strong>Rounds</strong>
							<span>{formRounds.length || formRoundCount || 'Not set'}</span>
						</div>
						<div class="summary-item">
							<strong>Game</strong>
							<span>
								{formGameMode.toUpperCase()} {formStart}
								({formInRule}-in / {formOutRule}-out)
							</span>
						</div>
						{#if formScoring}
							<div class="summary-item full">
								<strong>Scoring</strong>
								<span>
									{formScoring.bonus?.max180 ?? 0} pts per max (180/171)
									&middot;
									{formScoring.bonus?.highCheckout ?? 0} pts per checkout ≥ {formScoring.bonus?.highCheckoutMin ?? 100}
								</span>
							</div>
							{#if formScoring.pointsTable?.length}
								<div class="summary-item full">
									<strong>Points table</strong>
									<ul class="points-preview">
										{#each formScoring.pointsTable.slice(0, 5) as row}
											<li>{row.placement}: {row.points.join(' / ')}</li>
										{/each}
										{#if formScoring.pointsTable.length > 5}
											<li>… and {formScoring.pointsTable.length - 5} more</li>
										{/if}
									</ul>
								</div>
							{/if}
						{/if}
					</div>
				</section>
			{:else}
				<section class="summary">
					<h4>Summary</h4>
					<div class="summary-grid">
						<div class="summary-item">
							<strong>Name</strong>
							<span>{formName || 'Unnamed tournament'}</span>
						</div>
						<div class="summary-item">
							<strong>Type</strong>
							<span>{formEliminationFormat}</span>
						</div>
						<div class="summary-item">
							<strong>Players</strong>
							<span>{formPlayers.length}</span>
						</div>
						<div class="summary-item">
							<strong>Game</strong>
							<span>
								{formGameMode.toUpperCase()} {formStart}
								({formInRule}-in / {formOutRule}-out)
							</span>
						</div>
					</div>
				</section>
			{/if}
			<p class="muted small">
				Review your competition above, then click Finish and Save in the bar at the bottom to publish it.
			</p>
		</svelte:fragment>

		<svelte:fragment slot="scoring">
			<ScoringEditor bind:scoring={formScoring} league={formType === 'league'} />
		</svelte:fragment>

		<svelte:fragment slot="registration">
			<h3>Players</h3>
			<div class="players">
				{#each formPlayers as p, i (p.id)}
					<div class="player-row">
						<span class="player-num">P{i + 1}</span>
						<input
							id="player-name-{i}"
							name="player-name"
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
						name="svk-picker-input"
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
						<input id="form-groups" name="form-groups" type="number" min="1" max="8" bind:value={formGroups} />
					</label>
					<label class="field">
						<span>Advance per group</span>
						<input id="form-advance-per-group" name="form-advance-per-group" type="number" min="1" max="4" bind:value={formAdvancePerGroup} />
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

				{#if previewGroupSlots[previewGroupTab]?.length >= 2 && (formEliminationFormat === 'round robin' || formEliminationFormat === 'round robin knockout' || formEliminationFormat === 'double round robin')}
					<div class="matrix-wrap">
						<table class="matrix">
							<thead>
								<tr>
									<th class="row-num-head">#</th>
									<th class="row-name-head">Name</th>
									{#each previewGroupSlots[previewGroupTab] as _col, j (j)}
										<th class="col-head">{j + 1}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each previewGroupSlots[previewGroupTab] as rowName, i (i)}
									<tr>
										<th class="row-num">{i + 1}</th>
										<th class="row-head">
											<select
												id="matrix-slot-{previewGroupTab}-{i}"
												name="matrix-slot"
												class="matrix-slot-select"
												value={rowName || ''}
												onchange={(e) => {
													const v = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
													assignMatrixSlot(previewGroupTab, i, v);
												}}
												aria-label="Player for row {i + 1}"
											>
												<option value="">— empty —</option>
												{#each availablePlayersForRow(i) as p (p)}
													<option value={p}>{p}</option>
												{/each}
											</select>
										</th>
										{#each previewGroupSlots[previewGroupTab] as _col, j (j)}
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
				{#if previewKOMatchList.length > 0}
					<h3>Knockout bracket preview</h3>
					<div class="bracket-wrap">
						<Bracket matches={previewKOMatchList} competition={{ type: 'league', format: formEliminationFormat, groups: formGroups, advancePerGroup: formAdvancePerGroup }} />
					</div>
				{/if}
			{:else}
				<h3>Tournament seeding</h3>
				<label class="field">
					<span>Seeding</span>
					<select id="form-seeding" name="form-seeding" bind:value={formSeeding}>
						{#each SEEDINGS as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</label>
				{/if}
				</svelte:fragment>
				</CompetitionWizard>
				</form>

<style>
	.muted { color: var(--muted); }
	.small { font-size: var(--text-sm); }
	.error { color: var(--danger, #ff6b6b); font-weight: 700; }
	/* Form-wide error banner. Bigger than the inline
	   `.error` used inside the Setup slot so it reads
	   as a blocking issue from across the page. */
	.form-error {
		margin: 0 0 var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--danger-bg, rgba(255, 107, 107, 0.12));
		border: 1px solid var(--danger, #ff6b6b);
		border-radius: 6px;
		color: var(--danger, #ff6b6b);
		font-size: var(--text-sm);
	}
	.form-error strong {
		color: var(--danger, #ff6b6b);
		margin-right: 0.25em;
	}
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
	.bracket-wrap {
		/* Cap the bracket preview height so a long
		   tournament doesn't push the rest of the tab
		   out of the viewport. The user can scroll
		   within the wrapper if they need to see more. */
		overflow: auto;
		max-height: 60vh;
		margin: var(--space-sm) 0 var(--space-md);
		padding: var(--space-sm);
		background: var(--bg-2, #14181f);
		border: 1px solid var(--line);
		border-radius: var(--radius, 8px);
	}
	table.matrix {
		/* The matrix has a row header (the dropdown) on
		   the left and N column headers (player names) on
		   top, and N×N cells. table-layout: fixed with
		   width: 100% makes every cell the same width so
		   the match-sequence numbers line up visually
		   down each column, instead of the table growing
		   to fit the longest player name. */
		width: 100%;
		table-layout: fixed;
		border-collapse: separate;
		border-spacing: 0;
		font-size: var(--text-sm);
	}
	table.matrix th,
	table.matrix td {
		padding: 6px 10px;
		border: 1px solid var(--line);
		/* Match sequence numbers and the diag '—' read
		   better centred. The row/col heads stay centred
		   via the .row-head/.col-head rule below. */
		text-align: center;
		white-space: nowrap;
	}
	table.matrix thead th { background: var(--surface); }
	table.matrix .row-head,
	table.matrix .col-head {
		background: var(--surface);
		color: var(--muted);
		text-align: center;
	}
	/* Matrix header / row layout, in column order:
	      #  | Name  | 1 | 2 | 3 | 4
	   The first column is a tight row index, the second
	   column carries the dropdown. Pinning the widths
	   here keeps the table from drifting under
	   table-layout: fixed. */
	table.matrix .row-num-head,
	table.matrix .row-num {
		width: 2.5em;
		background: var(--surface);
		color: var(--muted);
		font-weight: 600;
		text-align: center;
	}
	table.matrix .row-name-head {
		width: 12em;
		background: var(--surface);
		color: var(--muted);
		text-align: left;
	}
	/* The row header is the only cell that needs to
	   stretch to fit the dropdown. With table-layout:
	   fixed every column would otherwise share the
	   remaining width equally, which is too narrow
	   for the picker. Pin the first column wide and
	   let the rest of the matrix split the leftover
	   space evenly. */
	table.matrix .row-head {
		width: 12em;
	}
	table.matrix .col-head {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.matrix-slot-select {
		/* Compact select inside the matrix row header. Same
		   dark-theme treatment as the bot-level-select: opaque
		   background so the option list is readable, the row
		   header is still grey to mark it as a column heading. */
		background: var(--bg, #1a1f2b);
		color: var(--text, #e6ebf2);
		border: 1px solid var(--line, #2c3343);
		border-radius: 6px;
		padding: 2px 6px;
		font: inherit;
		font-size: 0.85em;
		min-width: 7em;
		max-width: 12em;
	}
	/* Native <option> styling is limited (browsers disagree
	   on what they style), but option:disabled works in
	   Chromium / Firefox / Safari. Players already in use
	   show greyed out and are unselectable; the rest stay
	   the default text colour. */
	.matrix-slot-select option:disabled {
		color: var(--muted, #8a93a4);
		font-style: italic;
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
	.summary {
		margin: var(--space-sm) 0 var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--surface, #161c27);
		border: 1px solid var(--line, #2c3343);
		border-radius: var(--radius, 8px);
	}
	.summary h4 {
		margin: 0 0 var(--space-sm);
		font-size: 0.95rem;
		color: var(--text, #e6ecf5);
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: var(--space-sm);
	}
	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.summary-item.full {
		grid-column: 1 / -1;
	}
	.summary-item strong {
		font-size: 0.75rem;
		color: var(--muted, #99a3b3);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.summary-item span {
		font-size: 0.9rem;
		color: var(--text, #e6ecf5);
		line-height: 1.3;
	}
	.points-preview {
		margin: var(--space-xs) 0 0;
		padding-left: 1.2em;
		font-size: 0.85rem;
		color: var(--muted, #99a3b3);
	}
	.points-preview li { margin-bottom: 2px; }
	@media (max-width: 40rem) {
		.grid-2, .grid-3 { grid-template-columns: 1fr; }
		.form-actions { flex-direction: column; }
	}
</style>
