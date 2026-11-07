import { ApiError, CloudClient } from './client';
import { chinaDay, validDay, validMonth } from '../core/extensions-model';
import { createdArticle, integralTasks, pointsTotal, signCount, signInfo, streakPrize, taskArticles, taskArticleId, taskConfig,
  type TaskAction, type TaskArticle, type TaskConfig, type TaskReason, type TaskStep, type TaskSummary } from '../core/tasks-model';

export interface TaskAccount { uid: string; token: string }
const MINE = '/v1.0/mine/cfmotoservermine', SOCIAL = '/v1.0/social/cfmotoserversocial', H5 = '/cfmotoservermine/H5/signin';
export interface TaskRunOptions {
  signal?: AbortSignal;
  claim: (action: TaskAction, day: string) => Promise<boolean>;
  onStep?: (step: TaskStep) => void;
  now?: () => number;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
export function taskPause(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export class TasksApi {
  private running = false;
  constructor(private readonly cloud = new CloudClient()) {}
  private binding(account: TaskAccount, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!account.token || !/^[A-Za-z0-9_-]{1,64}$/.test(account.uid)) throw new ApiError('format');
  }
  private async call(account: TaskAccount, path: string, options: Parameters<CloudClient['request']>[1] = {}) {
    this.binding(account, options.signal);
    const data = await this.cloud.request(path, { ...options, token: account.token });
    options.signal?.throwIfAborted();
    if (data === false) throw new ApiError('rejected', undefined, '10000');
    return data;
  }
  async summary(account: TaskAccount, signal?: AbortSignal) {
    return integralTasks(await this.call(account, `${MINE}/integral/getByUserId`, { signal, query: { userId: account.uid } }));
  }
  async total(account: TaskAccount, signal?: AbortSignal) {
    return pointsTotal(await this.call(account, `${MINE}/integral/totalIntegral`, { signal, query: { userId: account.uid } }));
  }
  async count(account: TaskAccount, signal?: AbortSignal) { return signCount(await this.call(account, `${MINE}/signin/count`, { signal })); }
  async info(account: TaskAccount, month = chinaDay().slice(0, 7), signal?: AbortSignal) {
    if (!validMonth(month)) throw new ApiError('format');
    return signInfo(await this.call(account, `${H5}/info`, { service: 'h5', signal, query: { month, server_name: 'SMART' } }));
  }
  async signIn(account: TaskAccount, signal?: AbortSignal) { await this.call(account, H5, { service: 'h5', method: 'POST', body: {}, signal }); }
  async prize(account: TaskAccount, day: string, signal?: AbortSignal) {
    if (!validDay(day)) throw new ApiError('format');
    return streakPrize(await this.call(account, `${H5}/supplementPrize`, { service: 'h5', signal, query: { supplementDate: day } }));
  }
  async square(account: TaskAccount, signal?: AbortSignal) {
    return taskArticles(await this.call(account, `${SOCIAL}/community/qbTzInfoNewV2`, { signal, query: { postModule: '1', slidingType: '0', page: '1', pageSize: '20' } }));
  }
  async mine(account: TaskAccount, signal?: AbortSignal) {
    return taskArticles(await this.call(account, `${SOCIAL}/community/mineArticleInfo`, { signal, query: { userId: account.uid } }));
  }
  async like(account: TaskAccount, id: string, signal?: AbortSignal) {
    if (!taskArticleId(id)) throw new ApiError('format');
    await this.call(account, `${SOCIAL}/socialCommu/likeFavoriteInfo`, { method: 'POST', body: { postId: id, kindFlag: '0' }, signal });
  }
  async share(account: TaskAccount, id: string, signal?: AbortSignal) {
    if (!taskArticleId(id)) throw new ApiError('format');
    await this.call(account, `${SOCIAL}/article/share/${id}`, { method: 'PUT', signal });
  }
  async shareReward(account: TaskAccount, signal?: AbortSignal) { await this.call(account, `${MINE}/integral/adjustByShare`, { signal }); }
  async publish(account: TaskAccount, content: string, signal?: AbortSignal) {
    taskConfig({ ...{ enabled: false, time: '09:00', requestIntervalMs: 2000, actions: { signin: false, streakPrize: false, like: false, share: false, post: true, cleanup: false } }, postContent: content });
    await this.call(account, `${SOCIAL}/commonArticle`, { method: 'POST', signal, body: { postSubInfo: { topicList: [] }, topicid: '', postcontent: content } });
  }
  async removeCreated(account: TaskAccount, id: string, signal?: AbortSignal) {
    if (!taskArticleId(id)) throw new ApiError('format');
    await this.call(account, `${SOCIAL}/commonArticle/deleteArticle`, { method: 'DELETE', signal, query: { articleId: id, postType: '1' } });
  }

  /** Sequential, abortable orchestration. Every write needs an atomic, persistent daily attempt claim. */
  async run(account: TaskAccount, requested: TaskConfig, options: TaskRunOptions): Promise<TaskStep[]> {
    const config = taskConfig(requested);
    this.binding(account, options.signal);
    account = { uid: account.uid, token: account.token };
    if (this.running) throw new ApiError('rejected');
    this.running = true;
    const steps: TaskStep[] = [], now = options.now ?? Date.now, pause = options.pause ?? taskPause;
    const day = () => new Date(now() + 8 * 3600_000).toISOString().slice(0, 10), startedDay = day();
    const check = () => { options.signal?.throwIfAborted(); if (day() !== startedDay) throw new DOMException('Day changed', 'AbortError'); };
    const emit = (action: TaskAction, state: TaskStep['state'], reason?: TaskReason) => {
      const step = { action, state, ...(reason ? { reason } : {}), at: now() }; steps.push(step); options.onStep?.(step);
    };
    const ready = async (action: TaskAction) => {
      check(); await pause(config.requestIntervalMs, options.signal); check();
      if (!await options.claim(action, startedDay)) { emit(action, 'skipped', 'daily_gate'); return false; }
      check(); return true;
    };
    const fatal = (error: unknown) => options.signal?.aborted || error instanceof DOMException && error.name === 'AbortError' || error instanceof ApiError && error.kind === 'expired';
    const reason = (error: unknown): TaskReason => error instanceof ApiError && error.kind === 'expired' ? 'expired'
      : error instanceof ApiError && error.kind === 'rejected' ? 'rejected' : 'network';
    const execute = async (action: TaskAction, fn: () => Promise<void>) => {
      if (!config.actions[action]) return;
      const count = steps.length;
      try { check(); await fn(); check(); }
      catch (error) {
        if (steps.length === count) emit(action, 'uncertain', fatal(error) ? error instanceof ApiError ? 'expired' : 'cancelled' : reason(error));
        if (fatal(error)) throw error;
      }
    };
    try {
      await execute('signin', async () => {
        const status = await this.count(account, options.signal); check();
        if (status.signed === true) { emit('signin', 'skipped', 'already_done'); return; }
        if (status.signed !== false) { emit('signin', 'skipped', 'state_unknown'); return; }
        if (!await ready('signin')) return;
        try { await this.signIn(account, options.signal); } catch (error) { if (fatal(error)) throw error; }
        check(); const updated = await this.count(account, options.signal);
        emit('signin', updated.signed === true ? 'confirmed' : 'uncertain', updated.signed === true ? undefined : 'accepted_not_verified');
      });
      await execute('streakPrize', async () => {
        const status = await this.count(account, options.signal); check();
        if (status.signed !== true || status.count === null || status.count <= 0 || status.count % 30 !== 0) { emit('streakPrize', 'skipped', status.signed === null || status.count === null ? 'state_unknown' : 'not_eligible'); return; }
        const info = await this.info(account, startedDay.slice(0, 7), options.signal); check();
        if (info.prizeDate !== startedDay) { emit('streakPrize', 'skipped', 'not_eligible'); return; }
        if (!await ready('streakPrize')) return;
        const prize = await this.prize(account, startedDay, options.signal); check();
        emit('streakPrize', prize.title ? 'confirmed' : 'uncertain', prize.title ? undefined : 'accepted_not_verified');
      });
      let summary: TaskSummary | null = null;
      const eligible = async (action: TaskAction) => {
        summary = await this.summary(account, options.signal); check();
        const tasks = summary.tasks.filter(row => row.action === action);
        if (tasks.length !== 1 || tasks[0].completed === null) { emit(action, 'skipped', 'state_unknown'); return false; }
        if (tasks[0].completed) { emit(action, 'skipped', 'already_done'); return false; }
        return true;
      };
      const verify = async (action: TaskAction) => {
        const updated = await this.summary(account, options.signal); check();
        const tasks = updated.tasks.filter(row => row.action === action);
        const confirmed = tasks.length === 1 && tasks[0].completed === true;
        emit(action, confirmed ? 'confirmed' : 'uncertain', confirmed ? undefined : 'accepted_not_verified');
      };
      for (const action of ['like', 'share'] as const) await execute(action, async () => {
        if (!await eligible(action)) return;
        // The recovered client does not establish likeType's values or whether
        // likeFavoriteInfo toggles an existing like. Do not risk undoing it.
        if (action === 'like' && !config.legacyLikeConfirmed) { emit(action, 'skipped', 'state_unknown'); return; }
        const articles = await this.square(account, options.signal); check();
        const target = articles.filter(row => row.at !== null && row.authorId !== account.uid).sort((a, b) => b.at! - a.at!)[0];
        if (!target) { emit(action, 'skipped', 'no_target'); return; }
        if (!await ready(action)) return;
        let failure: unknown;
        try {
          if (action === 'like') await this.like(account, target.id, options.signal);
          else { await this.share(account, target.id, options.signal); check(); await this.shareReward(account, options.signal); }
        } catch (error) { if (fatal(error)) throw error; failure = error; }
        check();
        if (failure instanceof ApiError && failure.kind === 'rejected') emit(action, 'failed', 'rejected');
        else await verify(action);
      });
      await execute('post', async () => {
        if (!await eligible('post')) return;
        const before = await this.mine(account, options.signal); check();
        if (!await ready('post')) return;
        const startedAt = now();
        try { await this.publish(account, config.postContent, options.signal); } catch (error) { if (fatal(error)) throw error; }
        const endedAt = now(); check();
        let proof: { id: string | null; safe: boolean } = { id: null, safe: true };
        for (let attempt = 0; attempt < 5; attempt++) {
          if (attempt) { await pause(1000, options.signal); check(); }
          let after: TaskArticle[];
          try { after = await this.mine(account, options.signal); } catch (error) { if (fatal(error)) throw error; continue; }
          check(); proof = createdArticle(before, after, account.uid, config.postContent, startedAt, endedAt);
          if (!proof.safe || proof.id) break;
        }
        if (!proof.safe || !proof.id) {
          emit('post', 'uncertain', 'evidence_unsafe');
          if (config.actions.cleanup) emit('cleanup', 'skipped', 'evidence_unsafe');
          return;
        }
        emit('post', 'confirmed');
        if (config.actions.cleanup) await execute('cleanup', async () => {
          if (!await ready('cleanup')) return;
          await this.removeCreated(account, proof.id!, options.signal); check();
          const after = await this.mine(account, options.signal); check();
          emit('cleanup', after.some(row => row.id === proof.id) ? 'uncertain' : 'confirmed', after.some(row => row.id === proof.id) ? 'accepted_not_verified' : undefined);
        });
      });
      return steps;
    } finally { this.running = false; }
  }
}
