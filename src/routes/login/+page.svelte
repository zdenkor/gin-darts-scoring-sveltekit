<script>
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/state/auth.svelte.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';

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
				<label for="user">Username<HelpIcon topic="Username" body="The local account name you registered with the admin. The default seeded account is 'admin'." /></label>
				<input id="user" type="text" bind:value={username} autocomplete="username" />
			</div>
			<div class="field">
				<label for="pass">Password<HelpIcon topic="Password" body="Password for the local account. Default seeded password is 'admin' — change it from the Admin panel after first sign-in." /></label>
				<input id="pass" type="password" bind:value={password} autocomplete="current-password" />
			</div>
			<button class="btn primary" type="submit" disabled={loading}>
				{loading ? 'Signing in…' : 'Sign in'}
			</button>
		</form>

		<div class="divider">or</div>

		<button class="btn ghost" type="button" onclick={google}>Sign in with Google<HelpIcon topic="Sign in with Google" body="Sign in with your Google account. The app asks for permission to read/write its own files in Google Drive (used for cross-device sync of competitions, matches, and history). No access to other Drive files." /></button>
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
