// =================================================================
// Google Drive sync for competitions. Writes JSON files to the user's
// hidden appDataFolder. drive.file scope = only files the app creates.
// =================================================================
import {
  DRIVE_FOLDER_COMPETITIONS,
  DRIVE_FOLDER_MATCHES,
  DRIVE_FOLDER_HISTORY,
  DRIVE_MANIFEST_FILE,
  DRIVE_SCHEMA_VERSION,
} from '../config.js';
import { authedFetch, isSignedIn } from './google.js';
import { put } from '../db/idb.js';

function nameFor(scope, ...parts) {
  return `${scope}__${parts.join('__')}.json`;
}
function matchPrefix(scope) {
  return `${scope}__`;
}
function extractAfterPrefix(name, scope) {
  const prefix = matchPrefix(scope);
  if (!name.startsWith(prefix)) return null;
  if (!name.endsWith('.json')) return null;
  return name.substring(prefix.length, name.length - '.json'.length);
}

async function listByPrefix(prefix) {
  const all = [];
  let pageToken = null;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `name >= '${prefix}' and name < '${prefix}~' and 'appDataFolder' in parents and trashed = false`);
    url.searchParams.set('fields', 'files(id,name),nextPageToken');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await authedFetch(url);
    if (!r.ok) {
      const text = await r.text();
      throw new Error('listByPrefix failed: ' + r.status + ' — ' + text);
    }
    const data = await r.json();
    for (const f of data.files || []) all.push(f);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

async function findByName(name) {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `name = '${name}' and 'appDataFolder' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id)');
  const r = await authedFetch(url);
  if (!r.ok) {
    const text = await r.text();
    throw new Error('findByName failed: ' + r.status + ' — ' + text);
  }
  const data = await r.json();
  return data.files?.[0]?.id || null;
}

async function downloadJsonFile(id) {
  const r = await authedFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('download failed: ' + r.status);
  return r.json();
}

async function upsertJsonFile(name, data) {
  const body = JSON.stringify(data);
  const existing = await findByName(name);
  if (existing) {
    const r = await authedFetch(`https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error('upsert update failed: ' + r.status + ' — ' + text);
    }
    return (await r.json()).id;
  }
  const meta = { name, parents: ['appDataFolder'] };
  const boundary = '-------gindarts' + Math.random().toString(36).slice(2);
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(meta) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    body + `\r\n` +
    `--${boundary}--`;
  const r = await authedFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error('upsert create failed: ' + r.status + ' — ' + text);
  }
  return (await r.json()).id;
}

async function deleteFile(id) {
  if (!id) return;
  const r = await authedFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
  if (r.status !== 204 && r.status !== 404) {
    const text = await r.text();
    throw new Error('delete failed: ' + r.status + ' — ' + text);
  }
}

export async function pushCompetition(competition, matches = [], history = []) {
  if (!(await isSignedIn())) return;
  await upsertJsonFile(nameFor(DRIVE_FOLDER_COMPETITIONS, competition.id), {
    schema: DRIVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    competition,
  });
  for (const m of matches) {
    await upsertJsonFile(nameFor(DRIVE_FOLDER_MATCHES, competition.id, m.id), {
      schema: DRIVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      match: m,
    });
  }
  for (const h of history) {
    await upsertJsonFile(nameFor(DRIVE_FOLDER_HISTORY, competition.id, h.id), {
      schema: DRIVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      history: h,
    });
  }
  await upsertJsonFile(DRIVE_MANIFEST_FILE, {
    schema: DRIVE_SCHEMA_VERSION,
    lastSyncAt: Date.now(),
  });
}

export async function pushMatch(competitionId, match, history = []) {
  if (!(await isSignedIn())) return;
  await upsertJsonFile(nameFor(DRIVE_FOLDER_MATCHES, competitionId, match.id), {
    schema: DRIVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    match,
  });
  for (const h of history) {
    await upsertJsonFile(nameFor(DRIVE_FOLDER_HISTORY, competitionId, match.id, h.id), {
      schema: DRIVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      history: h,
    });
  }
}

export async function pullAll() {
  if (!(await isSignedIn())) return { competitions: 0, matches: 0, histories: 0 };
  const counts = { competitions: 0, matches: 0, histories: 0 };

  const compFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_COMPETITIONS));
  for (const f of compFiles) {
    const data = await downloadJsonFile(f.id);
    if (data?.competition) {
      await put('competitions', { ...data.competition, _fromDrive: true, _driveSavedAt: data.savedAt });
      counts.competitions++;
    }
  }

  const matchFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_MATCHES));
  for (const f of matchFiles) {
    const data = await downloadJsonFile(f.id);
    if (data?.match) {
      await put('matches', { ...data.match, _fromDrive: true, _driveSavedAt: data.savedAt });
      counts.matches++;
    }
  }

  const histFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_HISTORY));
  for (const f of histFiles) {
    const data = await downloadJsonFile(f.id);
    if (data?.history) {
      const g = { ...data.history, _fromDrive: true, _driveSavedAt: data.savedAt };
      delete g.id;
      await put('games', g);
      counts.histories++;
    }
  }
  return counts;
}

export async function deleteCompetition(competitionId) {
  if (!(await isSignedIn())) return;
  const compId = await findByName(nameFor(DRIVE_FOLDER_COMPETITIONS, competitionId));
  if (compId) await deleteFile(compId);

  const matchFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_MATCHES));
  for (const f of matchFiles) {
    const tail = extractAfterPrefix(f.name, DRIVE_FOLDER_MATCHES);
    if (!tail) continue;
    const [compIdStr] = tail.split('__');
    if (String(competitionId) === compIdStr) await deleteFile(f.id);
  }

  const histFiles = await listByPrefix(matchPrefix(DRIVE_FOLDER_HISTORY));
  for (const f of histFiles) {
    const tail = extractAfterPrefix(f.name, DRIVE_FOLDER_HISTORY);
    if (!tail) continue;
    const [compIdStr] = tail.split('__');
    if (String(competitionId) === compIdStr) await deleteFile(f.id);
  }
}

const _dirty = new Set();
export function markDirty(key) { _dirty.add(key); }
export function clearDirty(key) { _dirty.delete(key); }
export function dirtyKeys() { return [..._dirty]; }
