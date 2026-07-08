<script>
	import '../app.css';
	import Header from '$lib/ui/Header.svelte';
	import Footer from '$lib/ui/Footer.svelte';
	import UpdateToast from '$lib/ui/UpdateToast.svelte';
	import { auth } from '$lib/state/auth.svelte.js';
	import { onMount } from 'svelte';
	import { installKeyboardNav } from '$lib/ui/keyboardNav.js';

	let { children } = $props();

	// Global D-Pad / arrow-key navigation, used on TV and as a
	// keyboard-only fallback on desktop. See lib/ui/keyboardNav.js
	// for the focus model.
	onMount(() => installKeyboardNav(document.body));
</script>

<div class="app-shell">
	<Header />
	<main class="app-main game-layout">
		{@render children()}
	</main>
	<Footer />
	<UpdateToast />
</div>
