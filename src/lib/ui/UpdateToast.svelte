<script>
	import { onMount } from 'svelte';

	let updateAvailable = $state(false);

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		let refreshing = false;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (refreshing) return;
			refreshing = true;
			window.location.reload();
		});
		navigator.serviceWorker.ready.then((reg) => {
			reg.addEventListener('updatefound', () => {
				const newWorker = reg.installing;
				if (!newWorker) return;
				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						updateAvailable = true;
					}
				});
			});
		});
	});

	function applyUpdate() {
		if (!('serviceWorker' in navigator)) return;
		navigator.serviceWorker.ready.then((reg) => {
			reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
		});
	}
</script>

{#if updateAvailable}
	<div class="update-toast" role="status">
		<span>New version available.</span>
		<button class="btn primary" onclick={applyUpdate}>Update now</button>
	</div>
{/if}

<style>
	.update-toast {
		position: fixed;
		bottom: var(--space-md);
		left: var(--space-md);
		right: var(--space-md);
		z-index: 1000;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 0.5em 1em rgba(0,0,0,0.3);
	}
@container app (min-width: 480px) {
		.update-toast {
			left: auto;
			max-width: 420px;
		}
	}
</style>
