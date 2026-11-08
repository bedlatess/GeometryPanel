import { labels, reasons, states } from './shared';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.render = function () {
    if (!ctx.alive) return;
    ctx.options.publish({
      accounts: ctx.accounts,
      account: ctx.account,
      config: ctx.config,
      busy: ctx.busy,
      loading: ctx.loading,
      nativeTasks: ctx.nativeTasks,
      error: ctx.error,
      note: ctx.note,
      summary: ctx.summary,
      sign: ctx.sign,
      steps: [...ctx.steps],
      labels,
      reasons,
      states,
    });
  };
}
