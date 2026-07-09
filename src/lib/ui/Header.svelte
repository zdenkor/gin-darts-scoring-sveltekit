<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import settingsIcon from '$lib/assets/settings.svg?raw';
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
		<a class="icon-btn" href="{base}/settings" title="Settings" aria-label="Settings">
			<span class="icon icon-svg">{@html settingsIcon}</span>
		</a>

		{#if isAuthed}
			{#if isAdmin}
				<a class="icon-btn" href="{base}/admin" title="Admin" aria-label="Admin"><span class="icon">🔒</span></a>
			{/if}
			<span class="user-pill">{displayName}</span>
			<button class="icon-btn" type="button" onclick={signOut} title="Sign out" aria-label="Sign out"><img src="{base}/assets/logout.svg" alt="" class="icon icon-img icon-logout" /></button>
		{:else}
			<a class="icon-btn" href="{base}/login" title="Sign in" aria-label="Sign in"><img src="{base}/assets/login.svg" alt="" class="icon icon-img icon-login" /></a>
		{/if}
	</nav>
</header>

<style>
	.app-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: calc(var(--space-sm) + env(safe-area-inset-top, 0px)) var(--space-md) var(--space-sm);
		padding-left: calc(var(--space-md) + env(safe-area-inset-left, 0px));
		padding-right: calc(var(--space-md) + env(safe-area-inset-right, 0px));
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
.icon { line-height: 1; }
.icon-svg { display: inline-flex; align-items: center; justify-content: center; }
.icon-svg :global(svg) { width: 1.1em; height: 1.1em; display: block; color: inherit; }
.icon-img { width: 1.1em; height: 1.1em; display: block; }
/* Tint the login / logout icons without editing the source SVGs
   (they live in static/assets/ and are not committed from the
   assistant side — see AGENTS.md). The base stroke in those
   SVGs is #1C274C (dark navy). hue-rotate() rotates the hue
   wheel so login ends up green (~120deg) and logout red
   (~330deg). Brightness bumps the washed-out result back up. */
.icon-img.icon-login {
	filter: hue-rotate(110deg) saturate(1.4) brightness(1.15);
}
.icon-img.icon-logout {
	filter: hue-rotate(320deg) saturate(1.6) brightness(1.1);
}
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
@media (orientation: landscape) and (max-height: 400px) {
	.brand-text .subtitle { display: none; }
	.brand-text h1 { font-size: var(--text-sm); }
	.app-header { padding: var(--space-xs) var(--space-sm); }
}
@media (min-width: 80rem) {
	.brand-text h1 { font-size: var(--text-lg); }
	.brand-text .subtitle { font-size: var(--text-sm); }
	.app-header { padding: var(--space-md) var(--space-lg); gap: var(--space-md); }
	.header-actions { gap: var(--space-md); }
	.brand img { width: 2.5em; height: 2.5em; }
}
@media (min-width: 120rem) {
	.brand-text h1 { font-size: var(--text-xl); }
	.brand img { width: 3em; height: 3em; }
	.app-header { padding: var(--space-lg) var(--space-xl); }
}
@media (prefers-reduced-motion: reduce) {
	.brand, .icon-btn { transition: none; }
}
</style>
