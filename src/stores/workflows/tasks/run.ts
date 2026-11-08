import { ApiError } from '../../../api/client';
import { type TaskConfig } from '../../../core/tasks-model';
import { claimTaskAttempt } from '../../../core/tasks-store';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.run = async function (value: TaskConfig) {
    if (!ctx.account) return;
    ctx.busy = true;
    ctx.writing = true;
    ctx.steps = [];
    ctx.error = '';
    ctx.note = '';
    ctx.render();
    try {
      if (ctx.nativeTasks) {
        if (!ctx.options.onNativeConsent) throw new ApiError('rejected');
        await ctx.options.onNativeConsent();
        await ctx.options.native.call('tasks.configure', value, ctx.aborter.signal);
        const raw = await ctx.options.native.call(
          'tasks.run',
          { accountId: ctx.account.id, confirmed: true },
          ctx.aborter.signal,
        );
        if (!ctx.alive) return;
        ctx.receiveStatus(raw);
        void ctx.status(true);
      } else {
        await ctx.api.run(ctx.account, value, {
          signal: ctx.aborter.signal,
          claim: (action, day) => claimTaskAttempt(ctx.account!.id, action, day),
          onStep: (step) => {
            if (ctx.alive) {
              ctx.steps.push(step);
              ctx.render();
            }
          },
        });
        ctx.note = '执行结束';
      }
    } catch (failure) {
      if (ctx.alive && !ctx.aborter.signal.aborted) ctx.fail(failure);
    } finally {
      ctx.writing = false;
      if (ctx.alive) {
        ctx.busy = false;
        ctx.render();
        if (!ctx.nativeTasks) void ctx.load();
      }
    }
  };
}
