import { ApiError } from '../api/client';
import { extensionNumber, validDay, validMonth } from './extensions-model';

export const taskActions = ['signin', 'streakPrize', 'like', 'share', 'post', 'cleanup'] as const;
export type TaskAction = typeof taskActions[number];
export type TaskReason = 'already_done' | 'not_eligible' | 'state_unknown' | 'no_target' | 'daily_gate' | 'evidence_unsafe' | 'accepted_not_verified' | 'network' | 'rejected' | 'expired' | 'cancelled';
export interface TaskConfig { enabled: boolean; time: string; requestIntervalMs: number; actions: Record<TaskAction, boolean>; postContent: string; legacyLikeConfirmed: boolean }
export interface TaskStep { action: TaskAction; state: 'confirmed' | 'skipped' | 'uncertain' | 'failed'; reason?: TaskReason; at: number }
export interface IntegralTask { code: string; title: string; action: TaskAction | null; completed: boolean | null }
export interface TaskSummary { points: number | null; tasks: IntegralTask[] }
export interface SignCount { signed: boolean | null; count: number | null }
export const defaultTaskConfig = (): TaskConfig => ({ enabled: false, time: '09:00', requestIntervalMs: 2000,
  actions: { signin: false, streakPrize: false, like: false, share: false, post: false, cleanup: false }, postContent: '', legacyLikeConfirmed: false });
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('format');
  return value as Record<string, unknown>;
};
const text = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : '';
const nonnegative = (v: unknown) => { const n = extensionNumber(v); return n !== null && n >= 0 && Number.isSafeInteger(n) ? n : null; };
export function taskConfig(value: unknown): TaskConfig {
  const raw = record(value), actions = record(raw.actions);
  if (typeof raw.enabled !== 'boolean' || typeof raw.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw.time)
    || typeof raw.requestIntervalMs !== 'number' || !Number.isInteger(raw.requestIntervalMs) || raw.requestIntervalMs < 0 || raw.requestIntervalMs > 60000
    || taskActions.some(key => typeof actions[key] !== 'boolean') || typeof raw.postContent !== 'string'
    || raw.postContent.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw.postContent)
    || raw.legacyLikeConfirmed !== undefined && typeof raw.legacyLikeConfirmed !== 'boolean'
    || actions.post && !raw.postContent.trim() || actions.cleanup && !actions.post) throw new ApiError('format');
  return { enabled: raw.enabled, time: raw.time, requestIntervalMs: raw.requestIntervalMs,
    actions: Object.fromEntries(taskActions.map(key => [key, actions[key]])) as Record<TaskAction, boolean>, postContent: raw.postContent, legacyLikeConfirmed: raw.legacyLikeConfirmed === true };
}
export function integralTasks(value: unknown): TaskSummary {
  const raw = record(value), list = raw.ps0003_01_002_VOList;
  if (!Array.isArray(list) || list.length > 200) throw new ApiError('format');
  const mapping: Record<string, TaskAction> = { '1023': 'post', '1026': 'like', '1024': 'share' };
  const tasks = list.map(item => {
    const row = record(item), code = text(row.code), status = text(row.completeFlag);
    return { code, title: text(row.name).slice(0, 100) || '积分任务', action: mapping[code] ?? null,
      completed: status === '0' ? true : status === '1' ? false : null };
  });
  return { points: nonnegative(raw.integralTotal), tasks };
}
export function signCount(value: unknown): SignCount {
  const raw = record(value), status = text(raw.signStatus).replace(/^0+(?=\d)/, '');
  return { signed: status === '1' ? true : status === '0' ? false : null, count: nonnegative(raw.count) };
}
export function signInfo(value: unknown) {
  const raw = record(value), date = text(raw.signPrizeDate);
  return { prizeDate: validDay(date) ? date : null };
}
export function pointsTotal(value: unknown) { return nonnegative(record(value).integralTotal); }
export function streakPrize(value: unknown) {
  const raw = record(value), title = text(raw.prizesName) || text(raw.prizeName);
  return { title: title.slice(0, 100), integral: nonnegative(raw.integral) ?? nonnegative(raw.score) };
}
export function taskArticleId(value: unknown): string {
  const id = text(value);
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) && !/^(?:0+|true|false|null|undefined)$/i.test(id)
    && (typeof value !== 'number' || value > 0) ? id : '';
}
/** Legacy article times have no offset and are explicitly Beijing local time. */
export function articleTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(20\d{2}-\d{2}-\d{2})[ T]([0-2]\d:[0-5]\d:[0-5]\d)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match || !validDay(match[1]) || Number(match[2].slice(0, 2)) > 23) return null;
  const timestamp = Date.parse(`${match[1]}T${match[2]}.${(match[3] ?? '').padEnd(3, '0').slice(0, 3)}+08:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}
export interface TaskArticle { id: string; authorId: string; content: string | null; at: number | null }
export function taskArticles(value: unknown): TaskArticle[] {
  if (!Array.isArray(value) || value.length > 500) throw new ApiError('format');
  return value.map(item => {
    const row = record(item), id = taskArticleId(row.tuuid);
    if (!id) throw new ApiError('format');
    return { id, authorId: text(row.userid), content: typeof row.tcontent === 'string' ? row.tcontent : null, at: articleTime(row.createDate) };
  });
}
export function createdArticle(before: TaskArticle[], after: TaskArticle[], uid: string, content: string, startedAt: number, endedAt: number): { id: string | null; safe: boolean } {
  if (!uid || endedAt < startedAt || before.some(row => !row.id)) return { id: null, safe: false };
  const baseline = new Set(before.map(row => row.id)), matches = new Set<string>();
  for (const row of after) {
    if (baseline.has(row.id)) continue;
    if (!row.id || !row.authorId || row.content === null || row.at === null) return { id: null, safe: false };
    if (row.authorId === uid && row.content === content && row.at >= startedAt - 2000 && row.at <= endedAt + 2000) matches.add(row.id);
  }
  return { id: matches.size === 1 ? [...matches][0] : null, safe: matches.size <= 1 };
}
export const validTaskMonth = validMonth;
