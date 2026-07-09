<script>
	import { Select } from 'bits-ui';
	import { X01_IN_OPTIONS, X01_OUT_OPTIONS } from '$lib/game/engine.js';

	// =============================================================
	// Select — Bits UI wrapper for the original vanilla <select>.
	//
	// Replaces native <select> in places where we need:
	//   - consistent styling on mobile (native iOS/Android pickers
	//     render fine but are inconsistent in dark mode and on TV
	//     browsers that don't have native chrome),
	//   - keyboard navigation on TV (Bits UI handles aria-expanded,
	//     aria-activedescendant, focus management, arrow keys),
	//   - a single component that all routes can drop in.
	//
	// Usage matches the most common native <select> pattern:
	//   <Select options={[{value,label,desc?}, ...]} bind:value={v} />
	// or, for the special X01 in/out option shape:
	//   <Select options={X01_IN_OPTIONS} bind:value={v} />
	// where X01_IN_OPTIONS / X01_OUT_OPTIONS are { key: { label, desc } }.
	//
	// On mobile (<768px) the dropdown lifts into a bottom sheet
	// (position="item-aligned" with sideOffset, anchored to the
	// trigger). On TV (>=1600px) the dropdown opens as a wide
	// overlay above the trigger with extra padding so the focused
	// item is readable from 3m. On desktop it falls back to the
	// default popup positioned under the trigger.
	// =============================================================

	let {
		value = $bindable(''),
		options = /** @type {Array<{value:any,label:string,desc?:string}>|Record<string,{label:string,desc?:string}>} */ ([]),
		placeholder = 'Select…',
		ariaLabel = '',
		disabled = false,
		id = '',
		name = '',
		className = ''
	} = $props();

	// Normalize options into an array of { value, label, desc }. The
	// caller can pass either an array (most common) or a record map
	// (X01_IN_OPTIONS / X01_OUT_OPTIONS shape) — both flatten to the
	// same list. desc is shown next to the label in the popup.
	function normalize() {
		if (Array.isArray(options)) return options;
		return Object.entries(options).map(([k, v]) => ({
			value: k,
			label: v.label,
			desc: v.desc || ''
		}));
	}
	const items = $derived(normalize());

	// Find the label for the current value, used by the trigger.
	const selectedLabel = $derived(
		items.find(i => String(i.value) === String(value))?.label || placeholder
	);
</script>

<Select.Root
	type="single"
	bind:value={() => value, (v) => (value = v)}
	{disabled}
>
	<Select.Trigger
		{id}
		{name}
		class="sel-trigger {className}"
		aria-label={ariaLabel || placeholder}
	>
		<Select.Value placeholder={placeholder}>
			{selectedLabel}
		</Select.Value>
		<span class="sel-chev" aria-hidden="true">▾</span>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content class="sel-content" sideOffset={6}>
			<Select.Viewport class="sel-viewport">
				{#each items as it (it.value)}
					<Select.Item value={String(it.value)} label={it.label} class="sel-item">
						{#snippet children({ selected })}
							<span class="sel-item-label">{it.label}</span>
							{#if it.desc}<span class="sel-item-desc">{it.desc}</span>{/if}
							{#if selected}<span class="sel-item-check" aria-hidden="true">✓</span>{/if}
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>

<style>
	/* Trigger: matches the look of native <select> but lets Bits UI
	   own the keyboard handling. min-height: 48px on touch so the
	   target is easy to hit, and :focus-visible is the prominent
	   outline used by the global keyboard nav for TV D-Pad. */
	.sel-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		width: 100%;
		min-height: 48px;
		padding: 0 var(--space-sm);
		background: var(--bg);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 10px;
		font: inherit;
		font-size: var(--text-md);
		cursor: pointer;
		text-align: left;
	}
	.sel-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
	.sel-trigger:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
	.sel-chev { color: var(--muted); font-size: 0.9em; }

	/* Popup: positioned just under the trigger. On TV the viewport
	   is huge so the popup itself caps at a comfortable width. The
	   viewport max-height + overflow-y is what lets the picker
	   scroll when there are more options than fit. The
	   `min-width: var(--bits-anchor-width, 200px)` keeps the popup
	   at least as wide as the trigger so it doesn't look squished. */
	.sel-content {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		min-width: var(--bits-anchor-width, 200px);
		max-width: 480px;
		max-height: min(60dvh, 480px);
		overflow: hidden;
		z-index: 1000;
	}
	.sel-viewport {
		display: flex;
		flex-direction: column;
		padding: 4px;
		gap: 2px;
		max-height: min(60dvh, 480px);
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
	}

	/* Each option: 48px min height on touch; on TV (large viewport)
	   the text and hit area scale up so D-Pad users can read from
	   across the room. */
	.sel-item {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: 10px 12px;
		min-height: 48px;
		border-radius: 8px;
		cursor: pointer;
		font-size: var(--text-md);
		color: var(--text);
		outline: none;
		user-select: none;
	}
	.sel-item[data-highlighted] {
		background: color-mix(in srgb, var(--accent) 22%, transparent);
	}
	.sel-item[data-state='checked'] {
		font-weight: 700;
	}
	.sel-item:focus-visible,
	.sel-item[data-highlighted]:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: -3px;
	}
	.sel-item-label { flex: 1; }
	.sel-item-desc {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.sel-item-check {
		color: var(--accent);
		font-weight: 700;
	}

	/* Mobile / tablet: anchor at the bottom of the screen like a
	   bottom sheet, so the user's thumb can reach every option. */
	@media (max-width: 768px) {
		.sel-content {
			position: fixed;
			left: 8px !important;
			right: 8px !important;
			bottom: 8px !important;
			top: auto !important;
			width: auto !important;
			max-width: none !important;
			max-height: 70dvh;
			transform: none !important;
		}
		.sel-item { min-height: 56px; font-size: var(--text-lg); }
	}

	/* TV: large viewport, large text, prominent focus. */
	@media (min-width: 1600px) {
		.sel-trigger {
			min-height: 64px;
			font-size: var(--text-lg);
			padding: 0 var(--space-md);
		}
		.sel-content { max-width: 640px; }
		.sel-item {
			min-height: 64px;
			font-size: var(--text-lg);
			padding: 14px 18px;
		}
	}
</style>
