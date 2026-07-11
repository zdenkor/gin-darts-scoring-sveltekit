<script>
	/**
	 * League round editor. Used inside the Competition
	 * edit view (and the parent competition page) to
	 * maintain the list of rounds. Each round is a
	 * self-contained sub-tournament with its own date,
	 * location and status. The editor talks to the
	 * round helpers in $lib/db/competitions.js — it
	 * does not touch the engine or the bracket logic.
	 */
	import { createRound, updateRound, deleteRound } from '$lib/db/competitions.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';

	let { competition = $bindable(/** @type {any} */ (null)) } = $props();

	let busy = $state(false);
	let newDate = $state(/** @type {string} */ (''));
	let newLocation = $state(/** @type {string} */ (''));

	async function addRound() {
		if (!competition?.id) return;
		busy = true;
		try {
			const r = await createRound(competition.id, {
				date: newDate,
				location: newLocation,
				roundNumber: (competition.rounds?.length || 0) + 1
			});
			if (r) {
				competition.rounds = [...(competition.rounds || []), r];
				newDate = '';
				newLocation = '';
			}
		} finally {
			busy = false;
		}
	}

	async function patchRound(/** @type {string} */ roundId, /** @type {any} */ patch) {
		if (!competition?.id) return;
		busy = true;
		try {
			const r = await updateRound(competition.id, roundId, patch);
			if (r) {
				const idx = (competition.rounds || []).findIndex((/** @type {any} */ x) => x.id === roundId);
				if (idx >= 0) {
					competition.rounds = competition.rounds.map((/** @type {any} */ x, /** @type {number} */ i) => (i === idx ? r : x));
				}
			}
		} finally {
			busy = false;
		}
	}

	async function removeRound(/** @type {string} */ roundId) {
		if (!competition?.id) return;
		busy = true;
		try {
			const next = await deleteRound(competition.id, roundId);
			if (next) competition.rounds = next;
		} finally {
			busy = false;
		}
	}
</script>

{#if competition?.type === 'league'}
	<section class="rounds">
		<header>
			<h3>Rounds<HelpIcon topic="League rounds" body="Each round is a self-contained sub-tournament. The round name defaults to (league name) - kolo (n) but you can rename it. Round results are recorded in NOSTR / Google Drive as separate tournament events so the calendar shows them as individual tournaments." /></h3>
		</header>

		{#if (competition.rounds || []).length === 0}
			<p class="muted">No rounds yet. Add the first round below — it will appear on the calendar immediately.</p>
		{:else}
			<ul class="round-list">
				{#each competition.rounds as r (r.id)}
					<li>
						<div class="row">
							<label>
								<span>Name</span>
								<input
									type="text"
									value={r.name || ''}
									disabled={busy}
									onchange={(e) => patchRound(r.id, { name: /** @type {HTMLInputElement} */ (e.currentTarget).value })}
								/>
							</label>
							<label>
								<span>Date</span>
								<input
									type="date"
									value={r.date || ''}
									disabled={busy}
									onchange={(e) => patchRound(r.id, { date: /** @type {HTMLInputElement} */ (e.currentTarget).value })}
								/>
							</label>
							<label>
								<span>Location</span>
								<input
									type="text"
									value={r.location || ''}
									disabled={busy}
									onchange={(e) => patchRound(r.id, { location: /** @type {HTMLInputElement} */ (e.currentTarget).value })}
								/>
							</label>
							<button class="btn ghost small" type="button" disabled={busy} onclick={() => removeRound(r.id)}>Delete</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="add">
			<label>
				<span>New round date</span>
				<input type="date" bind:value={newDate} disabled={busy} />
			</label>
			<label>
				<span>New round location</span>
				<input type="text" bind:value={newLocation} placeholder="(defaults to league location)" disabled={busy} />
			</label>
			<button class="btn primary" type="button" disabled={busy} onclick={addRound}>Add round</button>
		</div>
	</section>
{/if}

<style>
	.rounds { border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-md); margin-top: var(--space-md); }
	header h3 { margin: 0 0 var(--space-sm); font-size: var(--text-md); }
	.round-list { list-style: none; padding: 0; margin: 0 0 var(--space-md); display: flex; flex-direction: column; gap: var(--space-sm); }
	.round-list .row { display: grid; grid-template-columns: 2fr 1fr 2fr auto; gap: var(--space-sm); align-items: end; }
	.add { display: grid; grid-template-columns: 1fr 2fr auto; gap: var(--space-sm); align-items: end; padding-top: var(--space-sm); border-top: 1px dashed var(--line); }
	.add .btn { align-self: end; }
	.btn.small { font-size: var(--text-sm); padding: 4px 8px; }
	.field, label { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-sm); }
	@media (max-width: 640px) {
		.round-list .row, .add { grid-template-columns: 1fr; }
	}
</style>
