<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { version } from '$app/environment';
	import { auth } from '$lib/state/auth.svelte.js';
	import { APP_VERSION } from '$lib/version.js';
	import {
		loadAllSettings, saveAllSettings, applyTheme,
		getEffectiveGoogleClientId, getEffectiveSuperadminEmails
	} from '$lib/util/settings.js';

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
				<label for="theme">Theme</label>
				<select id="theme" bind:value={s.theme}>
					{#each themes as t}
						<option value={t.value}>{t.label}</option>
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="language">Language</label>
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
				<span>Sound effects</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={s.vibration} />
				<span>Vibration on submit</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={s.statsCheckout} />
				<span>Show checkout stats</span>
			</label>
		</section>

		<section class="settings-section">
			<h2>Google sync</h2>
			<div class="field">
				<label for="clientId">Google Client ID (runtime override)</label>
				<input id="clientId" type="text" bind:value={s.googleClientId} placeholder={getEffectiveGoogleClientId() || 'Paste your OAuth Client ID'} />
				<p class="hint">Leave empty to use window.GOOGLE_CLIENT_ID from index.html.</p>
			</div>
			<div class="field">
				<label for="superadmin">Superadmin emails (comma separated)</label>
				<input id="superadmin" type="text" bind:value={s.superadminEmails} placeholder={getEffectiveSuperadminEmails().join(', ') || 'admin@example.com'} />
				<p class="hint">Leave empty to use window.SUPERADMIN_EMAILS.</p>
			</div>
		</section>

		<section class="settings-section">
			<h2>Account</h2>
			{#if auth.user}
				<p class="muted">Signed in as <strong>{auth.user.username || auth.user.email}</strong> ({auth.user.role}).</p>
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
			<p class="muted">Version <strong>{APP_VERSION}</strong></p>
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
