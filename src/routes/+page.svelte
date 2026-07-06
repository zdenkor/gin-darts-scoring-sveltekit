<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { hasCurrentGame } from '$lib/util/currentGame.js';

	const menuItems = [
		{ route: '/setup', title: 'New game', desc: 'Start a local match (X01, Cricket, Shanghai)' },
		{ route: '/game', title: 'Continue game', desc: 'Resume the last active match' },
		{ route: '/online', title: 'Online match', desc: 'Host or join a remote game' },
		{ route: '/competitions', title: 'Competitions', desc: 'Leagues, tournaments, brackets' },
		{ route: '/stats', title: 'Statistics', desc: 'Player history and averages' },
		{ route: '/settings', title: 'Settings', desc: 'Display, sign-in, data sync' },
	];

	let canContinue = $state(false);
	let loading = $state(true);

	onMount(async () => {
		canContinue = await hasCurrentGame();
		loading = false;
	});

	function go(route) {
		if (route === '/game' && !canContinue) return;
		goto(`${base}${route}`);
	}
</script>

<div class="screen">
	<h1 class="sr-only">Menu</h1>
	<div class="menu-grid">
		{#each menuItems as item}
			<button
				class="menu-tile"
				class:disabled={item.route === '/game' && !canContinue}
				type="button"
				disabled={item.route === '/game' && !canContinue}
				onclick={() => go(item.route)}
			>
				<h2>{item.title}</h2>
				<p>{item.desc}</p>
				{#if item.route === '/game'}
					<span class="badge">{canContinue ? 'saved' : 'none'}</span>
				{/if}
			</button>
		{/each}
	</div>
	{#if loading}
		<p class="loading">Loading…</p>
	{/if}
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.menu-tile {
		position: relative;
	}
	.badge {
		position: absolute;
		top: var(--space-sm);
		right: var(--space-sm);
		background: var(--accent);
		color: #062018;
		padding: 2px var(--space-xs);
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
	}
	.menu-tile.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.menu-tile.disabled .badge {
		background: var(--line);
		color: var(--muted);
	}
	.loading {
		text-align: center;
		color: var(--muted);
		font-size: var(--text-sm);
	}
</style>
