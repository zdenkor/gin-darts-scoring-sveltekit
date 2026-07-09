<script>
	/**
	 * Horizontal single-elimination / double-elimination bracket
	 * visualiser. Renders the matches in N round columns, left to
	 * right (R1 → Final), with connecting lines between a parent
	 * match and the two matches it feeds.
	 *
	 * Layout:
	 *   - One section per bracket tag (SE / W / L / GF / KO).
	 *   - Inside each section, columns of cards laid out in a
	 *     fixed-row grid (--rows = max number of cards in any
	 *     column of that section). Cards in round > 1 are placed
	 *     in the middle row between their two parent cards, so
	 *     the bracket is visually balanced and the SVG link
	 *     lines meet the card midpoints.
	 *   - An absolutely-positioned <svg> overlay draws the
	 *     connecting path between each parent card and its two
	 *     child cards in the next round.
	 *
	 * Read-only — match results are reflected by the badge /
	 * score, but the user can't edit from here.
	 */
	let { matches = /** @type {any[]} */ ([]), competition = /** @type {any} */ (null) } = $props();

	// Group matches by tag (SE/W/L/GF/KO) and round.
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

	// For each section compute the link lines that connect
	// each parent card (round r) to its two child cards
	// (round r+1). A link is {x1, y1, x2, y2, key} in
	// percentages of the section's overlay box.
	let sectionLinks = $derived.by(() => {
		return columns.map(section => {
			const cols = section.columns;
			if (cols.length < 2) return [];
			// Rows = number of cards in the column with the
			// most cards (the first column for single elim).
			const rows = Math.max(...cols.map(c => c.matches.length));
			// column width % (the parent col is index r, child
			// is index r+1, etc.). cols.length columns share
			// the horizontal space.
			const colWidth = 100 / cols.length;
			const cardW = colWidth * 0.7; // card itself is 70% of column
			const links = [];
			for (let r = 0; r < cols.length - 1; r++) {
				const parentCol = cols[r];
				const childCol = cols[r + 1];
				// Each child slot i in round r+1 is fed by parent
				// slots 2i and 2i+1 in round r (standard bracket).
				for (let ci = 0; ci < childCol.matches.length; ci++) {
					const child = childCol.matches[ci];
					const parentA = parentCol.matches[ci * 2];
					const parentB = parentCol.matches[ci * 2 + 1];
					if (!parentA && !parentB) continue;
					// Center y for child = ((ci + 0.5) / rows) * 100
					// but we offset parents to span (2i, 2i+1) so the
					// midpoint of those two rows is the same as the
					// child's center.
					const yChild = ((ci + 0.5) / rows) * 100;
					const xChild = (r + 1) * colWidth + colWidth / 2 - cardW / 2;
					const xParentRight = r * colWidth + colWidth / 2 + cardW / 2;
					if (parentA) {
						const yParent = (ci * 2 + 0.5) / rows * 100;
						links.push({
							key: `r${r}-a${ci * 2}-c${ci}`,
							x1: xParentRight,
							y1: yParent,
							x2: xChild,
							y2: yChild
						});
					}
					if (parentB) {
						const yParent = (ci * 2 + 1.5) / rows * 100;
						links.push({
							key: `r${r}-b${ci * 2 + 1}-c${ci}`,
							x1: xParentRight,
							y1: yParent,
							x2: xChild,
							y2: yChild
						});
					}
				}
			}
			return links;
		});
	});

	// A match's "row index" inside its column (0-based).
	// For round 1 / SE, matches are placed in their own
	// slots 0..N. For later rounds, the slot is divided by
	// 2 (parent match 0,1 feed child 0; parents 2,3 feed
	// child 1; etc.) so the visual center of the child
	// sits between its two parents.
	function matchRowIndex(m, colIndex) {
		if (colIndex === 0) return m.slot || 0;
		const slot = m.slot || 0;
		const groups = Math.pow(2, colIndex);
		return slot / groups + (groups - 1) / (2 * groups);
	}

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
	{#each columns as section, sectionIndex (section.tag)}
		<section class="bracket-section">
			<h4 class="bracket-section-title">{section.label}</h4>
			<div
				class="bracket-canvas"
				style="--rows: {Math.max(...section.columns.map(c => c.matches.length))}; --cols: {section.columns.length};"
			>
				<div class="bracket-columns">
					{#each section.columns as col, colIndex (col.tag + '-' + col.round)}
						<div class="bracket-col" data-col={colIndex}>
							<div class="bracket-col-header">{col.label}</div>
							<div class="bracket-col-matches">
								{#each col.matches as m (m.id ?? `${m.round}-${m.slot}`)}
									<article
										class="bracket-card"
										data-status={statusClass(m)}
										data-r={m.round}
										data-s={m.slot}
										style="--row: {matchRowIndex(m, colIndex)};"
									>
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
				<svg class="bracket-links" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
					{#each sectionLinks[sectionIndex] ?? [] as link (link.key)}
						<path
							d={`M ${link.x1} ${link.y1} L ${(link.x1 + link.x2) / 2} ${link.y1} L ${(link.x1 + link.x2) / 2} ${link.y2} L ${link.x2} ${link.y2}`}
							fill="none"
							stroke="currentColor"
							stroke-width="0.25"
							stroke-linecap="round"
							vector-effect="non-scaling-stroke"
						/>
					{/each}
				</svg>
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
		padding: var(--space-sm) 0;
	}
	.bracket-section-title {
		margin: 0 0 var(--space-sm);
		font-size: var(--text-md);
		color: var(--muted);
	}
	.bracket-canvas {
		position: relative;
		margin: 0 auto;
		max-width: 100%;
		/* CSS columns are absolutely-positioned cards; the
		   canvas height comes from --rows * 1 cell. We set a
		   base unit and let --rows scale it. */
		--cell-height: 5.5rem;
		min-height: calc(var(--rows) * var(--cell-height));
	}
	.bracket-columns {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: var(--space-lg);
		min-height: calc(var(--rows) * var(--cell-height));
	}
	.bracket-col {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 11rem;
	}
	.bracket-col-header {
		font-size: var(--text-sm);
		color: var(--muted);
		text-align: center;
		padding-bottom: var(--space-xs);
		border-bottom: 1px solid var(--line);
		margin-bottom: var(--space-sm);
	}
	.bracket-col-matches {
		position: relative;
		display: grid;
		grid-template-rows: repeat(var(--rows), var(--cell-height));
		gap: 0;
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
		grid-row: calc(var(--row) + 1);
		/* Subtract a little so the card centres on the row
		   midpoint instead of the top edge. */
		margin: auto 0;
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
	.bracket-links {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		color: var(--muted);
		pointer-events: none;
		z-index: 0;
	}
	.bracket-col-matches .bracket-card { position: relative; z-index: 1; }
	@media (max-width: 40rem) {
		.bracket-col { min-width: 8rem; }
		.bracket-canvas { --cell-height: 4.5rem; }
	}
</style>
