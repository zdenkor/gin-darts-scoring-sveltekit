// Reactive auth state for SvelteKit (CSR-only).
import * as localAuth from '../auth/auth.js';
import * as googleAuth from '../auth/google.js';
import { seedIfEmpty } from '../db/idb.js';

class AuthState {
	user = $state(null);
	googleUser = $state(null);
	loading = $state(true);

	constructor() {
		this.restore();
	}

	async restore() {
		this.loading = true;
		try {
			await seedIfEmpty();
			// Local session
			const localSession = localAuth.currentUser();
			if (localSession?.id) {
				const u = await localAuth.userById(localSession.id);
				if (u) this.user = { ...u, source: 'local' };
			}
			// Google session (does not auto-restore expired tokens)
			if (await googleAuth.isSignedIn()) {
				this.googleUser = { ...googleAuth.currentUser(), source: 'google' };
			}
		} catch (e) {
			console.warn('auth restore failed', e);
		} finally {
			this.loading = false;
		}
	}

	get isSignedIn() {
		return !!this.user || !!this.googleUser;
	}

	get displayUser() {
		return this.googleUser || this.user;
	}

	get isAdmin() {
		return this.user?.role === 'admin' || googleAuth.isSuperadmin();
	}

	async localLogin(username, password) {
		const u = await localAuth.login({ username, password });
		this.user = { ...u, source: 'local' };
		return u;
	}

	async googleSignIn() {
		const u = await googleAuth.signIn();
		this.googleUser = { ...u, source: 'google' };
		return u;
	}

	async signOut() {
		if (this.googleUser) await googleAuth.signOut();
		if (this.user) localAuth.logout();
		this.user = null;
		this.googleUser = null;
	}
}

export const auth = new AuthState();
