<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	function back() {
		goto(`${base}/`);
	}
</script>

<div class="screen">
	<div class="card">
		<h1>Settings</h1>
		<p class="muted">Display, sign-in, data sync and about will be migrated here.</p>
		<button class="btn" onclick={back}>Back to menu</button>
	</div>
</div>

<style>
	.muted { color: var(--muted); }
</style>
