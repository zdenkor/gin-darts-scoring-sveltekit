<script>
	/**
	 * League scheduling tab. Lives between the basic
	 * Setup tab and the Standings tab. Lets the admin
	 * pick a date / location / time for every round.
	 * The default is "weekly after the first round" so
	 * you only have to fill in round 1 — round 2, 3, …
	 * follow at the same time, 7 days apart. The Outlook
	 * repeat picker offers "every 2 weeks", "monthly", and
	 * a custom interval in days.
	 * Parent binds `rounds` so the change is reflected
	 * back into the league's per-round `rounds[]` array.
	 */
	let { rounds = $bindable(/** @type {any[]} */ ([])), leagueName = 'League', season = '' } = $props();

	// Outlook-style repeat interval. Applied from round 1.
	let repeatEvery = $state(7); // 7 = weekly, 14 = bi-weekly, 30 = monthly
	let repeatUnit = $state('days'); // 'days' | 'weeks' | 'months'

	/** @returns {string} ISO YYYY-MM-DD given a base date and offset (days). */
	function offsetDate(/** @type {string} */ base, /** @type {number} */ days) {
		if (!base) return '';
		const d = new Date(base);
		if (Number.isNaN(d.getTime())) return '';
		d.setDate(d.getDate() + days);
		return d.toISOString().slice(0, 10);
	}

	/**
	 * Push the current `repeatEvery` + `repeatUnit`
	 * down the rounds[] list, deriving every round from
	 * round 1's date. Time is preserved; location is
	 * preserved; only the date moves.
	 */
	function autoFillRounds() {
		if (rounds.length < 2) return;
		const first = rounds[0];
		const baseDate = first?.date;
		if (!baseDate) return;
		const stepDays = repeatUnit === 'weeks'
			? repeatEvery * 7
			: repeatUnit === 'months'
				? repeatEvery * 30
				: repeatEvery;
		for (let i = 1; i < rounds.length; i++) {
			rounds[i].date = offsetDate(baseDate, stepDays * i);
			rounds[i].time = first.time || '';
			rounds[i].location = first.location || '';
		}
	}
</script>

<div class="rounds-scheduler">
	<div class="repeat-bar">
		<label class="field">
			<span>Repeat</span>
			<select bind:value={repeatUnit}>
				<option value="days">Days</option>
				<option value="weeks">Weeks</option>
				<option value="months">Months</option>
			</select>
		</label>
		<label class="field">
			<span>Every</span>
			<input type="number" min="1" max="52" bind:value={repeatEvery} />
		</label>
		<button type="button" class="btn primary" onclick={autoFillRounds}>
			Apply to all rounds
		</button>
	</div>

	<p class="muted small">
		Fill in round 1 below, then "Apply to all rounds" to copy its date / time / location
		onto the others with the selected interval. You can still tweak any round after.
	</p>

	<ol class="rounds-list">
		{#each rounds as r, i (r.id)}
			<li class="round-row">
				<div class="round-num">{i + 1}.</div>
				<label class="field">
					<span>Name</span>
					<input
						type="text"
						bind:value={r.name}
						placeholder="{leagueName} {season} kolo {i + 1}"
					/>
				</label>
				<label class="field">
					<span>Date</span>
					<input type="date" bind:value={r.date} />
				</label>
				<label class="field">
					<span>Time</span>
					<input type="time" bind:value={r.time} />
				</label>
				<label class="field">
					<span>Location</span>
					<input type="text" bind:value={r.location} placeholder="Nitra, pub Centrum" />
				</label>
			</li>
		{/each}
	</ol>
</div>

<style>
	.rounds-scheduler { display: flex; flex-direction: column; gap: var(--space-md); }
	.repeat-bar {
		display: flex; flex-wrap: wrap; gap: var(--space-sm); align-items: flex-end;
	}
	.repeat-bar .field { display: flex; flex-direction: column; gap: 4px; min-width: 7em; }
	.small { font-size: 0.85em; }
	.rounds-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
	.round-row {
		display: grid;
		grid-template-columns: 2em 1fr;
		gap: var(--space-sm);
		padding: var(--space-sm);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface-2, #11161f);
	}
	.round-row .field { display: flex; flex-direction: column; gap: 4px; }
	.round-row .field:nth-child(2),
	.round-row .field:nth-child(3),
	.round-row .field:nth-child(4),
	.round-row .field:nth-child(5) {
		grid-column: 2;
	}
	.round-num { font-weight: 700; color: var(--accent); align-self: center; }
	@media (min-width: 720px) {
		.round-row {
			grid-template-columns: 2em 2fr 1fr 1fr 2fr;
		}
		.round-row .field:nth-child(2) { grid-column: 2; }
		.round-row .field:nth-child(3) { grid-column: 3; }
		.round-row .field:nth-child(4) { grid-column: 4; }
		.round-row .field:nth-child(5) { grid-column: 5; }
	}
</style>
