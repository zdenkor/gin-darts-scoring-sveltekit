<script>
	import GameScreen from '$lib/ui/GameScreen.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	const url = $derived($page.url);
	const names = $derived(
		url.searchParams.get('names')?.split(',').map(s => s.trim()).filter(Boolean) || ['Player 1', 'Player 2']
	);
	const start = $derived(Number(url.searchParams.get('start')) || 501);
	const inRule = $derived(url.searchParams.get('in') || 'single');
	const outRule = $derived(url.searchParams.get('out') || 'double');
	const legsToWin = $derived(Number(url.searchParams.get('legs')) || 1);
	const setsToWin = $derived(Number(url.searchParams.get('sets')) || 1);

	$effect(() => {
		if (names.length === 0) goto(`${base}/setup`);
	});
</script>

{#key `${names.join(',')}-${start}-${inRule}-${outRule}-${legsToWin}-${setsToWin}`}
	<GameScreen {names} {start} {inRule} {outRule} {legsToWin} {setsToWin} />
{/key}
