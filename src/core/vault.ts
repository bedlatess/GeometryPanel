import { object, validVehicleId, type Session, type Vehicle } from './model';
import { accountSession, emptyAccounts, rememberAccount, validateAccounts, type AccountBook } from './accounts';
import { storagePrefix } from './scope';

const STORE = 'local';
const TIMEOUT = 5000;
interface SavedSession { key: CryptoKey; iv: ArrayBuffer; ciphertext: ArrayBuffer }
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(fail, TIMEOUT);
    function fail() { settled = true; clearTimeout(timer); reject(new Error('storage')); }
    const request = indexedDB.open(`${storagePrefix}vault-v2`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = request.onblocked = fail;
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true; clearTimeout(timer);
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const timer = setTimeout(() => { tx.abort(); reject(new Error('storage')); }, TIMEOUT);
      tx.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(new Error('storage')); };
      let request: IDBRequest<T>;
      try { request = operation(tx.objectStore(STORE)); }
      catch { clearTimeout(timer); tx.abort(); reject(new Error('storage')); }
    });
  } finally { db.close(); }
}
async function encryptRecord(value: unknown): Promise<SavedSession> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { key, iv: iv.buffer, ciphertext };
}
async function readAccounts(): Promise<AccountBook> {
  const saved = await transaction<SavedSession | undefined>('readonly', store => store.get('session'));
  if (!saved) return emptyAccounts();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv }, saved.key, saved.ciphertext);
  const data = object(JSON.parse(new TextDecoder().decode(plain)));
  if (data.schema === 1) return validateAccounts(data);
  // Version 0.4 stored one encrypted Session. Keep the same atomic record and
  // commit once under the shared write lock so local identities survive a reload.
  const vehicle = object(data.vehicle);
  if (typeof data.token !== 'string' || /\s/.test(data.token) || !data.token || typeof vehicle.vin !== 'string' || !validVehicleId(vehicle.vin)) throw new Error('storage');
  const migrated = rememberAccount(emptyAccounts(), { token: data.token, uid: String(data.uid ?? ''), vehicle: {
    vin: String(vehicle.vin), name: String(vehicle.name || '我的极核'), type: String(vehicle.type || ''), plate: String(vehicle.plate || ''),
  } });
  await persistAccounts(migrated);
  return migrated;
}
let writes: Promise<unknown> = Promise.resolve();
function write<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => {}).then(async (): Promise<T> => {
    if (navigator.locks) return await navigator.locks.request(`${storagePrefix}vault-write`, operation);
    return await operation();
  });
  writes = next; return next;
}
async function persistAccounts(book: AccountBook) {
  const saved = await encryptRecord(validateAccounts(book));
  await transaction('readwrite', store => store.put(saved, 'session'));
}
export function loadAccounts(): Promise<AccountBook> { return write(readAccounts); }
export function updateAccounts(update: (book: AccountBook) => AccountBook): Promise<AccountBook> {
  return write(async () => { const next = validateAccounts(update(await readAccounts())); await persistAccounts(next); return next; });
}
export function saveAccounts(book: AccountBook): Promise<void> { const copy = validateAccounts(book); return write(() => persistAccounts(copy)); }
export function saveSession(session: Session, vehicles?: Vehicle[]): Promise<void> {
  return write(async () => persistAccounts(rememberAccount(await readAccounts(), session, vehicles)));
}
export async function loadSession(): Promise<Session | null> { return accountSession(await loadAccounts()); }
export const forgetSession = () => write(() => transaction('readwrite', store => store.clear()));
const privateName = (name: string) => {
  if (!/^[a-z-]+:[A-Za-z0-9_-]{1,80}$/.test(name)) throw new Error('storage');
  return name;
};
export async function loadPrivateRecord(name: string): Promise<unknown | null> {
  const saved = await transaction<SavedSession | undefined>('readonly', store => store.get(privateName(name)));
  if (!saved) return null;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv }, saved.key, saved.ciphertext);
  if (plain.byteLength > 2 * 1024 * 1024) throw new Error('storage');
  return JSON.parse(new TextDecoder().decode(plain));
}
export function savePrivateRecord(name: string, value: unknown): Promise<void> {
  privateName(name);
  if (JSON.stringify(value).length > 2 * 1024 * 1024) throw new Error('storage');
  return write(async () => { const saved = await encryptRecord(value); await transaction('readwrite', store => store.put(saved, name)); });
}
export function removePrivateRecord(name: string): Promise<void> {
  return write(async () => { await transaction('readwrite', store => store.delete(privateName(name))); });
}
