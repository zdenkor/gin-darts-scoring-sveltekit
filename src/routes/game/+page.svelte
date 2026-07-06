<script>
	import GameScreen from '$lib/ui/GameScreen.svelte';
	import { page } from '$app/stores';

	const url = $derived($page.url);
	const names = $derived(
		url.searchParams.get('names')?.split(',').map(s => s.trim()).filter(Boolean) || null
	);
	const bots = $derived(
		url.searchParams.get('bots')?.split(',').map(s => s.trim()) || []
	);
	const start = $derived(Number(url.searchParams.get('start')) || 501);
	const inRule = $derived(url.searchParams.get('in') || 'single');
	const outRule = $derived(url.searchParams.get('out') || 'double');
	const legsToWin = $derived(Number(url.searchParams.get('legs')) || 1);
	const setsToWin = $derived(Number(url.searchParams.get('sets')) || 1);
</script>

<GameScreen {names} {bots} {start} {inRule} {outRule} {legsToWin} {setsToWin} />
