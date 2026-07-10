<script>
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/state/auth.svelte.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';

	let error = $state('');
	let loading = $state(false);

	async function google() {
		error = '';
		loading = true;
		try {
			await auth.googleSignIn();
			goto(`${base}/`);
		} catch (err) {
			error = err.message || 'Google sign-in failed';
		} finally {
			loading = false;
		}
	}
</script>

<div class="screen">
	<div class="card">
		<h1>Sign in</h1>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<p class="muted intro">
			Gin's Darts is a single-player PWA that scores darts locally and
			syncs your tournaments to your own Google Drive when signed in.
			Sign in is Google-only — your Google account is also used to
			derive your NOSTR identity, so any tournament you publish on the
			calendar can be attributed back to you.
		</p>

		<button class="btn primary google-btn" type="button" onclick={google} disabled={loading}>
			{loading ? 'Signing in…' : 'Sign in with Google'}
			<HelpIcon topic="Sign in with Google" body="Sign in with your Google account. The app asks for permission to read/write its own files in Google Drive (used for cross-device sync of competitions, matches, and history). No access to other Drive files." />
		</button>
	</div>
</div>

<style>
	.intro {
		font-size: var(--text-sm);
		line-height: 1.4;
		margin-bottom: var(--space-md);
	}
	.google-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		width: 100%;
	}
	.error {
		color: #ff6b6b;
		font-size: var(--text-sm);
	}
</style>
