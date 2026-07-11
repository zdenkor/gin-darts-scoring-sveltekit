// =================================================================
// Competition registry in IndexedDB.
// A competition can be a league, tournament, single game, or team
// game and owns matches. The competition record stores the rule
// set (format, gameMode, gameOpts, season, etc.); matches are
// stored separately in the `matches` store and indexed by
// competitionId so the per-competition view can fetch them.
// =================================================================

import { put, getAll, del, get } from './idb.js';

const STORE = 'competitions';
const MATCH_STORE = 'matches';

export async function createCompetition(/** @type {any} */ data) {
	const id = data.id || `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const record = {
		id,
		name: data.name || 'Unnamed competition',
		type: data.type || 'league',
		format: data.format || null,
		participantFormat: data.participantFormat || 'singles',
		eliminationFormat: data.eliminationFormat || null,
		seeding: data.seeding || 'ordered',
		// Tournament venue + date (ISO YYYY-MM-DD) are
		// captured on the Setup tab and shipped in the
		// competition shape so the calendar and history
		// can surface them later.
		date: data.date || '',
		location: data.location || '',
		// League shape. A league is a parent record that
		// owns N rounds, each of which is a self-contained
		// sub-tournament. The rounds[] array is empty for
		// non-league competitions and is the source of
		// truth for everything that shows up on the
		// calendar. Each round has its own date / location
		// and accumulates the same players.
		roundCount: data.roundCount || 0,
		rounds: data.rounds || [],
		status: data.status || 'pending',
		players: data.players || [],
		gameMode: data.gameMode || 'x01',
		gameOpts: data.gameOpts || {},
		legsToWin: data.legsToWin || 1,
		setsToWin: data.setsToWin || 1,
		groups: data.groups || 1,
		advancePerGroup: data.advancePerGroup || 2,
		doubleRoundRobin: !!data.doubleRoundRobin,
		season: data.season || null,
		notes: data.notes || '',
		teams: data.teams || null,
		createdAt: data.createdAt || Date.now(),
		ownerId: data.ownerId || null,
		meta: data.meta || {}
	};
	await put(STORE, record);
	return record;
}

// Create a competition AND its matches in one call. The matches
// array is taken from the engine.js builder — caller is responsible
// for rewriting match.id and match.competitionId to match the
// competition's new id.
export async function createCompetitionWithMatches(/** @type {any} */ competitionData, /** @type {any[]} */ matches) {
	const comp = await createCompetition(competitionData);
	// Rewrite competitionId on every match so it lines up with the
	// freshly-generated competition id. Each match gets a stable
	// string id derived from the competition id + its index.
	const ms = (matches || []).map((/** @type {any} */ m, /** @type {number} */ i) => ({
		...m,
		competitionId: comp.id,
		id: m.id || `m-${comp.id}-${i}`,
	}));
	for (const m of ms) {
		await put(MATCH_STORE, m);
	}
	return { competition: comp, matches: ms };
}

export async function listCompetitions() {
	return getAll(STORE);
}

export async function getCompetition(id) {
	return get(STORE, id);
}

// Update an existing competition by id. The user changes the
// rules / player list and we replace the record. Matches are
// also rebuilt by the caller — we just leave the matches store
// alone here. (The edit page will delete old matches and write
// new ones via the same createCompetitionWithMatches helper
// would need id rewrite; we do it inline below to keep the
// contract simple.)
export async function updateCompetition(/** @type {any} */ data) {
	if (!data || !data.id) throw new Error('updateCompetition: id is required');
	const existing = await get(STORE, data.id);
	if (!existing) throw new Error(`Competition ${data.id} not found`);
	const record = {
		...existing,
		...data,
		id: existing.id,
		createdAt: existing.createdAt,
		updatedAt: Date.now(),
	};
	await put(STORE, record);
	return record;
}

export async function listMatches(competitionId) {
	return getAll(MATCH_STORE, 'competitionId', IDBKeyRange.only(competitionId));
}

export async function deleteCompetition(id) {
	// Also delete every match that belongs to this competition so
	// the matches store doesn't accumulate orphans.
	const matches = await listMatches(id);
	for (const m of matches) {
		await del(MATCH_STORE, m.id);
	}
	await del(STORE, id);
}

// Replace one player name with another across the whole
// competition: the player list, the group assignments, and
// every match in the bracket. The user does this when a
// registered player has to drop out and someone else
// takes their slot — we don't rebuild the bracket, we
// just patch the existing matches in place so that the
// schedule doesn't reset.
export async function replacePlayer(competitionId, oldName, newName) {
	if (!oldName || !newName || oldName === newName) {
		throw new Error('replacePlayer: oldName and newName must differ');
	}
	const competition = await get(STORE, competitionId);
	if (!competition) throw new Error(`Competition ${competitionId} not found`);

	// Update the player list and any group assignments.
	const newPlayers = (competition.players || []).map(p => (p === oldName ? newName : p));
	const newGroups = (competition.groupAssignments || []).map(g => g.map(p => (p === oldName ? newName : p)));
	const updated = {
		...competition,
		players: newPlayers,
		groupAssignments: newGroups,
		updatedAt: Date.now()
	};
	await put(STORE, updated);

	// Patch every match that referenced the old name. We
	// re-evaluate winner: if the old name was the winner
	// we switch the winner key (p1 / p2) to point at the
	// new slot, so a complete match doesn't end up with
	// the wrong player credited.
	const matches = await listMatches(competitionId);
	for (const m of matches) {
		let nextP1 = m.p1;
		let nextP2 = m.p2;
		let nextWinner = m.winner;
		if (m.p1 === oldName) nextP1 = newName;
		if (m.p2 === oldName) nextP2 = newName;
		if (m.winner === 'p1' && m.p1 === oldName) nextWinner = 'p1';
		else if (m.winner === 'p2' && m.p2 === oldName) nextWinner = 'p2';
		if (nextP1 !== m.p1 || nextP2 !== m.p2 || nextWinner !== m.winner) {
			await put(MATCH_STORE, { ...m, p1: nextP1, p2: nextP2, winner: nextWinner });
		}
	}
	return updated;
}

export async function updateMatch(match) {
	await put(MATCH_STORE, match);
	return match;
}

/**
 * League round helpers. A league owns an array of
 * `rounds`, each of which is a self-contained sub-tournament
 * with its own date / location / matches. The round id is
 * stable so we can update it from a separate editor
 * without rebuilding the whole competition.
 */
export async function createRound(/** @type {string} */ competitionId, /** @type {any} */ round) {
	const comp = await getCompetition(competitionId);
	if (!comp) return null;
	const r = {
		id: round?.id || `round-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		roundNumber: round?.roundNumber || (comp.rounds?.length || 0) + 1,
		name: round?.name || `${comp.name} — kolo ${round?.roundNumber || (comp.rounds?.length || 0) + 1}`,
		date: round?.date || '',
		location: round?.location || comp.location || '',
		status: round?.status || 'pending',
		matches: round?.matches || []
	};
	comp.rounds = [...(comp.rounds || []), r];
	await put(STORE, comp);
	return r;
}

export async function updateRound(/** @type {string} */ competitionId, /** @type {string} */ roundId, /** @type {any} */ patch) {
	const comp = await getCompetition(competitionId);
	if (!comp) return null;
	const idx = (comp.rounds || []).findIndex((/** @type {any} */ r) => r.id === roundId);
	if (idx < 0) return null;
	comp.rounds[idx] = { ...comp.rounds[idx], ...patch, id: roundId };
	await put(STORE, comp);
	return comp.rounds[idx];
}

export async function deleteRound(/** @type {string} */ competitionId, /** @type {string} */ roundId) {
	const comp = await getCompetition(competitionId);
	if (!comp) return null;
	comp.rounds = (comp.rounds || []).filter((/** @type {any} */ r) => r.id !== roundId);
	await put(STORE, comp);
	return comp.rounds;
}

// Previously this seeded two demo competitions ('Summer League
// 2026' and 'Weekend Cup') when the store was empty. The user
// found them confusing — they could not delete them because the
// seed re-created them on every visit. The list now starts
// empty; users create their own competitions via the form.
// Kept as a no-op so the import in /competitions still works
// (the call site still invokes it after every refresh).
export async function seedCompetitionsIfEmpty() {
	// intentionally empty
}
