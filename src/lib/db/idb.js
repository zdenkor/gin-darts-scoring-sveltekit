// =================================================================
// IndexedDB wrapper for the SvelteKit PWA.
// Schema mirrors the original vanilla app but exports idiomatic
// async helpers.
// =================================================================

const DB_NAME = 'gindarts';
const DB_VERSION = 6;

let _dbPromise = null;

export function openDB() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('indexedDB not available'));
  }
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      ensureStores(db);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('IDB open failed', req.error);
      _dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      console.warn('IDB open blocked — close other tabs');
      _dbPromise = null;
      reject(new Error('idb-blocked'));
    };
  });
  return _dbPromise;
}

function ensureStores(db) {
  if (!db.objectStoreNames.contains('users')) {
    const s = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
    s.createIndex('username', 'username', { unique: true });
  }
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('competitions')) {
    const s = db.createObjectStore('competitions', { keyPath: 'id', autoIncrement: true });
    s.createIndex('type', 'type');
    s.createIndex('status', 'status');
  }
  if (!db.objectStoreNames.contains('matches')) {
    const s = db.createObjectStore('matches', { keyPath: 'id', autoIncrement: true });
    s.createIndex('competitionId', 'competitionId');
    s.createIndex('status', 'status');
  }
  if (!db.objectStoreNames.contains('games')) {
    const s = db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
    s.createIndex('ownerId', 'ownerId');
  }
  if (!db.objectStoreNames.contains('google-auth-tokens')) {
    db.createObjectStore('google-auth-tokens');
  }
  if (!db.objectStoreNames.contains('players')) {
    const ps = db.createObjectStore('players', { keyPath: 'id', autoIncrement: true });
    ps.createIndex('surname', 'surname', { unique: false });
    ps.createIndex('regNumber', 'regNumber', { unique: false });
  }
  if (!db.objectStoreNames.contains('svk_players')) {
    const sps = db.createObjectStore('svk_players', { keyPath: 'svkId' });
    sps.createIndex('surname', 'surname', { unique: false });
  }
  if (!db.objectStoreNames.contains('history')) {
    const hs = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
    hs.createIndex('playerName', 'playerName', { unique: false });
    hs.createIndex('endedAt', 'endedAt', { unique: false });
  }
}

async function tx(storeNames, mode = 'readonly') {
  const db = await openDB();
  const t = db.transaction(storeNames, mode);
  const stores = {};
  for (const n of storeNames) stores[n] = t.objectStore(n);
  return {
    t,
    stores,
    done: new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    })
  };
}

function reqToPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function put(storeName, value, key) {
  const { stores, done } = await tx([storeName], 'readwrite');
  const id = await reqToPromise(stores[storeName].put(value, key));
  await done;
  return id;
}

export async function get(storeName, key) {
  const { stores, done } = await tx([storeName]);
  const v = await reqToPromise(stores[storeName].get(key));
  await done;
  return v;
}

export async function getAll(storeName, indexName, range) {
  const { stores, done } = await tx([storeName]);
  const src = indexName ? stores[storeName].index(indexName) : stores[storeName];
  const v = await reqToPromise(src.getAll(range));
  await done;
  return v;
}

export async function del(storeName, key) {
  const { stores, done } = await tx([storeName], 'readwrite');
  await reqToPromise(stores[storeName].delete(key));
  await done;
}

export async function clear(storeName) {
  const { stores, done } = await tx([storeName], 'readwrite');
  await reqToPromise(stores[storeName].clear());
  await done;
}

export async function getSettings() {
  const all = await getAll('settings');
  const out = {};
  for (const r of all) out[r.key] = r.value;
  return out;
}

export async function setSetting(key, value) {
  await put('settings', { key, value });
}

export async function seedIfEmpty() {
  const users = await getAll('users');
  if (users.length > 0) {
    // Migration: earlier versions may have stored passHash as an object.
    const brokenAdmin = users.find(u => u.username === 'admin' && typeof u.passHash !== 'string');
    if (brokenAdmin) {
      await del('users', brokenAdmin.id);
    } else {
      return;
    }
  }
  const { hashPassword } = await import('../auth/auth.js');
  const hash = await hashPassword('admin');
  await put('users', {
    username: 'admin',
    displayName: 'Administrator',
    passHash: hash.hash,
    salt: hash.salt,
    iterations: hash.iterations,
    role: 'admin',
    createdAt: Date.now(),
  });
}
