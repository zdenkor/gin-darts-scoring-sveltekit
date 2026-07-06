// =================================================================
// Google authentication using Google Identity Services (GIS).
// Implicit flow (initTokenClient). No token-exchange, no client_secret.
// =================================================================
import { GOOGLE_SCOPES, GOOGLE_TOKEN_KEY } from '../config.js';
import { put, get, del } from '../db/idb.js';

const CLIENT_ID_STORAGE_KEY = 'gindarts:google-client-id';

export function getClientId() {
  if (typeof localStorage === 'undefined') return '';
  try {
    const ls = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (ls && ls.length > 0 && !ls.startsWith('REPLACE_ME')) return ls;
  } catch (_) { /* ignore */ }
  if (typeof window !== 'undefined' && window.GOOGLE_CLIENT_ID && !window.GOOGLE_CLIENT_ID.startsWith('REPLACE_ME')) {
    return window.GOOGLE_CLIENT_ID;
  }
  return '';
}
export function setClientId(id) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(CLIENT_ID_STORAGE_KEY, (id || '').trim()); } catch (_) {}
}
export function clearClientId() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(CLIENT_ID_STORAGE_KEY); } catch (_) {}
}

export function getSuperadminEmails() {
  if (typeof window === 'undefined') return [];
  const list = window.SUPERADMIN_EMAILS;
  if (Array.isArray(list)) return list.map(s => String(s).toLowerCase().trim());
  return [];
}

let _accessToken = null;
let _accessTokenExpiresAt = 0;
let _user = null;
let _ready = null;

async function saveTokens(t) { await put(GOOGLE_TOKEN_KEY, t, GOOGLE_TOKEN_KEY); }
async function loadTokens() { return await get(GOOGLE_TOKEN_KEY, GOOGLE_TOKEN_KEY); }
async function clearTokens() { await del(GOOGLE_TOKEN_KEY, GOOGLE_TOKEN_KEY); }

export async function isSignedIn() {
  if (_ready) return _ready;
  _ready = (async () => {
    const t = await loadTokens();
    if (!t || !t.access_token) return false;
    if (t.expires_at && Date.now() < t.expires_at) {
      _accessToken = t.access_token;
      _accessTokenExpiresAt = t.expires_at;
      _user = t.user || null;
      return !!_user;
    }
    await clearTokens();
    return false;
  })();
  return _ready;
}

export function currentUser() { return _user; }

export function isSuperadmin() {
  const me = _user?.email;
  if (!me) return false;
  return getSuperadminEmails().includes(me.toLowerCase().trim());
}

export async function getAccessToken() {
  if (!_accessToken || Date.now() >= _accessTokenExpiresAt) {
    throw new Error('not-signed-in');
  }
  return _accessToken;
}

let _gisPromise = null;
function loadGIS() {
  if (_gisPromise) return _gisPromise;
  _gisPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error('GIS loaded but oauth2 missing'));
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return _gisPromise;
}

export async function signIn() {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Google sign-in not configured. Tap "Set up Google sign-in" to paste your Client ID.');
  }
  const gis = await loadGIS();
  const client = gis.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: '',
  });

  const tokenResp = await new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error + (resp.error_description ? ': ' + resp.error_description : '')));
      if (!resp.access_token) return reject(new Error('no access token in response'));
      resolve(resp);
    };
    client.requestAccessToken();
  });

  _accessToken = tokenResp.access_token;
  const expiresIn = tokenResp.expires_in || 3600;
  _accessTokenExpiresAt = Date.now() + expiresIn * 1000 - 60_000;

  const authHeader = 'Bearer ' + _accessToken;
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: authHeader },
  });
  if (!profileRes.ok) {
    const text = await profileRes.text();
    throw new Error('profile fetch failed: ' + profileRes.status + ' — ' + text);
  }
  const profile = await profileRes.json();
  _user = { id: profile.id, email: profile.email, name: profile.name, picture: profile.picture };

  await saveTokens({
    access_token: _accessToken,
    expires_at: _accessTokenExpiresAt,
    user: _user,
  });

  _ready = Promise.resolve(true);

  try {
    const sync = await import('./sync.js');
    const counts = await sync.pullAll();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gindarts:drive-pulled', { detail: counts }));
    }
  } catch (e) {
    console.warn('Drive pull after sign-in failed', e);
  }

  return _user;
}

export async function signOut() {
  try {
    if (_accessToken) {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + _accessToken, { method: 'POST' });
    }
  } catch (e) { console.warn('revoke failed', e); }
  _accessToken = null;
  _accessTokenExpiresAt = 0;
  _user = null;
  _ready = Promise.resolve(false);
  await clearTokens();
}

export async function authedFetch(url, opts = {}) {
  const token = await getAccessToken();
  const headers = new Headers(opts.headers || {});
  headers.set('Authorization', 'Bearer ' + token);
  return fetch(url, { ...opts, headers });
}
