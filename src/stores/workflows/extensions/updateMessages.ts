import { ApiError } from '../../../api/client';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.updateMessages = async function () {
    if (
      !ctx.alive ||
      ctx.expired ||
      ctx.busy ||
      ctx.options.demo ||
      !ctx.session! ||
      !ctx.messageConfirmation
    )
      return;
    const action = ctx.messageConfirmation;
    ctx.messageConfirmation = null;
    ctx.busy = true;
    ctx.writing = true;
    ctx.error = '';
    ctx.note = '';
    ctx.render();
    ctx.request?.abort();
    ctx.request = new AbortController();
    const signal = ctx.request.signal;
    let accepted = false;
    try {
      await ctx.api.updateAlerts(ctx.session!, action, signal);
      accepted = true;
      if (!ctx.alive || signal.aborted) return;
      ctx.alertPage = 1;
      ctx.alerts = await ctx.api.alerts(ctx.session!, 1, signal);
      if (!ctx.alive || signal.aborted) return;
      ctx.note = '已更新';
    } catch (failure) {
      if (!ctx.alive || signal.aborted) return;
      if (failure instanceof ApiError && failure.kind === 'expired') ctx.expire();
      else ctx.error = accepted ? '已发送，车辆尚未确认' : '修改未生效';
    } finally {
      ctx.writing = false;
      if (ctx.alive && !signal.aborted) {
        ctx.busy = false;
        ctx.render();
      }
    }
  };
}
