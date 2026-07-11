<script>
	/**
	 * League scoring editor. Renders the points table
	 * (placement × bracket size) and the bonus block
	 * (180 + high checkout) as editable number inputs.
	 * The parent binds `competition` and we mutate the
	 * `scoring` field in place; the engine itself stays
	 * the source of truth for everything else.
	 */
	import { freshScoring, restoreDefaults, BRACKET_SIZES, POINTS_TABLE_DEFAULT, BONUS_DEFAULT } from '$lib/scoring/points.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';

	let { scoring = $bindable(/** @type {any} */ (null)), league = true } = $props();

	// Lazy init: if the parent has no scoring block yet,
	// seed it with the defaults on first render.
	$effect(() => {
		if (league && !scoring) {
			scoring = freshScoring();
		}
	});

	function resetDefaults() {
		scoring = restoreDefaults(scoring);
	}

	function setCell(/** @type {number} */ rowIdx, /** @type {number} */ colIdx, /** @type {string|number} */ value) {
		if (!scoring) return;
		const v = Math.max(0, Math.floor(Number(value) || 0));
		scoring.pointsTable[rowIdx].points[colIdx] = v;
		// Trigger reactivity by re-assigning the table array.
		scoring.pointsTable = scoring.pointsTable.map((r) => ({ placement: r.placement, points: [...r.points] }));
	}

	function setBonus(/** @type {string} */ key, /** @type {string|number} */ value) {
		if (!scoring) return;
		const v = Math.max(0, Math.floor(Number(value) || 0));
		scoring.bonus = { ...scoring.bonus, [key]: v };
	}
</script>

{#if league && scoring}
	<section class="scoring">
		<header>
			<h3>
				Points table
				<HelpIcon topic="Points table" body="The points table decides how many points each placement earns. There are four columns — pick the column that matches your player count. All cells are editable so you can tune the table per league." />
			</h3>
			<button class="btn ghost small" type="button" onclick={resetDefaults}>Restore defaults</button>
		</header>

		<div class="table-wrap">
			<table class="points">
				<thead>
					<tr>
						<th scope="col">Placement</th>
						{#each BRACKET_SIZES as b (b.idx)}
							<th scope="col">{b.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each scoring.pointsTable as row, rowIdx (row.placement)}
						<tr>
							<th scope="row">{row.placement}</th>
							{#each BRACKET_SIZES as b, colIdx (b.idx)}
								<td>
									<input
										type="number"
										min="0"
										step="1"
										value={row.points[colIdx] ?? 0}
										oninput={(e) => setCell(rowIdx, colIdx, /** @type {HTMLInputElement} */ (e.currentTarget).value)}
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<header>
			<h3>
				Bonus points
				<HelpIcon topic="Bonus points" body="Bonus points are added to a player's total for exceptional throws. The default awards 2 points for a 180 (or a 171) and 2 points for any checkout of 100 or more. Edit the values to match your league's rules." />
			</h3>
		</header>
		<div class="bonus">
			<label>
				<span>180 / 171</span>
				<input
					type="number"
					min="0"
					step="1"
					value={scoring.bonus?.max180 ?? BONUS_DEFAULT.max180}
					oninput={(e) => setBonus('max180', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
				/>
			</label>
			<label>
				<span>High checkout (≥ <input type="number" min="0" step="1" class="inline" value={scoring.bonus?.highCheckoutMin ?? BONUS_DEFAULT.highCheckoutMin} oninput={(e) => setBonus('highCheckoutMin', /** @type {HTMLInputElement} */ (e.currentTarget).value)} />)</span>
				<input
					type="number"
					min="0"
					step="1"
					value={scoring.bonus?.highCheckout ?? BONUS_DEFAULT.highCheckout}
					oninput={(e) => setBonus('highCheckout', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
				/>
			</label>
		</div>
	</section>
{/if}

<style>
	.scoring { border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-md); margin-top: var(--space-md); }
	header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); margin: 0 0 var(--space-sm); }
	header h3 { margin: 0; font-size: var(--text-md); }
	.table-wrap { overflow-x: auto; }
	table.points { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
	table.points th, table.points td { border: 1px solid var(--line); padding: 6px 8px; text-align: center; }
	table.points thead th { background: var(--surface); font-weight: 600; }
	table.points tbody th { background: var(--surface); text-align: left; font-weight: 500; }
	table.points input { width: 5em; padding: 4px 6px; font: inherit; text-align: center; }
	.bonus { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-md); }
	.bonus label { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-sm); }
	.bonus input { font: inherit; padding: 6px 8px; }
	.bonus .inline { width: 4em; padding: 2px 4px; }
	.btn.small { font-size: var(--text-sm); padding: 4px 8px; }
</style>
