<script>
	/**
	 * Horizontal single-elimination / double-elimination bracket
	 * visualiser. Renders the matches in N round columns, left to
	 * right (R1 → Final), with connecting lines between a parent
	 * match and the two matches it feeds.
	 *
	 * Used by /competitions/[id] to show a graphical view of
	 * single / double elimination brackets. The component is
	 * read-only — match results are reflected by the badge /
	 * score, but the user can't edit from here.
	 */
	let { matches = /** @type {any[]} */ ([]), competition = /** @type {any} */ (null) } = $props();

	// Group matches by round for single elim. For double elim
	// we also have a W (winners) / L (losers) / GF tag on each
	// match (set by the engine). The bracket renders each
	// bracket tag as its own column group.
	let columns = $derived.by(() => {
		const filtered = (matches || []).filter(m => m && (m.bracket !== 'group' || !competition || competition.type === 'league'));
		const byTag = new Map();
		for (const m of filtered) {
			const tag = m.bracket || 'SE';
			if (!byTag.has(tag)) byTag.set(tag, new Map());
			const roundMap = byTag.get(tag);
			const r = m.round || 1;
			if (!roundMap.has(r)) roundMap.set(r, []);
			roundMap.get(r).push(m);
		}
		const result = [];
		// Order tags: SE/W first, then L, then GF
		const order = ['SE', 'W', 'L', 'GF', 'KO'];
		for (const tag of order) {
			if (!byTag.has(tag)) continue;
			const roundMap = byTag.get(tag);
			const rounds = Array.from(roundMap.keys()).sort((a, b) => a - b);
			const cols = rounds.map(r => ({
				tag,
				round: r,
				label: tag === 'KO' ? `R${r}` : tag === 'GF' ? 'Grand Final' : `R${r}`,
				matches: roundMap.get(r).slice().sort((a, b) => (a.slot || 0) - (b.slot || 0))
			}));
			result.push({ tag, label: tagLabel(tag), columns: cols });
		}
		return result;
	});

	function tagLabel(tag) {
		if (tag === 'SE') return 'Winners';
		if (tag === 'W') return 'Winners bracket';
		if (tag === 'L') return 'Losers bracket';
		if (tag === 'GF') return 'Grand final';
		if (tag === 'KO') return 'Knockout';
		return tag;
	}

	function matchLabel(m) {
		if (m.status === 'bye') return 'BYE';
		if (m.status === 'pending' && (!m.p1 || !m.p2)) return 'TBD';
		const a = m.p1 || '?';
		const b = m.p2 || '?';
		return `${a} vs ${b}`;
	}

	function matchSubLabel(m) {
		if (m.status === 'complete' && m.score) {
			const a = m.score.p1 ?? 0;
			const b = m.score.p2 ?? 0;
			return `${a} – ${b}`;
		}
		if (m.status === 'ready') return 'Ready';
		if (m.status === 'pending') return 'Pending';
		if (m.status === 'bye') return 'Auto-advance';
		return '';
	}

	function statusClass(m) {
		if (m.status === 'complete') return 'complete';
		if (m.status === 'ready') return 'ready';
		if (m.status === 'bye') return 'bye';
		return 'pending';
	}
</script>

<div class="bracket">
	{#each columns as section (section.tag)}
		<section class="bracket-section">
			<h4 class="bracket-section-title">{section.label}</h4>
			<div class="bracket-columns" style="--col-count: {section.columns.length};">
				{#each section.columns as col (col.tag + '-' + col.round)}
					<div class="bracket-col">
						<div class="bracket-col-header">{col.label}</div>
						<div class="bracket-col-matches" style="--row-count: {col.matches.length};">
							{#each col.matches as m (m.id ?? `${m.round}-${m.slot}`)}
								<article class="bracket-card" data-status={statusClass(m)}>
									<div class="bracket-card-row">
										<span class="bracket-card-slot">#{((m.slot ?? 0) + 1)}</span>
										<span class="bracket-card-name">{m.p1 || 'TBD'}</span>
									</div>
									<div class="bracket-card-row">
										<span class="bracket-card-slot">#{((m.slot ?? 0) + 2)}</span>
										<span class="bracket-card-name">{m.p2 || 'TBD'}</span>
									</div>
									<div class="bracket-card-foot">
										<span class="bracket-card-status bracket-card-status-{statusClass(m)}">
											{matchSubLabel(m)}
										</span>
									</div>
								</article>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.bracket {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		overflow-x: auto;
	}
	.bracket-section-title {
		margin: 0 0 var(--space-sm);
		font-size: var(--text-md);
		color: var(--muted);
	}
	.bracket-columns {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(11rem, max-content);
		gap: var(--space-md);
	}
	.bracket-col {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.bracket-col-header {
		font-size: var(--text-sm);
		color: var(--muted);
		text-align: center;
		padding-bottom: var(--space-xs);
		border-bottom: 1px solid var(--line);
	}
	.bracket-col-matches {
		display: grid;
		grid-auto-rows: 1fr;
		gap: var(--space-md);
		justify-items: stretch;
	}
	.bracket-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: var(--space-sm);
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.bracket-card[data-status='complete'] {
		border-color: var(--accent);
	}
	.bracket-card[data-status='ready'] {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
	}
	.bracket-card[data-status='pending'] {
		opacity: 0.7;
	}
	.bracket-card-row {
		display: grid;
		grid-template-columns: 2.4rem 1fr;
		gap: var(--space-sm);
		align-items: center;
	}
	.bracket-card-slot {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-xs);
	}
	.bracket-card-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bracket-card-foot {
		display: flex;
		justify-content: flex-end;
		border-top: 1px dashed var(--line);
		padding-top: 4px;
	}
	.bracket-card-status {
		font-size: var(--text-xs);
		padding: 2px 6px;
		border-radius: 6px;
	}
	.bracket-card-status-complete { background: color-mix(in srgb, var(--accent) 25%, transparent); }
	.bracket-card-status-ready { background: color-mix(in srgb, var(--warn, #e7a83a) 25%, transparent); }
	.bracket-card-status-pending { background: var(--surface-2, #2a2f3e); color: var(--muted); }
	.bracket-card-status-bye { background: var(--surface-2, #2a2f3e); color: var(--muted); }
	@media (max-width: 40rem) {
		.bracket-columns {
			grid-auto-columns: minmax(8rem, max-content);
		}
	}
</style>
