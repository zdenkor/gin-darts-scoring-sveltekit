<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { getCompetition, listMatches, updateMatch } from '$lib/db/competitions.js';
	import { completeMatch } from '$lib/competition/engine.js';

	let competition = $state(/** @type {any} */ (null));
	let matches = $state(/** @type {any[]} */ ([]));
	let loading = $state(true);
	let error = $state('');

	// The id is a string (we used `comp-${Date.now()}-${rand}` in
	// the create form). Pull it from the page store.
	const compId = $derived(/** @type {string} */ ($page.params.id));

	onMount(async () => {
		loading = true;
		try {
			competition = await getCompetition(compId);
			if (!competition) {
				error = `Competition ${compId} not found.`;
			} else {
				matches = await listMatches(compId);
			}
		} catch (e) {
			error = String(e?.message || e);
		} finally {
			loading = false;
		}
	});

	function back() {
		goto(`${base}/competitions`);
	}

	function formatLabel(s) {
		return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	function cap(s) {
		return s ? s[0].toUpperCase() + s.slice(1) : s;
	}

	// Build the URL the Play button navigates to. Mirrors what
	// vanilla renderSingleMatch / renderTeamGame passed to
	// router.go('game', {...}) — start score, in/out, legs to win,
	// player names, plus matchMode + matchId so the engine knows
	// this is a competition match and the result is recorded back
	// into the right place.
	function playUrl(m) {
		const gameOpts = competition.gameOpts || {};
		const start = gameOpts.start || 501;
		const inRule = gameOpts.in || 'single';
		const outRule = gameOpts.out || 'double';
		const legsToWin = m.legsToWin || competition.legsToWin || 1;
		const setsToWin = m.setsToWin || competition.setsToWin || gameOpts.setsToWin || 1;
		const p1 = m.p1 || 'Player 1';
		const p2 = m.p2 || 'Player 2';
		const params = new URLSearchParams({
			names: `${p1},${p2}`,
			start: String(start),
			in: inRule,
			out: outRule,
			legs: String(legsToWin),
			sets: String(setsToWin),
			matchMode: 'true',
			matchId: String(m.id),
			competitionId: String(competition.id),
			competitionName: competition.name || '',
			competitionType: competition.type || 'league'
		});
		return `${base}/game/?${params.toString()}`;
	}

	function statusLabel(m) {
		if (m.status === 'complete') {
			const winner = m.winner === 'p1' ? m.p1 : m.winner === 'p2' ? m.p2 : '?';
			return `${winner} won`;
		}
		return m.status || 'pending';
	}

	function statusClass(m) {
		if (m.status === 'complete') return 'status complete';
		if (m.status === 'ready') return 'status ready';
		return 'status pending';
	}

	// Group matches by team pair for team games (vanilla did the
	// same with `${m.teamA}-${m.teamB}` keys). Non-team games just
	// fall through to a single group.
	function groupedMatches() {
		if (competition?.type !== 'team') {
			return [{ key: 'all', label: 'Matches', list: matches }];
		}
		const map = /** @type {Record<string, any[]>} */ ({});
		for (const m of matches) {
			const k = `${m.teamA ?? '?'}-${m.teamB ?? '?'}`;
			(map[k] ||= []).push(m);
		}
		return Object.entries(map).map(([k, list]) => {
			const [a, b] = k.split('-');
			return {
				key: k,
				label: `Team ${+a + 1} vs Team ${+b + 1}`,
				list
			};
		});
	}

	async function markWinner(m, key) {
		// Manual override — flip the match to complete with the
		// chosen winner. The engine's completeMatch() handles
		// promotion of the winner to the next round in single/double
		// elimination, but for now the user can drive the bracket
		// from the UI without running the game.
		const next = completeMatch(matches, m.id, key);
		await updateMatch(next);
		matches = await listMatches(compId);
	}
</script>

<div class="screen">
	<div class="card">
		<div class="card-header">
			<h1>{competition?.name || 'Competition'}</h1>
			<button class="btn ghost" onclick={back}>Back</button>
		</div>

		{#if loading}
			<p class="muted">Loading competition…</p>
		{:else if error}
			<p class="error">{error}</p>
		{:else if competition}
			<div class="meta">
				<span class="badge">{formatLabel(competition.type)}</span>
				{#if competition.format}<span class="badge">{formatLabel(competition.format)}</span>{/if}
				{#if competition.participantFormat && competition.participantFormat !== 'singles'}
					<span class="badge">{formatLabel(competition.participantFormat)}</span>
				{/if}
				{#if competition.season}<span class="badge muted">Season {competition.season}</span>{/if}
				<span class="status-line">
					<strong>Status:</strong>
					<span class="status" style:color={
						competition.status === 'active' ? 'var(--accent)' :
						competition.status === 'upcoming' ? 'var(--warn, #e8b923)' :
						'var(--muted)'
					}>{competition.status}</span>
				</span>
			</div>

			{#if competition.notes}
				<p class="notes">{competition.notes}</p>
			{/if}

			<section class="rule">
				<h2>Rules</h2>
				<div class="rule-grid">
					<div><span class="rule-label">Mode</span><span>{cap(competition.gameMode || 'x01')}</span></div>
					<div><span class="rule-label">Start</span><span>{competition.gameOpts?.start || '—'}</span></div>
					<div><span class="rule-label">In</span><span>{(competition.gameOpts?.in || 'single').toUpperCase()}</span></div>
					<div><span class="rule-label">Out</span><span>{(competition.gameOpts?.out || 'double').toUpperCase()}</span></div>
					<div><span class="rule-label">Legs to win</span><span>{competition.legsToWin || 1}</span></div>
					<div><span class="rule-label">Sets to win</span><span>{competition.setsToWin || 1}</span></div>
				</div>
			</section>

			<section class="rule">
				<h2>Players ({competition.players.length})</h2>
				<div class="players">
					{#each competition.players as p, i (p)}
						<span class="player-chip">{p}</span>
					{/each}
				</div>
			</section>

			{#if competition.type === 'team' && competition.teams}
				<section class="rule">
					<h2>Teams</h2>
					<div class="teams">
						{#each competition.teams as members, i (i)}
							<div class="team-cell">
								<div class="muted small">Team {i + 1}</div>
								{#each members as pid (pid)}
									<div>{pid}</div>
								{/each}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<section class="rule">
				<h2>Matches ({matches.length})</h2>
				{#if matches.length === 0}
					<p class="muted">No matches in this competition yet.</p>
				{:else}
					{#each groupedMatches() as group (group.key)}
						{#if group.label !== 'Matches'}
							<div class="muted small group-head">{group.label}</div>
						{/if}
						<div class="match-list">
							{#each group.list as m (m.id)}
								<div class="match-row">
									<div class="match-info">
										{#if m.round != null}<span class="muted small">R{m.round}</span>{/if}
										<span class="pname">{m.p1}</span>
										<span class="muted">vs</span>
										<span class="pname">{m.p2}</span>
									</div>
									<div class="match-actions">
										<span class={statusClass(m)}>{statusLabel(m)}</span>
										{#if m.status !== 'complete'}
											<a class="btn primary" href={playUrl(m)}>Play</a>
											<button class="btn ghost" type="button" onclick={() => markWinner(m, 'p1')}>P1 wins</button>
											<button class="btn ghost" type="button" onclick={() => markWinner(m, 'p2')}>P2 wins</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/each}
				{/if}
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
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		align-items: center;
		margin-bottom: var(--space-sm);
	}
	.badge {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--text);
		padding: 2px 8px;
		border-radius: 6px;
		font-size: var(--text-xs);
	}
	.badge.muted { background: var(--surface); color: var(--muted); }
	.status-line { font-size: var(--text-sm); margin-left: var(--space-sm); }
	.status { font-weight: 700; }
	.notes {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm) var(--space-md);
		margin-bottom: var(--space-md);
		color: var(--muted);
	}
	.rule { margin-bottom: var(--space-lg); }
	.rule h2 {
		font-size: var(--text-md);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		margin: 0 0 var(--space-sm);
	}
	.rule-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--space-sm);
	}
	.rule-grid > div {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rule-label {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.players {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
	}
	.player-chip {
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		color: var(--text);
		padding: 4px 10px;
		border-radius: 999px;
		font-size: var(--text-sm);
	}
	.teams {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--space-sm);
	}
	.team-cell {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm) var(--space-md);
	}
	.group-head { margin: var(--space-sm) 0 4px; }
	.match-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.match-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm) var(--space-md);
	}
	.match-info { display: flex; gap: var(--space-sm); align-items: center; flex: 1; }
	.pname { font-weight: 700; }
	.match-actions { display: flex; gap: var(--space-xs); align-items: center; }
	.status.complete { color: var(--accent); font-weight: 700; }
	.status.ready { color: var(--warn, #e8b923); }
	.status.pending { color: var(--muted); }
	.error { color: var(--danger, #ff6b6b); font-weight: 700; }
	.muted { color: var(--muted); }
	.small { font-size: var(--text-xs); }
	@media (max-width: 40rem) {
		.match-row { flex-direction: column; align-items: stretch; }
		.match-actions { justify-content: space-between; }
	}
</style>
