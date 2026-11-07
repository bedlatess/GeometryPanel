import { defaultTaskConfig, taskConfig, type TaskAction, type TaskConfig } from './tasks-model';

const validScope = (id: string) => /^[A-Za-z0-9_-]{8,80}$/.test(id);
const configKey = (id: string) => `geometry.tasks.config.v1.${id}`;
export function loadTaskConfig(id: string): TaskConfig {
  if (!validScope(id)) return defaultTaskConfig();
  try { const raw = localStorage.getItem(configKey(id)); return raw ? taskConfig(JSON.parse(raw)) : defaultTaskConfig(); } catch { return defaultTaskConfig(); }
}
export function saveTaskConfig(id: string, value: TaskConfig): boolean {
  if (!validScope(id)) return false;
  try { const encoded = JSON.stringify(taskConfig(value)); localStorage.setItem(configKey(id), encoded); return localStorage.getItem(configKey(id)) === encoded; } catch { return false; }
}
/** An IndexedDB write transaction makes the attempt gate atomic across browser tabs. No credentials or content are stored here. */
export async function claimTaskAttempt(accountId: string, action: TaskAction, day: string): Promise<boolean> {
  if (!validScope(accountId) || !/^20\d{2}-\d{2}-\d{2}$/.test(day)) return false;
  return new Promise(resolve => {
    let open: IDBOpenDBRequest;
    try { open = indexedDB.open('geometry-panel-task-attempts', 1); } catch { resolve(false); return; }
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('attempts')) open.result.createObjectStore('attempts'); };
    open.onerror = () => resolve(false); open.onblocked = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result; db.onversionchange = () => db.close();
      const tx = db.transaction('attempts', 'readwrite'), store = tx.objectStore('attempts'), key = `${accountId}:${day}:${action}`;
      let claimed = false;
      const check = store.get(key);
      check.onsuccess = () => { if (!check.result) { store.put(true, key); claimed = true; } };
      tx.oncomplete = () => { db.close(); resolve(claimed); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(false); };
    };
  });
}
export function clearTaskConfig(accountId: string) { if (validScope(accountId)) try { localStorage.removeItem(configKey(accountId)); } catch { /* storage unavailable */ } }
