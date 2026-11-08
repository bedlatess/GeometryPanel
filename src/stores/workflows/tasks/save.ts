import { ApiError } from '../../../api/client';
import { type TaskConfig } from '../../../core/tasks-model';
import { saveTaskConfig } from '../../../core/tasks-store';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.save = async function (value: TaskConfig) {
    if (!ctx.account) return;
    ctx.busy = true;
    ctx.error = '';
    ctx.render();
    try {
      if (ctx.nativeTasks) {
        if (value.enabled) {
          if (!ctx.options.onNativeConsent) throw new ApiError('rejected');
          await ctx.options.onNativeConsent();
        }
        const raw = await ctx.options.native.call('tasks.configure', value, ctx.aborter.signal);
        if (!ctx.alive) return;
        ctx.receiveStatus(raw);
      }
      if (!saveTaskConfig(ctx.account.id, value)) throw new ApiError('rejected');
      ctx.config = value;
      ctx.note = value.enabled ? '定时执行已保存' : '已保存';
    } catch (failure) {
      if (ctx.alive && !ctx.aborter.signal.aborted) ctx.fail(failure);
    } finally {
      if (ctx.alive) {
        ctx.busy = false;
        ctx.render();
      }
    }
  };
}
