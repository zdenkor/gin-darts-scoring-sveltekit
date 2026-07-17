<script>
	/**
	 * Competition wizard. League flow uses 5 tabs:
	 *   1. Setup
	 *   2. Scoring (league points table + bonus)
	 *   3. Scheduling (per-round date / time / location)
	 *   4. Standings (live)
	 *   5. Finalization
	 *
	 * Tournament flow uses 5 tabs:
	 *   1. Setup
	 *   2. Scoring
	 *   3. Registration (player list + SVK picker)
	 *   4. Seeding & Draw (format, groups, advance, draw)
	 *   5. Finalization
	 *
	 * The v0.4.26 collapse: the `live` tournament tab is
	 * gone, and the league's `scoring` tab moved up to the
	 * second position (alongside tournaments). Both flows
	 * now have the same width.
	 *
	 * The wizard is reused by:
	 *   - /competitions (create mode, no id)
	 *   - /competitions/[id]/edit (edit mode, id present)
	 *   - /competitions/[id]/watch (watch mode, live+finalization, plus league if applicable)
	 *
	 * The parent owns:
	 *   - the actual form state (bind:playerList, bind:meta)
	 *   - the action buttons (Save / Cancel / Generate)
	 *   - the call to the engine
	 * This component only renders the tabs and the active panel.
	 */
	import { onMount } from 'svelte';

	/** @type {'create' | 'edit' | 'watch'} */
	let {
		mode = 'create',
		competition = $bindable(/** @type {any} */ (null)),
		matches = $bindable(/** @type {any[]} */ ([])),
		standings = $bindable(/** @type {any[]} */ ([])),
		activeTab = $bindable(0),
		onSave = () => {},
		onCancel = () => {}
	} = $props();

	// League flow uses 4 tabs (Setup / Scheduling / Standings /
	// Finalization). Other formats keep the 6-tab classic flow
	// (Setup / Scoring / Registration / Seeding / Live /
	// Finalization). `key: 'league'` is kept for backwards-compat
	// watch mode only.
	//
	// `finalization` is intentionally the LAST entry in the
	// array so any filtered view that includes it (league's
	// 4-tab flow, the classic 6-tab flow, watch mode) sees
	// the Save button on its own final step instead of in
	// the middle of the wizard. The league filter pulls
	// `setup / scheduling / standings / finalization` in the
	// order given by TABS — so the order here IS the visible
	// order.
	const TABS = [
		{ key: 'setup', label: 'Competition Setup', en: 'Competition_Setup' },
		{ key: 'scoring', label: 'Scoring', en: 'League_Scoring' },
		{ key: 'registration', label: 'Registration', en: 'Registration' },
		{ key: 'seeding', label: 'Seeding & Draw', en: 'Seeding_And_Draw' },
		{ key: 'live', label: 'Live Tournament', en: 'Live_Tournament' },
		{ key: 'scheduling', label: 'Scheduling', en: 'League_Scheduling' },
		{ key: 'standings', label: 'Standings', en: 'League_Standings' },
		{ key: 'league', label: 'League Update', en: 'League_Update' },
		{ key: 'finalization', label: 'Finalization', en: 'Tournament_Finalization' }
	];

	// Two-way navigation: the tab nav at the top AND
	// next/previous buttons under the panel both move
	// activeTab. The disabled state is derived so the
	// buttons can't run off either end. We also scroll the
	// wizard to the top on each tab change so the user
	// lands on the section header, not wherever the
	// previous tab left their scroll position.
	function next() {
		if (activeTab < visibleTabs.length - 1) {
			activeTab++;
			scrollToTop();
		}
	}
	function prev() {
		if (activeTab > 0) {
			activeTab--;
			scrollToTop();
		}
	}
	function scrollToTop() {
		const el = document.querySelector('.wizard-card') || document.querySelector('.wizard');
		if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		else window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// Which tabs to render. Watch only shows 4+5; league
	// uses the new 4-tab flow (Setup / Scheduling / Standings /
	// Finalization); other formats keep the classic 6-tab
	// flow (Setup / Scoring / Registration / Seeding / Live /
	// Finalization). The `league` key is kept for legacy
	// watch-mode state and is not surfaced in create/edit.
	let visibleTabs = $derived.by(() => {
		if (mode === 'watch') {
			const out = TABS.filter(t => t.key === 'live' || t.key === 'finalization');
			if (competition?.type === 'league') out.push(TABS.find(t => t.key === 'league'));
			return out;
		}
		if (competition?.type === 'league') {
			// League create/edit flow: Setup -> Scheduling -> Scoring -> Finalization.
			// Standings is live-only (watch mode), not shown while creating.
			return [
				TABS.find(t => t.key === 'setup'),
				TABS.find(t => t.key === 'scheduling'),
				TABS.find(t => t.key === 'scoring'),
				TABS.find(t => t.key === 'finalization')
			];
		}
		// Non-league (tournament) flow: Setup / Scoring /
		// Registration / Seeding / Finalization. The
		// `live` tab is gone — v0.4.26 collapsed the
		// single-tournament view into the Setup → Finalize
		// path so the wizard is shorter and the user does
		// not see a placeholder tab that does nothing.
		return TABS.filter(t =>
			t.key !== 'scheduling' &&
			t.key !== 'standings' &&
			t.key !== 'league' &&
			t.key !== 'live'
		);
	});

	// Clamp activeTab to a valid index whenever the visible set
	// changes (e.g. switching from create to watch, or toggling
	// league on).
	$effect(() => {
		if (activeTab >= visibleTabs.length) activeTab = Math.max(0, visibleTabs.length - 1);
	});

	function tabKey(i) {
		return visibleTabs[i]?.key;
	}
</script>

<div class="wizard">
	<nav class="wizard-tabs" role="tablist" aria-label="Competition sections">
		{#each visibleTabs as tab, i (tab.key)}
			<button
				role="tab"
				aria-selected={activeTab === i}
				aria-controls="wizard-panel-{tab.key}"
				id="wizard-tab-{tab.key}"
				class="wizard-tab"
				class:active={activeTab === i}
				class:disabled={mode === 'watch' && (tab.key === 'live' || tab.key === 'finalization') ? false : false}
				type="button"
				onclick={() => { activeTab = i; scrollToTop(); }}
			>
				<span class="wizard-tab-num">{i + 1}</span>
				<span class="wizard-tab-label">{tab.label}</span>
				<span class="wizard-tab-en">{tab.en}</span>
			</button>
		{/each}
	</nav>

	<div class="wizard-panel" role="tabpanel" id="wizard-panel-{tabKey(activeTab)}" aria-labelledby="wizard-tab-{tabKey(activeTab)}">
		{#if tabKey(activeTab) === 'setup'}
			<slot name="setup" />
		{:else if tabKey(activeTab) === 'scheduling'}
			<slot name="scheduling" />
		{:else if tabKey(activeTab) === 'standings'}
			<slot name="standings" />
		{:else if tabKey(activeTab) === 'scoring'}
			<slot name="scoring" />
		{:else if tabKey(activeTab) === 'registration'}
			<slot name="registration" />
		{:else if tabKey(activeTab) === 'seeding'}
			<slot name="seeding" />
		{:else if tabKey(activeTab) === 'live'}
			<slot name="live" />
		{:else if tabKey(activeTab) === 'finalization'}
			<slot name="finalization" />
		{:else if tabKey(activeTab) === 'league'}
			<slot name="league" />
		{/if}
	</div>

	<div class="wizard-nav">
		{#if mode === 'watch'}
			<!-- Watch mode has no Save / Next / Previous —
			     the live section is the only thing to
			     interact with. -->
		{:else}
			<button
				type="button"
				class="btn ghost"
				onclick={prev}
				disabled={activeTab === 0}
				aria-label="Previous section"
			>
				← Previous
			</button>
			<button
				type="button"
				class="wizard-close"
				onclick={onCancel}
				aria-label="Close wizard and discard changes"
				title="Close"
			>
				✕
			</button>
		{/if}
		<span class="wizard-position muted small">
			{activeTab + 1} / {visibleTabs.length}
		</span>
		{#if mode !== 'watch'}
			{#if activeTab < visibleTabs.length - 1}
				<button
					type="button"
					class="btn ghost"
					onclick={next}
					aria-label="Next section"
				>
					Next →
				</button>
			{:else}
				<!-- Last tab: the wizard hands the Save action
				     back to the host (CompetitionForm) so the
				     form's submit pipeline can validate,
				     drive the IDB save, etc. -->
				<button
					type="button"
					class="btn primary"
					onclick={onSave}
					aria-label="Save and finish"
				>
					{mode === 'edit' ? 'Save changes' : 'Finish and Save'}
				</button>
			{/if}
		{/if}
	</div>
</div>

<style>
	.wizard {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.wizard-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		border-bottom: 1px solid var(--line);
		padding-bottom: var(--space-sm);
	}
	.wizard-tab {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 6px 10px;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
		text-align: left;
		min-width: 0;
		flex: 1 1 11rem;
	}
	.wizard-tab.active {
		background: var(--surface);
		border-color: var(--accent);
		color: var(--text);
	}
	.wizard-tab:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.wizard-tab-num {
		font-size: var(--text-xs);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.wizard-tab-label {
		font-weight: 600;
	}
	.wizard-tab-en {
		font-size: var(--text-xs);
		color: var(--muted);
		font-style: italic;
	}
	.wizard-panel {
		min-height: 12rem;
	}
	.wizard-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding-top: var(--space-sm);
		border-top: 1px solid var(--line);
	}
	.wizard-nav .wizard-position {
		flex: 0 0 auto;
	}
	.wizard-close {
		background: #000;
		color: #fff;
		border: 1px solid var(--line);
		border-radius: 8px;
		width: 2.5rem;
		height: 2.5rem;
		font-size: 1.25rem;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.wizard-close:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@container app (min-width: 60rem) {
		.wizard-tab {
			flex: 0 1 auto;
		}
	}
</style>
