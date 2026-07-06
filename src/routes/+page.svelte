<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	const menuItems = [
		{ route: '/setup', title: 'New game', desc: 'Start a local match (X01, Cricket, Shanghai)' },
		{ route: '/game', title: 'Continue game', desc: 'Resume the last active match' },
		{ route: '/online', title: 'Online match', desc: 'Host or join a remote game' },
		{ route: '/competitions', title: 'Competitions', desc: 'Leagues, tournaments, brackets' },
		{ route: '/stats', title: 'Statistics', desc: 'Player history and averages' },
		{ route: '/settings', title: 'Settings', desc: 'Display, sign-in, data sync' },
	];

	function go(route) {
		goto(`${base}${route}`);
	}
</script>

<div class="screen">
	<h1 class="sr-only">Menu</h1>
	<div class="menu-grid">
		{#each menuItems as item}
			<button class="menu-tile" type="button" onclick={() => go(item.route)}>
				<h2>{item.title}</h2>
				<p>{item.desc}</p>
			</button>
		{/each}
	</div>
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
</style>
