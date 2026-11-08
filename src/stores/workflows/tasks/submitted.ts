import { taskActions, taskConfig } from '../../../core/tasks-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.submitted = function (event: Event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-task-config')) return;
    event.preventDefault();
    if (ctx.busy || ctx.loading || ctx.options.demo || !ctx.account) return;
    const data = new FormData(form);
    try {
      const value = taskConfig({
        enabled: ctx.nativeTasks && data.has('enabled'),
        time: String(data.get('time') ?? ctx.config.time),
        requestIntervalMs: Number(data.get('gap')) * 1000,
        actions: Object.fromEntries(taskActions.map((action) => [action, data.has(action)])),
        postContent: String(data.get('postContent') ?? ''),
        legacyLikeConfirmed: data.has('legacyLikeConfirmed'),
      });
      if (value.enabled) {
        ctx.pending = { kind: 'save', config: value };
        ctx.render();
        ctx.prompt();
      } else void ctx.save(value);
    } catch {
      ctx.error = '任务设置不完整';
      ctx.render();
    }
  };
}
