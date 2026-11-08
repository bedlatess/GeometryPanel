import { defaultTaskConfig, taskActions } from '../../../core/tasks-model';
import { loadTaskConfig } from '../../../core/tasks-store';
import { choose } from '../../workflow-actions';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.clicked = function (event: Event) {
    const button =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-task]') : null;
    if (!button || !ctx.host.contains(button) || button.hasAttribute('disabled') || ctx.busy)
      return;
    const action = button.dataset.task;
    if (action === 'pick-account') {
      choose(
        ctx.options.actions,
        '执行账号',
        ctx.accounts.map((a) => [a.id, a.label]),
        ctx.account?.id ?? '',
        (value) => {
          ctx.account = ctx.accounts.find((a) => a.id === value);
          ctx.config = ctx.account ? loadTaskConfig(ctx.account.id) : defaultTaskConfig();
          ctx.summary = null;
          ctx.sign = null;
          ctx.steps = [];
          void ctx.load();
        },
      );
      return;
    }
    if (action === 'pick-gap') {
      ctx.captureForm();
      choose(
        ctx.options.actions,
        '执行间隔',
        [0, 1, 2, 3, 5, 10, 15, 30, 60].map((n) => [String(n), n + ' 秒']),
        String(ctx.config.requestIntervalMs / 1000),
        (value) => {
          ctx.config.requestIntervalMs = Number(value) * 1000;
          ctx.render();
        },
      );
      return;
    }
    if (action === 'signin') {
      const value = structuredClone(ctx.config);
      value.actions = Object.fromEntries(
        taskActions.map((a) => [a, a === 'signin']),
      ) as typeof value.actions;
      ctx.pending = { kind: 'run', config: value };
      ctx.prompt();
      return;
    }
    if (action === 'refresh') {
      void ctx.load();
      return;
    }
    if (action === 'status') {
      void ctx.status();
      return;
    }
    if (action === 'cancel') {
      ctx.pending = null;
      ctx.render();
      return;
    }
    if (action === 'run') {
      ctx.captureForm();
      ctx.pending = { kind: 'run', config: ctx.config };
      ctx.error = '';
      ctx.render();
      ctx.prompt();
      return;
    }
    if (action === 'confirm' && ctx.pending) {
      const chosen = ctx.pending;
      ctx.pending = null;
      if (chosen.kind === 'save') void ctx.save(chosen.config);
      else void ctx.run(chosen.config);
    }
  };
}
