// =================================================================
// Competition registry in IndexedDB.
// A competition can be a league or tournament and owns matches.
// =================================================================

import { put, getAll, del } from './idb.js';

const STORE = 'competitions';

export async function createCompetition(data) {
	const id = data.id || `comp-${Date.now()}`;
	const record = {
		id,
		name: data.name || 'Unnamed competition',
		type: data.type || 'league',
		status: data.status || 'active',
		players: data.players || [],
		createdAt: data.createdAt || Date.now(),
		meta: data.meta || {}
	};
	await put(STORE, record, id);
	return record;
}

export async function listCompetitions() {
	return getAll(STORE);
}

export async function deleteCompetition(id) {
	await del(STORE, id);
}

export async function seedCompetitionsIfEmpty() {
	const existing = await listCompetitions();
	if (existing.length > 0) return;
	await createCompetition({
		name: 'Summer League 2026',
		type: 'league',
		status: 'active',
		players: ['Gin', 'Alex', 'Bob'],
		meta: { rounds: 10 }
	});
	await createCompetition({
		name: 'Weekend Cup',
		type: 'tournament',
		status: 'upcoming',
		players: ['Gin', 'Alex'],
		meta: { bracketSize: 8 }
	});
}
