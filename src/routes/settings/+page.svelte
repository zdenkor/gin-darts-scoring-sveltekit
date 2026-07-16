<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { version } from '$app/environment';
	import { auth } from '$lib/state/auth.svelte.js';
	import { APP_VERSION } from '$lib/version.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';
	import { getStoredKeypair, shortNpub } from '$lib/nostr/identity.js';
	// nip19 (NIP-19 bech32) gives us the canonical
	// `npub1...` form of a public key for display in
	// Settings → Account. We import it from the main
	// entry of nostr-tools, not /pure, because /pure
	// deliberately doesn't ship bech32 to keep the
	// bundle small. Settings is rare-to-load so the
	// extra weight is fine.
	import { nip19 } from 'nostr-tools';
	import {
		loadAllSettings, saveAllSettings, applyTheme,
		getEffectiveGoogleClientId, getEffectiveSuperadminEmails
	} from '$lib/util/settings.js';
	import { setHelpVisible } from '$lib/util/help.js';
	import { LOG_CATEGORIES, LOG_CATEGORY_LABELS } from '$lib/debug/categories.js';
	import { isCategoryEnabled, setCategoryEnabled } from '$lib/debug/settings.js';
	import { invalidateLogCache, clearLogs } from '$lib/debug/logger.js';
	import {
		getInspectorSettings, setInspectorEnabled, setInspectorShow, setInspectorDisplay,
		startElementInspector, stopElementInspector
	} from '$lib/debug/elementInspector.js';
	import LogsModal from '$lib/ui/LogsModal.svelte';
	import {
		parseSVKListText, importSVKList, getSVKCacheStats,
		clearSVKCache, searchSVKCache
	} from '$lib/auth/svk.js';

	let s = $state(loadAllSettings());
	let saved = $state(false);
	// NOSTR identity state for the Account section.
	// Recomputed on mount; the keypair is only created
	// at sign-in time, so we read it lazily.
	let nostrKey = $state(/** @type {any} */ (null));
	// Bech32 npub, computed from the hex pubkey. We
	// try/catch because a malformed pubkey (e.g. wrong
	// length) would throw in nip19.npubEncode.
	let npub = $derived.by(() => {
		if (!nostrKey?.publicKey) return '';
		try { return nip19.npubEncode(nostrKey.publicKey); } catch { return nostrKey.publicKey; }
	});
	// Which row's Copy button we just clicked. Reset
	// to '' after a short timeout so the button can
	// flip back from "Copied!" to "Copy".
	let copyState = $state(/** @type {'' | 'npub' | 'hex'} */ (''));
	async function copyToClipboard(/** @type {string} */ value) {
		const which = value === npub ? 'npub' : 'hex';
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
			} else {
				// Fallback for very old browsers that
				// don't expose the async clipboard API.
				const ta = document.createElement('textarea');
				ta.value = value;
				document.body.appendChild(ta);
				ta.select();
				document.execCommand('copy');
				document.body.removeChild(ta);
			}
			copyState = which;
			setTimeout(() => { copyState = ''; }, 1500);
		} catch (e) {
			alert('Copy failed: ' + (e?.message || e));
		}
	}
	// SVK import state.
	let svkPaste = $state('');
	let svkStats = $state(/** @type {{count:number,lastImportedAt:number|null}} */ ({ count: 0, lastImportedAt: null }));
	let svkImporting = $state(false);
	let svkMessage = $state(/** @type {string} */ (''));
	// Debug — re-render-friendly copy of the per-category
	// toggles. We mirror the localStorage-backed settings
	// so the UI updates immediately when a toggle changes.
	let debugEnabled = $state(/** @type {Record<string, boolean>} */ (
		Object.fromEntries(LOG_CATEGORIES.map((c) => [c, isCategoryEnabled(c)]))
	));
	let logsModalOpen = $state(false);
	function toggleDebugCategory(/** @type {string} */ cat, /** @type {boolean} */ on) {
		setCategoryEnabled(cat, on);
		debugEnabled = { ...debugEnabled, [cat]: on };
		// The logger keeps an in-memory cache, so we drop
		// it on toggle to make sure the next log() call
		// re-checks the on/off flag.
		invalidateLogCache();
	}
	// Element inspector — localStorage-backed toggle
	// plus a sub-form for which DOM fields to show on
	// hover. Default OFF (a developer-only helper; the
	// user has to opt in). See
	// $lib/debug/elementInspector.js.
	let inspector = $state(getInspectorSettings());
	function toggleInspector(/** @type {boolean} */ on) {
		setInspectorEnabled(on);
		inspector = { ...inspector, enabled: on };
		if (on) startElementInspector();
		else stopElementInspector();
	}
	function toggleInspectorShow(/** @type {string} */ key, /** @type {boolean} */ on) {
		const next = { ...inspector.show, [key]: on };
		setInspectorShow({ [key]: on });
		inspector = { ...inspector, show: next };
		// The settings object is re-read on every
		// mouseover via getInspectorSettings(), so the
		// change is picked up on the next hover. No
		// restart needed.
	}
	function setInspectorDisplayMode(/** @type {'tooltip' | 'sidebar'} */ mode) {
		if (mode !== 'tooltip' && mode !== 'sidebar') return;
		setInspectorDisplay(mode);
		inspector = { ...inspector, display: mode };
		// Re-start so the existing listener pair is
		// torn down and a fresh one is installed with
		// the new display mode's DOM node + class.
		if (inspector.enabled) {
			stopElementInspector();
			startElementInspector();
		}
	}
	// SVK search state (used by both the import preview and the
	// player picker in /competitions — the picker uses its own
	// local state, this is just the settings-panel preview).
	let svkPreviewQuery = $state('');
	let svkPreviewResults = $state(/** @type {any[]} */ ([]));

	const themes = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' },
	];
	const languages = [
		{ value: 'en', label: 'English' },
		{ value: 'sk', label: 'Slovenčina' },
	];

	function back() {
		goto(`${base}/`);
	}

	function save() {
		saveAllSettings(s);
		applyTheme(s.theme);
		setHelpVisible(s.showHelp);
		saved = true;
		setTimeout(() => (saved = false), 1500);
	}

	function clearLocalData() {
		if (!confirm('Clear all local game history, stats and settings? This cannot be undone.')) return;
		try {
			localStorage.clear();
			indexedDB.deleteDatabase('gindarts-app-v1');
		} catch {}
		window.location.reload();
	}

	onMount(() => {
		applyTheme(s.theme);
		refreshSVKStats();
		// Hydrate NOSTR keypair for the Account section.
		// Anonymous users (no sign-in) get an empty
		// Account card explaining how to get one.
		try {
			nostrKey = getStoredKeypair();
		} catch {
			nostrKey = null;
		}
		// The element inspector is started in
		// +layout.svelte on mount, so the same listener
		// pair survives navigation. The Settings page
		// only owns the toggle / display-mode controls.
	});

	async function refreshSVKStats() {
		svkStats = await getSVKCacheStats();
	}

	async function doImportSVK() {
		if (svkImporting) return;
		svkMessage = '';
		const rows = parseSVKListText(svkPaste);
		if (rows.length === 0) {
			svkMessage = 'No rows parsed. Copy rows from the SVK portal table (Ctrl+A inside the table, Ctrl+C, paste here).';
			return;
		}
		svkImporting = true;
		try {
			const res = await importSVKList(rows);
			svkMessage = `Imported ${res.imported} of ${res.total} players.`;
			svkPaste = '';
			await refreshSVKStats();
		} catch (e) {
			svkMessage = 'Import failed: ' + (e?.message || e);
		} finally {
			svkImporting = false;
		}
	}

	async function doClearSVK() {
		if (!confirm('Clear the SVK cache? Imported players will be removed from this device.')) return;
		await clearSVKCache();
		svkMessage = 'SVK cache cleared.';
		svkPreviewResults = [];
		await refreshSVKStats();
	}

	let svkPreviewTimer = null;
	function onSVKPreviewInput() {
		if (svkPreviewTimer) clearTimeout(svkPreviewTimer);
		const q = svkPreviewQuery.trim();
		if (!q) {
			svkPreviewResults = [];
			return;
		}
		// Debounce: 200 ms is enough for a local IndexedDB scan and
		// keeps the UI snappy while typing.
		svkPreviewTimer = setTimeout(async () => {
			// Try surname+firstName split; fall back to a single-
			// string substring match so a user typing "Nov" or
			// "Ján No" both find the right rows.
			const parts = q.split(/\s+/);
			const surname = parts[0] || '';
			const firstName = parts.slice(1).join(' ');
			svkPreviewResults = await searchSVKCache({ surname, firstName });
		}, 200);
	}
