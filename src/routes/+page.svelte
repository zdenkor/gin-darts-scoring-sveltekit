<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
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
</script>

<div class="screen">
	<div class="hero">
		<h1>Gin's Online Dart's Scoring System</h1>
		<p class="subtitle">Choose which version to use</p>
	</div>

	<div class="version-grid">
		<button class="version-tile new" type="button" onclick={() => go('/dashboard')}>
			<span class="badge new-badge">NEW</span>
			<h2>SvelteKit version</h2>
			<p>Modern responsive UI, continue game, stats, online P2P, competitions.</p>
			<span class="action">Open dashboard →</span>
		</button>

		<a class="version-tile legacy" href={`${base}/legacy/index.html`}>
			<span class="badge legacy-badge">LEGACY</span>
			<h2>Classic version</h2>
			<p>Original vanilla app. Use this if you prefer the previous interface.</p>
			<span class="action">Open classic version →</span>
		</a>
	</div>

	{#if !loading && canContinue}
		<button class="continue-banner" type="button" onclick={() => go('/game')}>
			Continue saved game
		</button>
	{/if}

	<footer class="footer-note">
		<a href={`${base}/settings`}>Settings</a> • <a href={`${base}/stats`}>Statistics</a> • <a href={`${base}/admin`}>Admin</a>
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
		container-name: landing;
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
	.version-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-md);
		width: min(100%, 720px);
	}
	@container landing (min-width: 640px) {
		.version-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.version-tile {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		background: var(--surface);
		border: 2px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-lg);
		text-align: left;
		color: var(--text);
		transition: transform .15s ease, border-color .15s ease;
	}
	.version-tile:hover {
		transform: translateY(-2px);
	}
	.version-tile.new {
		border-color: var(--accent);
	}
	.version-tile.new:hover {
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
	}
	.version-tile.legacy {
		border-color: var(--muted);
	}
	.version-tile.legacy:hover {
		border-color: var(--text);
	}
	.badge {
		position: absolute;
		top: var(--space-sm);
		right: var(--space-sm);
		padding: 2px var(--space-xs);
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 700;
	}
	.new-badge {
		background: var(--accent);
		color: #062018;
	}
	.legacy-badge {
		background: var(--line);
		color: var(--muted);
	}
	.version-tile h2 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.version-tile p {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
		flex: 1 1 auto;
	}
	.action {
		font-weight: 700;
		color: var(--accent);
	}
	.version-tile.legacy .action {
		color: var(--text);
	}
	.continue-banner {
		width: min(100%, 720px);
		background: var(--accent);
		color: #062018;
		border: 0;
		border-radius: var(--radius);
		padding: var(--space-md);
		font-size: var(--text-md);
		font-weight: 700;
	}
	.footer-note {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.footer-note a {
		color: var(--accent);
		text-decoration: none;
	}
</style>
