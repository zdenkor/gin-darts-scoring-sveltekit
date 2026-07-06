// =================================================================
// User settings wrapper backed by localStorage.
// Values are reactive via Svelte 5 runes in the component layer.
// =================================================================
const NS = 'gindarts:';

const DEFAULTS = Object.freeze({
  theme: 'auto',       // 'auto' | 'dark' | 'light'
  sound: false,
  vibration: false,
  language: 'en',      // 'en' | 'sk' | ...
  googleClientId: '',  // runtime override; also supported via window.GOOGLE_CLIENT_ID
  superadminEmails: '',
  statsCheckout: true,
});

function get(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function set(key, value) {
  try { localStorage.setItem(NS + key, JSON.stringify(value)); }
  catch (e) { console.warn('settings.set failed', e); }
}

export function loadAllSettings() {
  return {
    theme: get('theme', DEFAULTS.theme),
    sound: get('sound', DEFAULTS.sound),
    vibration: get('vibration', DEFAULTS.vibration),
    language: get('language', DEFAULTS.language),
    googleClientId: get('googleClientId', DEFAULTS.googleClientId),
    superadminEmails: get('superadminEmails', DEFAULTS.superadminEmails),
    statsCheckout: get('statsCheckout', DEFAULTS.statsCheckout),
  };
}

export function saveAllSettings(settings) {
  const merged = { ...DEFAULTS, ...(settings || {}) };
  for (const key of Object.keys(DEFAULTS)) {
    set(key, merged[key]);
  }
  return merged;
}

export function saveSetting(key, value) {
  if (!(key in DEFAULTS)) return;
  set(key, value);
}

export function loadSetting(key) {
  if (!(key in DEFAULTS)) return undefined;
  return get(key, DEFAULTS[key]);
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light');
  if (theme === 'dark') root.classList.add('theme-dark');
  else if (theme === 'light') root.classList.add('theme-light');
  // 'auto' uses system preference via CSS media query
}

export function getEffectiveGoogleClientId() {
  try {
    if (window.GOOGLE_CLIENT_ID) return window.GOOGLE_CLIENT_ID;
  } catch {}
  return loadSetting('googleClientId') || '';
}

export function getEffectiveSuperadminEmails() {
  try {
    if (window.SUPERADMIN_EMAILS) return window.SUPERADMIN_EMAILS;
  } catch {}
  return (loadSetting('superadminEmails') || '')
    .split(/[,\s]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}
