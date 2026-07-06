<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	function back() {
		goto(`${base}/`);
	}
</script>

<div class="screen">
	<div class="card">
		<h1>Competitions</h1>
		<p class="muted">Leagues, tournaments, brackets will be migrated here.</p>
		<button class="btn" onclick={back}>Back to menu</button>
	</div>
</div>

<style>
	.muted { color: var(--muted); }
</style>
