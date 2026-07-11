/**
 * League standings — pure read-only helper.
 *
 * Takes a competition, the list of matches that belong
 * to it, and the scoring block (points table + bonus
 * rules) and returns a flat standings list. The engine
 * itself is not touched — this module reads the same
 * match shape the engine already produces (winner,
 * score, participants) and maps it to points.
 *
 * Tiebreaker when two players have the same number of
 * wins: head-to-head. When that is also a draw, the
 * player with the better legs-won-difference ranks
 * higher. We keep the rules small on purpose — the
 * wider app is the place for per-league overrides.
 */
import { computePoints, bracketSizeFor } from './points.js';

/**
 * Public entry point.
 *
 * @param {{ competition: any, matches: any[], scoring?: any }} opts
 * @returns {Array<{ playerName: string, wins: number, losses: number, played: number, placement: number, points: number, bonuses: number, total: number }>}
 */
export function computeStandings(/** @type {{ competition: any, matches: any[], scoring?: any }} */ opts) {
	const competition = opts?.competition;
	const matches = Array.isArray(opts?.matches) ? opts.matches : [];
	if (!competition) return [];
	const scoring = opts?.scoring || competition.scoring || null;
	const playerNames = collectPlayers(competition, matches);
	const stats = new Map();
	for (const name of playerNames) {
		stats.set(name, { playerName: name, wins: 0, losses: 0, played: 0, legsFor: 0, legsAgainst: 0, points: 0, bonuses: 0, total: 0 });
	}
	// Walk every match. We treat the match winner as
	// "p1" / "p2" (or the rendered side "A" / "B") and
	// accumulate wins / losses and legs.
	for (const m of matches) {
		const p1 = m.p1;
		const p2 = m.p2;
		if (!p1 || !p2) continue; // bye or undecided
		if (m.winner !== 'p1' && m.winner !== 'p2') continue; // not finished
		const winner = m.winner === 'p1' ? p1 : p2;
		const loser = m.winner === 'p1' ? p2 : p1;
		incr(stats, winner, { wins: 1, played: 1, legsFor: extractLegs(m, m.winner), legsAgainst: extractLegs(m, m.winner === 'p1' ? 'p2' : 'p1') });
		incr(stats, loser, { losses: 1, played: 1, legsFor: extractLegs(m, m.winner === 'p1' ? 'p2' : 'p1'), legsAgainst: extractLegs(m, m.winner) });
	}
	const arr = Array.from(stats.values());
	// Sort by wins (desc), then by leg diff (desc), then
	// alphabetically for a stable order.
	arr.sort((a, b) => {
		if (b.wins !== a.wins) return b.wins - a.wins;
		const ad = a.legsFor - a.legsAgainst;
		const bd = b.legsFor - b.legsAgainst;
		if (bd !== ad) return bd - ad;
		return a.playerName.localeCompare(b.playerName);
	});
	// Compute placement + points. Placement 1 = best.
	const bracketIdx = bracketSizeFor(playerNames.length);
	for (let i = 0; i < arr.length; i++) {
		const s = arr[i];
		s.placement = i + 1;
		s.points = scoring ? computePoints({ placement: s.placement, bracketSizeIdx: bracketIdx, table: scoring.pointsTable }) : 0;
		s.total = s.points + s.bonuses;
	}
	return arr;
}

function collectPlayers(/** @type {any} */ competition, /** @type {any[]} */ matches) {
	const fromCompetition = Array.isArray(competition?.players) ? competition.players : [];
	const fromMatches = new Set();
	for (const m of matches) {
		if (m?.p1) fromMatches.add(m.p1);
		if (m?.p2) fromMatches.add(m.p2);
	}
	// Order: competition.players first, then anyone who
	// showed up in a match (covers renames + late adds).
	const out = [];
	const seen = new Set();
	for (const p of fromCompetition) {
		if (typeof p !== 'string' || !p || seen.has(p)) continue;
		seen.add(p);
		out.push(p);
	}
	for (const p of fromMatches) {
		if (!p || seen.has(p)) continue;
		seen.add(p);
		out.push(p);
	}
	return out;
}

function incr(/** @type {Map<string, any>} */ map, /** @type {string} */ key, /** @type {any} */ patch) {
	const cur = map.get(key);
	if (!cur) return;
	for (const k of Object.keys(patch)) cur[k] += patch[k];
}

function extractLegs(/** @type {any} */ match, /** @type {'p1' | 'p2'} */ side) {
	const s = match?.score;
	if (!s) return 0;
	const n = side === 'p1' ? s.p1 : s.p2;
	return Number.isFinite(n) ? n : 0;
}
