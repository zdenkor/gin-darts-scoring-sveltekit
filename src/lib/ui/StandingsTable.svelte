<script>
	/**
	 * Read-only league standings table. Sits next to
	 * the bracket / match list on the competition
	 * detail page. Computes standings from the matches
	 * the engine already produced; no engine touches.
	 */
	import { computeStandings } from '$lib/scoring/standings.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';

	/**
	 * Read-only league / tournament standings table.
	 * For single competitions the standings come straight
	 * from `matches`. For leagues, `rounds` is an array of
	 * `{ child, matches }` and the table rolls up placement
	 * points from each round (the league's own `matches`
	 * array is empty because the actual matches live on
	 * the child tournaments).
	 */
	let { competition, matches, scoring = null, rounds = null } = $props();

	let standings = $derived(
		Array.isArray(rounds) && rounds.length > 0
			? computeLeagueStandings({ league: competition, rounds, scoring })
			: computeStandings({ competition, matches: matches || [], scoring })
	);
</script>

<section class="standings">
	<header>
		<h3>
			Standings
			<HelpIcon topic="Standings" body="Standings are computed from the matches already played. Wins come first; the leg difference is the tiebreaker. Placement points come from the league's points table; bonus points are reserved for throws already recorded in the match data (e.g. 180s and high checkouts when those are present)." />
		</h3>
	</header>
	{#if standings.length === 0}
		<p class="muted">No matches yet — standings will appear once a match finishes.</p>
	{:else}
		<div class="table-wrap">
			<table class="grid">
				<thead>
					<tr>
						<th scope="col">#</th>
						<th scope="col">Player</th>
						<th scope="col">W</th>
						<th scope="col">L</th>
						<th scope="col">+/-</th>
						<th scope="col">Pts</th>
						<th scope="col">Bonus</th>
						<th scope="col">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each standings as s (s.playerName)}
						<tr>
							<td class="num">{s.placement}</td>
							<td>{s.playerName}</td>
							<td class="num">{s.wins}</td>
							<td class="num">{s.losses}</td>
							<td class="num">{s.legsFor - s.legsAgainst > 0 ? '+' : ''}{s.legsFor - s.legsAgainst}</td>
							<td class="num">{s.points}</td>
							<td class="num">{s.bonuses}</td>
							<td class="num"><strong>{s.total}</strong></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.standings { border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-md); margin-top: var(--space-md); }
	header h3 { margin: 0 0 var(--space-sm); font-size: var(--text-md); }
	.table-wrap { overflow-x: auto; }
	table.grid { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
	table.grid th, table.grid td { border-bottom: 1px solid var(--line); padding: 6px 8px; text-align: left; }
	table.grid th { background: var(--surface); font-weight: 600; }
	table.grid td.num, table.grid th:last-child, table.grid th:nth-child(3), table.grid th:nth-child(4), table.grid th:nth-child(5), table.grid th:nth-child(6), table.grid th:nth-child(7) { text-align: right; font-variant-numeric: tabular-nums; }
</style>
