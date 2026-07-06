<script>
	import { onMount } from 'svelte';
	import { new01 } from '$lib/game/engine.js';
	let { names = null } = $props();
	let game = $state(null);
	onMount(() => {
		const playerNames = Array.isArray(names) && names.length > 0 ? names : ['P1', 'P2'];
		game = new01(playerNames, { start: 501, in: 'single', out: 'double', legsToWin: 1, setsToWin: 1 });
	});
</script>

<div class="screen">
	{#if game}
		<h1>{game.players[game.current].name} — {game.players[game.current].score}</h1>
	{:else}
		<p>Loading…</p>
	{/if}
</div>