</script>

<div class="screen scrollable">
	<form class="card" onsubmit={(e) => { e.preventDefault(); save(); }}>
		<div class="card-header">
			<h1>Settings</h1>
			<button type="button" class="btn ghost" onclick={back}>Back</button>
		</div>

		<section class="settings-section">
			<h2>Appearance</h2>
			<div class="field">
				<label for="theme">Theme<HelpIcon topic="Theme" body="Auto follows your phone or system setting. Dark is the default for the app, Light is the bright alternative." /></label>
				<select id="theme" bind:value={s.theme}>
					{#each themes as t}
						<option value={t.value}>{t.label}</option>
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="language">Language<HelpIcon topic="Language" body="Switch the UI between English and Slovenčina. Only labels and a handful of messages are translated; the rest of the app stays in English." /></label>
				<select id="language" bind:value={s.language}>
					{#each languages as l}
						<option value={l.value}>{l.label}</option>
					{/each}
				</select>
			</div>
		</section>

		<section class="settings-section">
			<h2>Game</h2>
			<label class="checkbox">
				<input type="checkbox" bind:checked={s.sound} />
				<span>Sound effects<HelpIcon topic="Sound effects" body="Plays a soft click and a win tone. Useful on desktop; mobile users usually prefer vibration." /></span>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={s.vibration} />
				<span>Vibration on submit<HelpIcon topic="Vibration on submit" body="Short vibration when a throw is committed. Only works on devices with a vibration motor (most phones)." /></span>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={s.statsCheckout} />
				<span>Show checkout stats<HelpIcon topic="Show checkout stats" body="When on, the Stats screen shows the Checkout section (highest checkout, 100+ count, checkout %)." /></span>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={s.askCheckout} />
				<span>Ask checkout attempts<HelpIcon topic="Ask checkout attempts" body="When a throw could have aimed at a close-out, a small modal asks how many of your 3 darts were aimed there. The answer goes to your stats. Turn off to auto-record the maximum without asking." /></span>
			</label>
		</section>

		<section class="settings-section">
			<h2>Help</h2>
			<label class="checkbox">
				<input type="checkbox" bind:checked={s.showHelp} />
				<span>Show help icons<HelpIcon topic="Show help icons" body="When on, small ⓘ icons appear next to labels across the app. Tap (or hover on desktop) for a short explanation of what the field does. When off, the icons stay hidden." /></span>
			</label>
		</section>

		<section class="settings-section">
			<h2>Google sync</h2>
			<div class="field">
				<label for="clientId">Google Client ID (runtime override)<HelpIcon topic="Google Client ID" body="Paste your own OAuth Web Client ID here to use a Google Cloud project other than the one bundled in the app. Most users can leave this empty — the default Client ID works for the public deployment." /></label>
				<input id="clientId" type="text" bind:value={s.googleClientId} placeholder={getEffectiveGoogleClientId() || 'Paste your OAuth Client ID'} />
				<p class="hint">Leave empty to use window.GOOGLE_CLIENT_ID from index.html.</p>
			</div>
			<div class="field">
				<label for="superadmin">Superadmin emails (comma separated)<HelpIcon topic="Superadmin emails" body="Google accounts in this list get admin powers on this device. Used to gate the dev-only sign-in for the app owner. Leave empty to use the built-in superadmin list." /></label>
				<input id="superadmin" type="text" bind:value={s.superadminEmails} placeholder={getEffectiveSuperadminEmails().join(', ') || 'admin@example.com'} />
				<p class="hint">Leave empty to use window.SUPERADMIN_EMAILS.</p>
			</div>
		</section>

		<section class="settings-section">
			<h2>Account</h2>
			{#if auth.user}
				<p class="muted">Signed in as <strong>{auth.user.username || auth.user.email}</strong> ({auth.user.role}).<HelpIcon topic="Account" body="This shows the local IndexedDB account you're signed in as. Click Open admin panel if you're an admin to manage other users. Sign out clears the local session and returns to the Sign in screen." /></p>
				{#if auth.user.role === 'admin' || auth.user.role === 'superadmin'}
					<a class="btn" href="{base}/admin">Open admin panel</a>
				{/if}
				<button class="btn ghost" onclick={() => auth.signOut()}>Sign out</button>
			{:else}
				<!-- The "Not signed in" copy + the big Sign
				     in button used to live here, but they
				     made Account feel like a Sign-in screen
				     for users who never intend to sign in.
				     The header already has a Sign in icon
				     for that case. Account now just shows
				     NOSTR identity details for the signed-
				     in user, and stays out of the way
				     otherwise. -->
				<p class="muted">No account signed in on this device.</p>
			{/if}
			<!-- NOSTR identity. The header used to show
			     a short npub pill; we moved the full
			     key + copy affordance here where it has
			     room to breathe. -->
			{#if nostrKey}
				<div class="nostr-id">
					<label class="nostr-label">NOSTR public key (npub)</label>
					<div class="nostr-row">
						<code class="nostr-code" title={nostrKey.publicKey}>{npub}</code>
						<button
							type="button"
							class="btn ghost small"
							onclick={() => copyToClipboard(npub)}
						>
							{copyState === 'npub' ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<label class="nostr-label">Hex (raw 64-char pubkey)</label>
					<div class="nostr-row">
						<code class="nostr-code nostr-code-hex" title={nostrKey.publicKey}>{nostrKey.publicKey}</code>
						<button
							type="button"
							class="btn ghost small"
							onclick={() => copyToClipboard(nostrKey.publicKey)}
						>
							{copyState === 'hex' ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<p class="hint">Short: {shortNpub(nostrKey.publicKey)}. This NOSTR identity is what other players see when you publish tournaments to the calendar.</p>
				</div>
			{:else}
				<p class="hint">NOSTR identity is generated on first sign-in. Sign in to get a keypair so you can publish tournaments and delete your own events.</p>
			{/if}
		</section>

		<section class="settings-section">
			<h2>SVK license list<HelpIcon topic="SVK import" body="The Slovak darts federation (SVK) portal has no CORS headers, so the app can't fetch it directly. Instead, you copy the licence table once from the portal and paste it here. The import is stored in the local svk_players IndexedDB store. After import, the player picker in /competitions can search this cache by name." /></h2>
			<p class="hint">Import the SVK licence list once. Steps: open the portal, Ctrl+A inside the table, Ctrl+C, then paste below and click Import.</p>
			<textarea
				class="svk-paste"
				bind:value={svkPaste}
				placeholder="Paste rows from https://portal.slovaksteeldarts.sk/licencie here…"
				rows="6"
				aria-label="SVK licence list paste area"
			></textarea>
			<div class="row">
				<button type="button" class="btn primary" disabled={svkImporting || !svkPaste} onclick={doImportSVK}>
					{svkImporting ? 'Importing…' : 'Import'}
				</button>
				<button type="button" class="btn ghost" disabled={!svkStats.count} onclick={doClearSVK}>
					Clear cache
				</button>
				<span class="muted svk-stats">
					{svkStats.count} player{svkStats.count === 1 ? '' : 's'} in cache
					{#if svkStats.lastImportedAt}
						· last import {new Date(svkStats.lastImportedAt).toLocaleString()}
					{/if}
				</span>
			</div>
			{#if svkMessage}
				<p class="hint svk-msg">{svkMessage}</p>
			{/if}

			{#if svkStats.count > 0}
				<details class="svk-preview">
					<summary>Test search ({svkStats.count} cached)</summary>
					<input
						type="text"
						bind:value={svkPreviewQuery}
						oninput={onSVKPreviewInput}
						placeholder="Type a name, e.g. 'Novák' or 'Ján Nov'"
						aria-label="SVK cache search preview"
					/>
					{#if svkPreviewResults.length > 0}
						<ul class="svk-list">
							{#each svkPreviewResults as r (r.svkId || `${r.surname}-${r.firstName}`)}
								<li>
									<strong>{r.surname} {r.firstName}</strong>
									{#if r.town}<span class="muted"> · {r.town}</span>{/if}
									{#if r.club}<span class="muted"> · {r.club}</span>{/if}
									{#if r.svkId}<span class="muted svk-id"> · #{r.svkId}</span>{/if}
								</li>
							{/each}
						</ul>
					{:else if svkPreviewQuery.trim()}
						<p class="hint">No matches for "{svkPreviewQuery}".</p>
					{/if}
				</details>
			{/if}
		</section>

		<section class="settings-section">
			<h2>Debug<HelpIcon topic="Debug logs" body="Each category logs to a private IndexedDB store when its toggle is on. The View Logs button opens a modal with a tab per category; entries are newest first. Toggling a category off prevents new entries from being written but does not delete existing ones — use the Clear button in the modal to wipe a category." /></h2>
			{#each LOG_CATEGORIES as cat (cat)}
				<label class="checkbox">
					<input
						type="checkbox"
						checked={debugEnabled[cat]}
						onchange={(e) => toggleDebugCategory(cat, /** @type {HTMLInputElement} */ (e.currentTarget).checked)}
					/>
					<span>{LOG_CATEGORY_LABELS[cat]}</span>
				</label>
			{/each}
			<button class="btn" type="button" onclick={() => (logsModalOpen = true)}>View logs</button>

			<!-- Element inspector. When ON, hovering any
			     DOM element shows a tooltip with the
			     selected fields. The user can pick which
			     fields and whether to walk N levels up
			     (parent) / down (child). Default OFF —
			     developer-only. -->
			<details class="inspector-section">
				<summary>Element inspector</summary>
				<label class="checkbox">
					<input
						type="checkbox"
						checked={inspector.enabled}
						onchange={(e) => toggleInspector(/** @type {HTMLInputElement} */ (e.currentTarget).checked)}
					/>
					<span>Show element information<HelpIcon topic="Element inspector" body="When on, hovering any element shows a tooltip with the DOM details you select below. The hovered element is also outlined. Default off — turn off when you don't need it." /></span>
				</label>
				{#if inspector.enabled}
					<div class="inspector-subform">
						<p class="muted small">Display as:</p>
						<label class="checkbox">
							<input
								type="radio"
								name="inspector-display"
								checked={inspector.display === 'tooltip'}
								onchange={() => setInspectorDisplayMode('tooltip')}
							/>
							<span>Tooltip<HelpIcon topic="Tooltip" body="A small floating box that follows the cursor. Default; good for quick checks." /></span>
						</label>
						<label class="checkbox">
							<input
								type="radio"
								name="inspector-display"
								checked={inspector.display === 'sidebar'}
								onchange={() => setInspectorDisplayMode('sidebar')}
							/>
							<span>Sidebar<HelpIcon topic="Sidebar" body="A fixed 320px panel on the right edge. The hovered element is scrolled into view. The last read-out stays visible after the cursor leaves so you can scroll around without losing it." /></span>
						</label>
						<p class="muted small">Show these fields in the tooltip:</p>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.tag} onchange={(e) => toggleInspectorShow('tag', e.currentTarget.checked)} />
							<span>Tag</span>
						</label>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.class} onchange={(e) => toggleInspectorShow('class', e.currentTarget.checked)} />
							<span>Class</span>
						</label>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.id} onchange={(e) => toggleInspectorShow('id', e.currentTarget.checked)} />
							<span>ID</span>
						</label>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.dataAttrs} onchange={(e) => toggleInspectorShow('dataAttrs', e.currentTarget.checked)} />
							<span>Data attributes</span>
						</label>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.html} onchange={(e) => toggleInspectorShow('html', e.currentTarget.checked)} />
							<span>HTML snippet</span>
						</label>
						<p class="muted small">Walk to related elements:</p>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.parent1} onchange={(e) => toggleInspectorShow('parent1', e.currentTarget.checked)} />
							<span>Parent (1 level up)</span>
						</label>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.parent2} onchange={(e) => toggleInspectorShow('parent2', e.currentTarget.checked)} />
							<span>Parent (2 levels up — grandparent)</span>
						</label>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.child1} onchange={(e) => toggleInspectorShow('child1', e.currentTarget.checked)} />
							<span>Child (1 level down)</span>
						</label>
						<label class="checkbox">
							<input type="checkbox" checked={inspector.show.child2} onchange={(e) => toggleInspectorShow('child2', e.currentTarget.checked)} />
							<span>Child (2 levels down)</span>
						</label>
					</div>
				{/if}
			</details>
		</section>

		<LogsModal open={logsModalOpen} onClose={() => (logsModalOpen = false)} />

		<section class="settings-section danger-zone">
			<h2>Data</h2>
			<button class="btn danger" onclick={clearLocalData}>Clear all local data</button>
		</section>

		<section class="settings-section">
			<h2>About</h2>
			<p class="muted">Version <strong>{APP_VERSION}</strong><HelpIcon topic="Version" body="The app version is bumped on every commit. The format is MAJOR.MINOR.PATCH where PATCH increments per user-facing change. New versions deploy automatically via GitHub Pages on push to main." /></p>
			<p class="muted">Build env: {version ? 'production' : 'development'}</p>
		</section>

		<div class="form-actions">
			<button type="submit" class="btn primary">{saved ? 'Saved!' : 'Save settings'}</button>
		</div>
	</form>
</div>

<style>
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-md);
	}
	.card-header h1 { margin: 0; }

	.settings-section {
		margin-bottom: var(--space-lg);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--line);
	}
	.settings-section:last-of-type {
		border-bottom: none;
	}
	.settings-section h2 {
		margin: 0 0 var(--space-sm);
		font-size: var(--text-md);
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
		cursor: pointer;
	}
	.checkbox input {
		width: 1.2em;
		height: 1.2em;
		accent-color: var(--accent);
		min-height: auto;
	}
	.checkbox span { color: var(--text); }

	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-md);
	}

	.muted { color: var(--muted); }

	.danger-zone .btn.danger { width: 100%; }
@container app (min-width: 480px) {
		.danger-zone .btn.danger { width: auto; }
	}

	/* SVK import section */
	.svk-paste {
		width: 100%;
		min-height: 8rem;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: var(--space-sm);
		color: var(--text);
		font: inherit;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: var(--text-sm);
		resize: vertical;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		align-items: center;
		margin: var(--space-sm) 0;
	}
	.svk-stats { font-size: var(--text-sm); }
	.svk-msg { color: var(--accent); }
	.svk-preview { margin-top: var(--space-sm); }
	.svk-preview summary { cursor: pointer; color: var(--muted); }
	/* Element inspector sub-form. The <details> keeps
	   the section collapsed by default so the Settings
	   page doesn't grow; clicking "Element inspector"
	   reveals the on/off toggle plus the per-field
	   checkboxes. The sub-form is just nested labels,
	   so the existing .checkbox styling applies without
	   extra CSS. */
	.inspector-section {
		margin-top: var(--space-sm);
		border-top: 1px solid var(--line);
		padding-top: var(--space-sm);
	}
	.inspector-section > summary {
		cursor: pointer;
		color: var(--muted);
		font-size: var(--text-sm);
		padding: 4px 0;
	}
	.inspector-subform {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: var(--space-sm);
		padding-left: var(--space-md);
	}
	.svk-preview input {
		width: 100%;
		margin: var(--space-sm) 0;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: var(--space-sm);
		color: var(--text);
		font: inherit;
	}
	.svk-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.svk-list li {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 6px 10px;
	}
	.svk-id { font-size: var(--text-xs); }

	/* TV / large viewports (60rem+). Bump up paste area, hit
	   targets, and list padding so the form is comfortable to
	   read from across the room. */
	@container app (min-width: 60rem) {
		.svk-paste {
			min-height: 14rem;
			font-size: var(--text-md);
		}
		.svk-list li {
			padding: 14px 18px;
			font-size: var(--text-md);
		}
		.svk-preview input {
			min-height: 3rem;
			font-size: var(--text-md);
		}
	}
</style>
