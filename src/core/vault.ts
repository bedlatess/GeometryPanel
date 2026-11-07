import { object, validVin, type Session } from './model';
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
export async function saveSession(session: Session) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(session)));
  // One atomic record: an interrupted account switch retains the previous session.
  await transaction('readwrite', store => store.put({ key, iv: iv.buffer, ciphertext } satisfies SavedSession, 'session'));
}
export async function loadSession(): Promise<Session | null> {
  const saved = await transaction<SavedSession | undefined>('readonly', store => store.get('session'));
  if (!saved) return null;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv }, saved.key, saved.ciphertext);
  const data = object(JSON.parse(new TextDecoder().decode(plain)));
  const vehicle = object(data.vehicle);
  if (typeof data.token !== 'string' || /\s/.test(data.token) || !data.token || !validVin(String(vehicle.vin))) throw new Error('storage');
  return { token: data.token, uid: String(data.uid ?? ''), vehicle: {
    vin: String(vehicle.vin), name: String(vehicle.name || '我的极核'), type: String(vehicle.type || ''), plate: String(vehicle.plate || ''),
  } };
}
export const forgetSession = () => transaction('readwrite', store => store.clear());
