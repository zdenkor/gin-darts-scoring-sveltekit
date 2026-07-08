<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { version } from '$app/environment';
	import { auth } from '$lib/state/auth.svelte.js';
	import { APP_VERSION } from '$lib/version.js';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';
	import {
		loadAllSettings, saveAllSettings, applyTheme,
		getEffectiveGoogleClientId, getEffectiveSuperadminEmails
	} from '$lib/util/settings.js';
	import { setHelpVisible } from '$lib/util/help.js';

	let s = $state(loadAllSettings());
	let saved = $state(false);

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
	});
</script>

<div class="screen">
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
				<p class="muted">Not signed in. Admin features are disabled.</p>
				<a class="btn primary" href="{base}/login">Sign in</a>
			{/if}
		</section>

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
</style>
