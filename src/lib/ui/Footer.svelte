<script>
	import { APP_VERSION } from '$lib/version.js';
</script>

<footer class="app-footer">
	<span>Gin's Online Dart's Scoring System</span>
	<span class="muted">{APP_VERSION}</span>
</footer>

<style>
	.app-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-sm) var(--space-md);
		border-top: 1px solid var(--line);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.muted { color: var(--muted); }
</style>
