<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import { auth } from '$lib/state/auth.svelte.js';

	const isAuthed = $derived(auth.isSignedIn);
	const isAdmin = $derived(auth.isAdmin);
	const displayName = $derived(auth.displayUser?.displayName || auth.displayUser?.name || 'Guest');

	function home() { goto(`${base}/`); }
	async function signOut() {
		await auth.signOut();
		goto(`${base}/`);
	}
</script>

<header class="app-header">
	<button class="brand" onclick={home} aria-label="Home">
		<img src={favicon} alt="" width="32" height="32" />
		<div class="brand-text">
			<h1>Gin's Dart's</h1>
			<span class="subtitle">Online Dart Scoring</span>
		</div>
	</button>

	<nav class="header-actions">
		<a class="icon-btn" href="{base}/settings" title="Settings" aria-label="Settings"><span class="icon">⚙</span></a>

		{#if isAuthed}
			{#if isAdmin}
				<a class="icon-btn" href="{base}/admin" title="Admin" aria-label="Admin"><span class="icon">🔒</span></a>
			{/if}
			<span class="user-pill">{displayName}</span>
			<button class="icon-btn" type="button" onclick={signOut} title="Sign out" aria-label="Sign out"><span class="icon">↪</span></button>
		{:else}
			<a class="btn primary" href="{base}/login">Sign in</a>
		{/if}
	</nav>
</header>

<style>
	.app-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-sm) var(--space-md);
		gap: var(--space-sm);
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		flex: 0 0 auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		background: transparent;
		border: none;
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}
	.brand img { width: 2em; height: 2em; }
	.brand-text h1 {
		font-size: var(--text-md);
		margin: 0;
		line-height: 1.1;
	}
	.brand-text .subtitle {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.user-pill {
		font-size: var(--text-sm);
		color: var(--muted);
		white-space: nowrap;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
@container app (max-width: 380px) {
		.user-pill { display: none; }
	}
</style>
