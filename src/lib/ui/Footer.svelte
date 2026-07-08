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
		padding-left: calc(var(--space-md) + env(safe-area-inset-left, 0px));
		padding-right: calc(var(--space-md) + env(safe-area-inset-right, 0px));
		padding-bottom: calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--line);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.muted { color: var(--muted); }
	@media (orientation: landscape) and (max-height: 400px) {
		.app-footer { padding: var(--space-xs) var(--space-sm); font-size: var(--text-xs); }
	}
	@media (min-width: 80rem) {
		.app-footer { padding: var(--space-md) var(--space-lg); font-size: var(--text-md); }
	}
	@media (min-width: 120rem) {
		.app-footer { padding: var(--space-lg) var(--space-xl); font-size: var(--text-lg); }
	}
</style>
