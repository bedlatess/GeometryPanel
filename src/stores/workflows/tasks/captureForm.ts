import { taskActions } from '../../../core/tasks-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.captureForm = function () {
    const form = ctx.host.querySelector<HTMLFormElement>('[data-task-config]');
    if (!form) return;
    const data = new FormData(form);
    ctx.config = {
      ...ctx.config,
      postContent: String(data.get('postContent') ?? ''),
      actions: Object.fromEntries(
        taskActions.map((a) => [a, data.has(a)]),
      ) as typeof ctx.config.actions,
      legacyLikeConfirmed: data.has('legacyLikeConfirmed'),
      enabled: data.has('enabled'),
      time: String(data.get('time') ?? ctx.config.time),
    };
  };
}
