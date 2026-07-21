<script>
	// SVAR Calendar wrapper. The host page
	// (/calendar) passes an array of NOSTR events
	// in our internal shape (tournaments with
	// {id, name, date, time, location, type, ...}).
	// We translate that to SVAR's event shape
	// ({id, start_date, end_date, text, type,
	// details}) and feed it to the SVAR <Calendar>
	// primitive, locked into the "month" view.
	//
	// The wrapper is intentionally thin: theme
	// (Willow / WillowDark) is picked automatically
	// from the page-level `prefers-color-scheme`
	// so dark-mode flips with the rest of the app,
	// and the prev / next / today buttons the
	// wrapper renders are routed through the same
	// `cursor` state the list view uses so the
	// two stay in sync if the user switches view.
	import { Calendar as SVARRoot, Willow, WillowDark } from '@svar-ui/svelte-calendar';
	import { onMount } from 'svelte';

	let { events = [], view = 'month', date = $bindable(new Date()), onDateChange = () => {} } = $props();

	// Light / dark theme. The page CSS already
	// toggles a `theme-dark` class on <html>; we
	// read that and feed the matching SVAR theme
	// component. On first render we read
	// `prefers-color-scheme` so the initial paint
	// is right before the class is applied.
	let themeDark = $state(false);
	onMount(() => {
		const root = /** @type {HTMLElement} */ (document.documentElement);
		themeDark = root.classList.contains('theme-dark') ||
			(!root.classList.contains('theme-light') &&
				window.matchMedia?.('(prefers-color-scheme: dark)').matches);
		// Watch the class so manual theme toggles
		// re-render the SVAR theme component.
		const obs = new MutationObserver(() => {
			const d = root.classList.contains('theme-dark') ||
				(!root.classList.contains('theme-light') &&
					window.matchMedia?.('(prefers-color-scheme: dark)').matches);
			if (d !== themeDark) themeDark = d;
		});
		obs.observe(root, { attributes: true, attributeFilter: ['class'] });
		return () => obs.disconnect();
	});

	// Convert internal events to SVAR's shape.
	// NOSTR dates are YYYY-MM-DD (date-only) or
	// YYYY-MM-DDTHH:MM (datetime). SVAR wants an
	// ISO string with the time. We pass through
	// `details` so the popover can render the
	// location / time / kind when the user hovers.
	const svarEvents = $derived(
		events.map((e) => {
			const start = e.date || '';
			// No end-date on NOSTR tournaments; default
			// to same day so SVAR doesn't render a
			// phantom multi-day bar.
			return {
				id: String(e.id),
				start_date: start,
				end_date: start,
				text: e.name || 'Untitled',
				type: e.type === 'league' ? 'league' : (e.type === 'tournament' ? 'tournament' : 'event'),
				details: [
					e.time ? `Time: ${e.time}` : '',
					e.location ? `Location: ${e.location}` : ''
				].filter(Boolean).join(' · ')
			};
		})
	);

	function handleDateChange(/** @type {Date} */ d) {
		if (d) {
			date = d;
			onDateChange(d);
		}
	}
</script>

<div class="svar-wrap">
	{#if themeDark}
		<WillowDark />
	{:else}
		<Willow />
	{/if}
	<SVARRoot
		events={svarEvents}
		view={view}
		date={date}
		views={["day", "week", "month"]}
		readonly={true}
		ondateChange={handleDateChange}
	/>
</div>

<style>
	.svar-wrap {
		/* SVAR paints its own background; let it
		   cover the full card so the toolbar and
		   month grid line up. */
		min-height: 600px;
	}
	.svar-wrap :global(.wx-willow-cal-wrapper),
	.svar-wrap :global(.wx-willow-dark-cal-wrapper) {
		background: var(--surface);
		color: var(--text);
		border-radius: 8px;
	}
</style>
