import { defaultTaskConfig } from '../../../core/tasks-model';
import { loadTaskConfig } from '../../../core/tasks-store';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.changed = function (event: Event) {
    const select = event.target;
    if (
      !(select instanceof HTMLSelectElement) ||
      !select.hasAttribute('data-task-account') ||
      ctx.busy
    )
      return;
    ctx.account = ctx.accounts.find((row) => row.id === select.value);
    ctx.config = ctx.account ? loadTaskConfig(ctx.account.id) : defaultTaskConfig();
    ctx.summary = null;
    ctx.sign = null;
    ctx.steps = [];
    ctx.pending = null;
    void ctx.load();
  };
}
