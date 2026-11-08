import { ApiError } from '../api/client';
/** Optional fields are deliberately retained as unknown until displayed. */
export type OwnerRow = Record<string, unknown>;
export const ownerObject = (v: unknown): OwnerRow => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as OwnerRow : {};
export const ownerRows = (v: unknown): OwnerRow[] => Array.isArray(v) ? v.slice(0, 500).filter(x => x !== null && typeof x === 'object' && !Array.isArray(x)) : [];
export const ownerText = (v: unknown): string => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 2000) : '';
export const ownerNumber = (v: unknown): number | null => (typeof v === 'number' || typeof v === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(v)) && Number.isFinite(Number(v)) ? Number(v) : null;
export type ChangeResult = '已生效' | '已发送，车辆尚未确认' | '修改未生效';
/** One write and one observation. An indeterminate response is never retried. */
export async function changeOnce(write: () => Promise<unknown>, read: () => Promise<unknown>, matches: (v: unknown) => boolean | null, signal?: AbortSignal): Promise<ChangeResult> {
  signal?.throwIfAborted();
  let accepted = false, rejected = false;
  try { const result = await write(); rejected=result===false; accepted=!rejected; }
  catch(error) { signal?.throwIfAborted(); rejected=error instanceof ApiError&&error.kind==='rejected'&&(error.httpStatus===undefined||error.httpStatus<500&&![408,429].includes(error.httpStatus)); }
  signal?.throwIfAborted();
  try { const result=matches(await read());signal?.throwIfAborted();return result===true?'已生效':rejected?'修改未生效':result===false&&accepted?'修改未生效':'已发送，车辆尚未确认'; }
  catch { signal?.throwIfAborted();return rejected?'修改未生效':'已发送，车辆尚未确认'; }
}

export function tokenCredentials(raw: string, manualUid = '') {
  let token = raw.trim(), uid = manualUid.trim();
  if (/^https?:\/\//i.test(token)) {
    const u = new URL(token); const hash = new URLSearchParams(u.hash.replace(/^#(?:[^?]*\?)?/, ''));
    token = u.searchParams.get('token') ?? u.searchParams.get('access_token') ?? hash.get('token') ?? hash.get('access_token') ?? '';
    uid ||= u.searchParams.get('uid') ?? u.searchParams.get('userId') ?? hash.get('uid') ?? '';
  }
  token = token.replace(/^Bearer\s+/i, '');
  if (!token || token.length > 8192 || /\s|[\u0000-\u001f\u007f]/.test(token)) throw new Error('credentials');
  if (!uid && token.split('.').length === 3) {
    try { const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); const data = ownerObject(JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')))); uid = ownerText(data.uid ?? data.userId ?? data.id ?? data.sub); } catch { }
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('uid');
  return { token, uid };
}

export function tireHistory(raw: unknown) {
  const root = ownerObject(raw);
  return ownerRows(root.data).filter(x => [1, 2].includes(Number(x.sensorPosition))).map(wheel => ({
    position: Number(wheel.sensorPosition),
    pressure: points(ownerObject(wheel.tirePressureStat).list), temperature: points(ownerObject(wheel.tireTempStat).list),
  }));
}
function points(raw: unknown) { return ownerRows(raw).flatMap(p => { const t = ownerNumber(p.time), v = ownerNumber(p.value); return t !== null && t > 0 && v !== null ? [{ t: t * 1000, v }] : []; }).sort((a,b) => a.t-b.t); }
