<script>
	import '../app.css';
	import Header from '$lib/ui/Header.svelte';
	import Footer from '$lib/ui/Footer.svelte';
	import UpdateToast from '$lib/ui/UpdateToast.svelte';
	import { auth } from '$lib/state/auth.svelte.js';
	import { onMount } from 'svelte';
	import { installKeyboardNav } from '$lib/ui/keyboardNav.js';
	// Element inspector — debug helper, lives in
	// +layout so the user can hover any page and
	// see DOM details. Started once on mount if the
	// user previously enabled it (persisted in
	// localStorage under gin-darts-element-inspector);
	// the Settings page's toggle calls start/stop
	// directly. See $lib/debug/elementInspector.js.
	import { getInspectorSettings, startElementInspector, stopElementInspector } from '$lib/debug/elementInspector.js';

	let { children } = $props();

	onMount(() => {
		installKeyboardNav(document.body);
		if (getInspectorSettings().enabled) startElementInspector();
		return () => stopElementInspector();
	});
</script>

<div class="app-shell">
	<Header />
	<main class="app-main game-layout">
		{@render children()}
	</main>
	<Footer />
	<UpdateToast />
</div>
