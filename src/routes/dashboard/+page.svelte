<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { auth } from '$lib/state/auth.svelte.js';
	import { hasCurrentGame } from '$lib/util/currentGame.js';

	let canContinue = $state(false);
	let loading = $state(true);

	onMount(async () => {
		canContinue = await hasCurrentGame();
		loading = false;
	});

	function go(route) {
		goto(`${base}${route}`);
	}

	const tiles = [
		{ label: 'New x01', desc: '301 / 401 / 501 / 701 / 1001', icon: '🎯', route: '/setup', primary: true },
		{ label: 'Continue', desc: 'Resume saved game', icon: '▶', route: '/game', disabled: () => !canContinue },
		{ label: 'Statistics', desc: 'Per-player stats', icon: '📊', route: '/stats' },
		{ label: 'Competitions', desc: 'Leagues & tournaments', icon: '🏆', route: '/competitions' },
		{ label: 'Online', desc: 'P2P match room', icon: '🌐', route: '/online' },
		{ label: 'Settings', desc: 'Theme, sound, sync', icon: '⚙', route: '/settings' },
		{ label: 'Admin', desc: 'Users & data', icon: '🔒', route: '/admin', hidden: () => !auth.isAdmin },
	];
</script>

<div class="screen">
	<div class="hero">
		<h1>SvelteKit Dashboard</h1>
		<p class="subtitle">Choose what to do next</p>
	</div>

	<div class="tile-grid">
		{#each tiles as t}
			{#if !t.hidden || !t.hidden()}
				{#if t.disabled && t.disabled()}
					<div class="tile disabled" title="No saved game">
						<span class="icon">{t.icon}</span>
						<h2>{t.label}</h2>
						<p>{t.desc}</p>
					</div>
				{:else}
					<button
						type="button"
						class="tile"
						class:primary={t.primary}
						onclick={() => go(t.route)}
					>
						<span class="icon">{t.icon}</span>
						<h2>{t.label}</h2>
						<p>{t.desc}</p>
					</button>
				{/if}
			{/if}
		{/each}
	</div>

	<footer class="footer-note">
		<a href={`${base}/`}>Switch version</a> • <a href={`${base}/legacy/index.html`}>Legacy</a>
		{#if auth.isSignedIn}
			• signed in as {auth.displayUser?.username || auth.displayUser?.email}
			<button class="link" type="button" onclick={() => auth.signOut()}>Sign out</button>
		{:else}
			• <a href={`${base}/login`}>Sign in</a>
		{/if}
	</footer>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: var(--space-lg);
		text-align: center;
		container-type: inline-size;
		container-name: dashboard;
	}
	.hero h1 {
		font-size: var(--text-2xl);
		margin: 0;
		color: var(--text);
	}
	.subtitle {
		color: var(--muted);
		margin: var(--space-sm) 0 0;
		font-size: var(--text-md);
	}
	.tile-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-md);
		width: min(100%, 720px);
	}
	@container dashboard (min-width: 480px) {
		.tile-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@container dashboard (min-width: 720px) {
		.tile-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	.tile {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: var(--space-sm);
		background: var(--surface);
		border: 2px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-lg);
		color: var(--text);
		transition: transform .15s ease, border-color .15s ease;
		min-height: 140px;
	}
	.tile:hover:not(.disabled) {
		transform: translateY(-2px);
		border-color: var(--text);
	}
	.tile.primary {
		border-color: var(--accent);
	}
	.tile.primary:hover {
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
	}
	.tile.disabled {
		opacity: .4;
		cursor: not-allowed;
	}
	.icon {
		font-size: var(--text-2xl);
	}
	.tile h2 {
		margin: 0;
		font-size: var(--text-md);
	}
	.tile p {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.footer-note {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.footer-note a,
	.footer-note .link {
		color: var(--accent);
		text-decoration: none;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		cursor: pointer;
	}
</style>
