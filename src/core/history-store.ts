import type { Snapshot } from './model';
import { addHistory, validateHistory, type LocalHistory } from './history';
import { loadPrivateRecord, savePrivateRecord, removePrivateRecord } from './vault';
const queues = new Map<string, Promise<void>>();
export async function flushLocalHistory(): Promise<void> { await Promise.all([...queues.values()].map(work => work.catch(() => {}))); }
export async function readLocalHistory(vehicleId: string): Promise<LocalHistory> { await queues.get(vehicleId)?.catch(() => {}); return validateHistory(await loadPrivateRecord(`history:${vehicleId}`)); }
export function recordLocalHistory(vehicleId: string, reading: Snapshot): Promise<void> {
  const work = (queues.get(vehicleId) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const previous = validateHistory(await loadPrivateRecord(`history:${vehicleId}`));
    await savePrivateRecord(`history:${vehicleId}`, addHistory(previous, reading));
  });
  queues.set(vehicleId, work); void work.finally(() => { if (queues.get(vehicleId) === work) queues.delete(vehicleId); }).catch(() => {}); return work;
}
export function clearLocalHistory(vehicleId: string, kind: 'battery' | 'charge' | 'events' | 'all' = 'all'): Promise<void> {
  const work = (queues.get(vehicleId) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (kind === 'all') { await removePrivateRecord(`history:${vehicleId}`); return; }
    const previous = validateHistory(await loadPrivateRecord(`history:${vehicleId}`));
    if (kind === 'battery') previous.samples = [];
    if (kind === 'charge') previous.chargingSessions = [];
    await savePrivateRecord(`history:${vehicleId}`, previous);
  });
  queues.set(vehicleId, work); void work.finally(() => { if (queues.get(vehicleId) === work) queues.delete(vehicleId); }).catch(() => {}); return work;
}
