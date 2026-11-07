import type { Snapshot } from './model';

export interface BatterySample { at: number; soc: number | null; range: number | null; voltage: number | null; current: number | null; power: number | null; charging: boolean | null; online: boolean | null }
export interface ChargingSession { id: string; startedAt: number; endedAt: number | null; startSoc: number | null; endSoc: number | null; status: 'charging' | 'full' | 'interrupted' | 'unknown'; sampleCount: number }
export interface LocalHistory { schema: 1; samples: BatterySample[]; chargingSessions: ChargingSession[] }
export const emptyHistory = (): LocalHistory => ({ schema: 1, samples: [], chargingSessions: [] });
const GAP = 5 * 60_000;
const number = (value: unknown, low = -1_000_000, high = 1_000_000): number | null => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high ? value : null;
export function validateHistory(value: unknown): LocalHistory {
  if (!value || typeof value !== 'object') return emptyHistory();
  const raw = value as LocalHistory;
  if (raw.schema !== 1 || !Array.isArray(raw.samples) || !Array.isArray(raw.chargingSessions)) throw new Error('storage');
  return { schema: 1, samples: raw.samples.slice(-5000).flatMap(sample => number(sample?.at, 1, Number.MAX_SAFE_INTEGER) === null ? [] : [{
    at: sample.at, soc: number(sample.soc, 0, 100), range: number(sample.range, 0, 10000), voltage: number(sample.voltage, 0, 1000),
    current: number(sample.current), power: number(sample.power), charging: typeof sample.charging === 'boolean' ? sample.charging : null, online: typeof sample.online === 'boolean' ? sample.online : null,
  }]), chargingSessions: raw.chargingSessions.slice(-500).filter(item => item && /^[A-Za-z0-9_-]{1,80}$/.test(item.id) && number(item.startedAt, 1, Number.MAX_SAFE_INTEGER) !== null
    && (item.endedAt === null || number(item.endedAt, item.startedAt, Number.MAX_SAFE_INTEGER) !== null) && ['charging', 'full', 'interrupted', 'unknown'].includes(item.status))
    .map(item => ({ id: item.id, startedAt: item.startedAt, endedAt: item.endedAt, startSoc: number(item.startSoc, 0, 100), endSoc: number(item.endSoc, 0, 100), status: item.status, sampleCount: Math.max(0, Math.min(100000, Math.trunc(item.sampleCount) || 0)) })) };
}
export function addHistory(previous: LocalHistory, reading: Snapshot, makeId: () => string = () => crypto.randomUUID()): LocalHistory {
  const result = validateHistory(previous), last = result.samples.at(-1), at = reading.receivedAt;
  if (!Number.isFinite(at) || at <= 0 || last && at <= last.at || reading.daily.batteryReportState === 'future') return result;
  const charging = reading.charging === '充电中' ? true : ['未充电', '已充满'].includes(reading.charging) ? false : null;
  const stale = reading.daily.batteryReportState === 'stale';
  result.samples.push({ at, soc: reading.soc, range: reading.range, voltage: reading.voltage, current: reading.daily.currentA, power: reading.daily.powerW, charging: stale ? null : charging, online: reading.online });
  let active = result.chargingSessions.at(-1);
  if (active?.status !== 'charging') active = undefined;
  const gap = last && at - last.at > GAP;
  if (active && gap) { active.status = 'unknown'; active.endedAt = last.at; active = undefined; }
  if (charging === true && !stale) {
    if (active) { active.endSoc = reading.soc; active.sampleCount++; }
    else result.chargingSessions.push({ id: makeId(), startedAt: at, endedAt: null, startSoc: reading.soc, endSoc: reading.soc, status: 'charging', sampleCount: 1 });
  } else if (active && charging === false && !stale) {
    active.endedAt = at; active.endSoc = reading.soc; active.sampleCount++;
    active.status = reading.charging === '已充满' ? 'full' : 'interrupted';
  }
  result.samples = result.samples.filter(item => at - item.at <= 90 * 86400000).slice(-5000);
  result.chargingSessions = result.chargingSessions.filter(item => at - (item.endedAt ?? item.startedAt) <= 90 * 86400000).slice(-500);
  return result;
}
export function historyCsv(items: unknown[], kind: string): string {
  const keys = kind === 'battery' ? ['at', 'soc', 'range', 'voltage', 'current', 'power', 'charging', 'online'] : kind === 'events' ? ['at', 'kind', 'title', 'body'] : ['id', 'startedAt', 'endedAt', 'startSoc', 'endSoc', 'status', 'sampleCount'];
  const cell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""').replace(/^[=+@-]/, "'$&") + '"';
  return '\ufeff' + keys.join(',') + '\r\n' + items.map(item => keys.map(key => cell((item as Record<string, unknown>)?.[key])).join(',')).join('\r\n');
}
