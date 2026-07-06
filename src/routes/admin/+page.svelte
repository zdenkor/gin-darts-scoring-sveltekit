<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/state/auth.svelte.js';
	import { listUsers, createUser, deleteUser } from '$lib/auth/auth.js';
	import { clearGameHistory } from '$lib/util/history.js';
	import { clearCurrentGame } from '$lib/util/currentGame.js';

	let users = $state([]);
	let loading = $state(true);
	let newUsername = $state('');
	let newPassword = $state('');
	let newRole = $state('user');
	let message = $state('');

	async function refresh() {
		if (!auth.isAdmin) {
			loading = false;
			return;
		}
		users = await listUsers();
		loading = false;
	}

	onMount(() => {
		if (!auth.isAdmin) {
			goto(`${base}/login?redirect=/admin`);
			return;
		}
		refresh();
	});

	function back() {
		goto(`${base}/`);
	}

	async function addUser() {
		if (!newUsername.trim() || !newPassword.trim()) return;
		try {
			await createUser(newUsername.trim(), newPassword, newRole);
			newUsername = '';
			newPassword = '';
			message = 'User created.';
			await refresh();
		} catch (e) {
			message = `Error: ${e.message}`;
		}
		setTimeout(() => (message = ''), 2000);
	}

	async function removeUser(id, username) {
		if (username === 'admin') {
			message = 'Cannot delete default admin.';
			setTimeout(() => (message = ''), 2000);
			return;
		}
		if (!confirm(`Delete user ${username}?`)) return;
		await deleteUser(id);
		message = 'User deleted.';
		await refresh();
		setTimeout(() => (message = ''), 2000);
	}

	async function clearAllData() {
		if (!confirm('Delete all local game history and saved games? This cannot be undone.')) return;
		await clearGameHistory();
		await clearCurrentGame();
		message = 'All local game data cleared.';
		setTimeout(() => (message = ''), 2000);
	}
</script>

<div class="screen">
	<div class="card">
		<div class="card-header">
			<h1>Admin</h1>
			<button class="btn ghost" onclick={back}>Back</button>
		</div>

		{#if !auth.isAdmin}
			<p class="muted">Admin access required. Redirecting to login…</p>
		{:else if loading}
			<p class="muted">Loading admin panel…</p>
		{:else}
			{#if message}
				<div class="message">{message}</div>
			{/if}

			<section class="section">
				<h2>Users</h2>
				<div class="list">
					{#each users as u}
						<div class="user-row">
							<div class="info">
								<strong>{u.username}</strong>
								<span class="meta">{u.role} • created {new Date(u.createdAt).toLocaleDateString()}</span>
							</div>
							<button class="btn ghost danger" onclick={() => removeUser(u.id, u.username)}>Delete</button>
						</div>
					{/each}
				</div>
			</section>

			<section class="section">
				<h2>Create user</h2>
				<label class="field">
					<span>Username</span>
					<input type="text" bind:value={newUsername} placeholder="newuser" />
				</label>
				<label class="field">
					<span>Password</span>
					<input type="password" bind:value={newPassword} placeholder="••••••" />
				</label>
				<label class="field">
					<span>Role</span>
					<select bind:value={newRole}>
						<option value="user">User</option>
						<option value="admin">Admin</option>
					</select>
				</label>
				<button class="btn primary" onclick={addUser}>Create user</button>
			</section>

			<section class="section">
				<h2>Data</h2>
				<p class="muted">Clear all local game history and saved current games. Users and settings remain.</p>
				<button class="btn danger" onclick={clearAllData}>Clear game data</button>
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
	.section {
		margin-bottom: var(--space-lg);
		padding-bottom: var(--space-lg);
		border-bottom: 1px solid var(--line);
	}
	.section:last-child {
		border-bottom: 0;
		margin-bottom: 0;
	}
	.section h2 {
		font-size: var(--text-md);
		margin-bottom: var(--space-sm);
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.list {
		display: grid;
		gap: var(--space-sm);
	}
	.user-row {
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
	.message {
		background: var(--accent);
		color: #062018;
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius);
		margin-bottom: var(--space-md);
	}
	.muted { color: var(--muted); }
</style>
