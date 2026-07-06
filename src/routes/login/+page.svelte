<script>
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/state/auth.svelte.js';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function submit(e) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			await auth.localLogin(username, password);
			goto(`${base}/`);
		} catch (err) {
			error = err.message || 'Login failed';
		} finally {
			loading = false;
		}
	}

	async function google() {
		error = '';
		try {
			await auth.googleSignIn();
			goto(`${base}/`);
		} catch (err) {
			error = err.message || 'Google sign-in failed';
		}
	}
</script>

<div class="screen">
	<div class="card">
		<h1>Sign in</h1>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<form class="stack" onsubmit={submit}>
			<div class="field">
				<label for="user">Username</label>
				<input id="user" type="text" bind:value={username} autocomplete="username" />
			</div>
			<div class="field">
				<label for="pass">Password</label>
				<input id="pass" type="password" bind:value={password} autocomplete="current-password" />
			</div>
			<button class="btn primary" type="submit" disabled={loading}>
				{loading ? 'Signing in…' : 'Sign in'}
			</button>
		</form>

		<div class="divider">or</div>

		<button class="btn ghost" type="button" onclick={google}>Sign in with Google</button>
		<p class="muted hint">Default local account: admin / admin</p>
	</div>
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.divider {
		text-align: center;
		color: var(--muted);
		margin: var(--space-md) 0;
		font-size: var(--text-sm);
	}
	.error {
		color: #ff6b6b;
		font-size: var(--text-sm);
	}
	.hint {
		font-size: var(--text-xs);
		text-align: center;
	}
</style>
