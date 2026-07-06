<script>
	import '../app.css';
	import Header from '$lib/ui/Header.svelte';
	import Footer from '$lib/ui/Footer.svelte';
	import UpdateToast from '$lib/ui/UpdateToast.svelte';
	import { auth } from '$lib/state/auth.svelte.js';

	let { children } = $props();
</script>

<div class="app-shell">
	<Header />
	<main class="app-main game-layout">
		{@render children()}
	</main>
	<Footer />
	<UpdateToast />
</div>
