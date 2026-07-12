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

/**
 * League standings — roll up the placement points from
 * every round (child tournament) into one table. Each
 * `round` argument looks like:
 *   { name, roundNumber, matches: [...], scoring }
 * We compute per-round placement points (using the
 * round's own scoring block, falling back to the
 * league's) and then sum across rounds.
 */
export function computeLeagueStandings(/** @type {any} */ opts) {
	const { league, rounds = [], scoring = null } = opts || {};
	/** @type {Map<string, any>} */
	const totals = new Map();
	function ensure(/** @type {string} */ name) {
		if (!totals.has(name)) {
			totals.set(name, {
				playerName: name,
				wins: 0,
				losses: 0,
				played: 0,
				legsFor: 0,
				legsAgainst: 0,
				placement: 0, // best placement across rounds
				points: 0,
				bonuses: 0,
				total: 0,
				roundsPlayed: 0
			});
		}
		return totals.get(name);
	}
	for (const round of rounds) {
		const matches = Array.isArray(round?.matches) ? round.matches : [];
		if (matches.length === 0) continue;
		const perRound = computeStandings({
			competition: { players: collectPlayersFromMatches(matches), type: 'single' },
			matches,
			scoring: round?.scoring || scoring
		});
		for (const row of perRound) {
			const acc = ensure(row.playerName);
			acc.wins += row.wins;
			acc.losses += row.losses;
			acc.played += row.played;
			acc.legsFor += row.legsFor;
			acc.legsAgainst += row.legsAgainst;
			acc.points += row.points;
			acc.bonuses += row.bonuses;
			acc.total += row.total;
			acc.roundsPlayed += 1;
			// Best placement across rounds (lower = better)
			if (!acc.placement || row.placement < acc.placement) {
				acc.placement = row.placement;
			}
		}
	}
	// Sort: most points first, then by leg diff, then alpha.
	const out = Array.from(totals.values()).sort((a, b) => {
		if (b.total !== a.total) return b.total - a.total;
		const da = a.legsFor - a.legsAgainst;
		const db = b.legsFor - b.legsAgainst;
		if (db !== da) return db - da;
		return a.playerName.localeCompare(b.playerName);
	});
	// Re-assign placement 1..N at the league level (not the
	// round level — best total gets 1.).
	for (let i = 0; i < out.length; i++) out[i].placement = i + 1;
	return out;
}

function collectPlayersFromMatches(/** @type {any[]} */ matches) {
	const set = new Set();
	for (const m of matches) {
		if (m?.p1) set.add(m.p1);
		if (m?.p2) set.add(m.p2);
	}
	return Array.from(set);
}
