<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	function back() {
		goto(`${base}/`);
	}
</script>

<div class="screen">
	<div class="card">
		<h1>Admin</h1>
		<p class="muted">Admin tools will be migrated here.</p>
		<button class="btn" onclick={back}>Back to menu</button>
	</div>
</div>

<style>
	.muted { color: var(--muted); }
</style>
