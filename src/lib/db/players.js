// =================================================================
// Tournament players — distinct from `users` (admin accounts).
// Registration number format: see memory / skill for rules.
// =================================================================
import { put, get, getAll, del } from './idb.js';

// 1+ uppercase letters, optional non-alphanumeric separator, exactly 6 digits.
const REG_NUMBER_RE = /^[A-Z]{1,10}[^A-Z0-9]?\d{6}$/;

export function normalizeRegNumber(input) {
  if (!input) return null;
  const s = String(input).trim().toUpperCase().replace(/\s+/g, '');
  if (!REG_NUMBER_RE.test(s)) return null;
  return s;
}

export function parseRegNumber(input) {
  const norm = normalizeRegNumber(input);
  if (!norm) return null;
  const m = norm.match(/^([A-Z]+)([^A-Z0-9]?)(\d{6})$/);
  if (!m) return null;
  return { clubCode: m[1], separator: m[2], serial: m[3], full: norm };
}

export async function savePlayer({
  id, firstName, surname, middleName, nameSuffixes, town, club, regNumber, regAuthority,
}) {
  const norm = normalizeRegNumber(regNumber);
  if (regNumber && !norm) {
    throw new Error('Invalid registration number. Expected format: CLUB#123456 (e.g. NR#100298).');
  }
  const payload = {
    firstName: (firstName || '').trim(),
    surname: (surname || '').trim(),
    middleName: (middleName || '').trim(),
    nameSuffixes: (nameSuffixes || '').trim(),
    town: (town || '').trim(),
    club: (club || '').trim(),
    regNumber: norm || '',
    regAuthority: (regAuthority || '').trim(),
    updatedAt: Date.now(),
  };
  if (id) payload.id = id;
  if (!payload.firstName && !payload.surname) {
    throw new Error('Player needs at least a first name or surname.');
  }
  return await put('players', payload);
}

export async function findByRegNumber(regNumber) {
  const norm = normalizeRegNumber(regNumber);
  if (!norm) return null;
  const all = await getAll('players');
  return all.find(p => p.regNumber === norm) || null;
}

export async function highestSerialForClub(clubCode) {
  if (!clubCode) return null;
  const cc = clubCode.toUpperCase();
  const all = await getAll('players');
  let max = -1;
  for (const p of all) {
    const parsed = parseRegNumber(p.regNumber);
    if (parsed && parsed.clubCode === cc) {
      const n = parseInt(parsed.serial, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max < 0 ? null : max;
}

export async function suggestNextRegNumber(clubCode) {
  const high = await highestSerialForClub(clubCode);
  const next = (high ?? 0) + 1;
  return `${clubCode.toUpperCase()}#${String(next).padStart(6, '0')}`;
}

export async function getPlayer(id) {
  return get('players', id);
}

export async function listPlayers() {
  return getAll('players');
}

export async function deletePlayer(id) {
  return del('players', id);
}
