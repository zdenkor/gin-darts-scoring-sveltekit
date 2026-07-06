<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { listCompetitions, createCompetition, deleteCompetition, seedCompetitionsIfEmpty } from '$lib/db/competitions.js';

	let competitions = $state([]);
	let loading = $state(true);
	let formOpen = $state(false);
	let newName = $state('');
	let newType = $state('league');

	async function refresh() {
		loading = true;
		await seedCompetitionsIfEmpty();
		competitions = await listCompetitions();
		loading = false;
	}

	onMount(refresh);

	function back() {
		goto(`${base}/`);
	}

	function addPlayers() {
		const count = Number(prompt('How many players?', '2')) || 0;
		const players = [];
		for (let i = 1; i <= count; i++) {
			players.push(`Player ${i}`);
		}
		return players;
	}

	async function create() {
		if (!newName.trim()) return;
		const players = addPlayers();
		await createCompetition({ name: newName.trim(), type: newType, players });
		newName = '';
		formOpen = false;
		await refresh();
	}

	async function remove(id, name) {
		if (!confirm(`Delete competition "${name}"?`)) return;
		await deleteCompetition(id);
		await refresh();
	}

	function badgeColor(status) {
		if (status === 'active') return 'var(--accent)';
		if (status === 'upcoming') return 'var(--warn, #e8b923)';
		return 'var(--muted)';
	}
</script>

<div class="screen">
	<div class="card">
		<div class="card-header">
			<h1>Competitions</h1>
			<button class="btn ghost" onclick={back}>Back</button>
		</div>

		{#if loading}
			<p class="muted">Loading competitions…</p>
		{:else if competitions.length === 0}
			<p class="muted">No competitions yet.</p>
		{:else}
			<div class="list">
				{#each competitions as c}
					<div class="competition-row">
						<div class="info">
							<strong>{c.name}</strong>
							<span class="meta">{c.type} • {c.players.length} players • <span class="status" style:color={badgeColor(c.status)}>{c.status}</span></span>
						</div>
						<button class="btn ghost danger" onclick={() => remove(c.id, c.name)}>Delete</button>
					</div>
				{/each}
			</div>
		{/if}

		<button class="btn primary" onclick={() => formOpen = true}>Create competition</button>

		{#if formOpen}
			<div class="form">
				<label class="field">
					<span>Name</span>
					<input type="text" bind:value={newName} placeholder="League or tournament name" />
				</label>
				<label class="field">
					<span>Type</span>
					<select bind:value={newType}>
						<option value="league">League</option>
						<option value="tournament">Tournament</option>
						<option value="knockout">Knockout</option>
					</select>
				</label>
				<div class="row">
					<button class="btn primary" onclick={create}>Create</button>
					<button class="btn ghost" onclick={() => formOpen = false}>Cancel</button>
				</div>
			</div>
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
	.list {
		display: grid;
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}
	.competition-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-sm) var(--space-md);
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.meta {
		font-size: var(--text-sm);
		color: var(--muted);
		text-transform: capitalize;
	}
	.status {
		font-weight: 700;
	}
	.form {
		margin-top: var(--space-md);
		padding-top: var(--space-md);
		border-top: 1px solid var(--line);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin-bottom: var(--space-md);
	}
	.field span {
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.field input,
	.field select {
		background: var(--bg);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 10px;
		padding: var(--space-sm);
		font-size: var(--text-md);
	}
	.row {
		display: flex;
		gap: var(--space-md);
	}
	.muted { color: var(--muted); }
</style>
