import { ApiError } from '../../../api/client';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.load = async function () {
    ctx.messageConfirmation = null;
    ctx.roadMaps.clear();
    if (!ctx.alive || ctx.expired) return;
    ctx.confirmation = null;
    ctx.error = '';
    ctx.note = '';
    ctx.request?.abort();
    ctx.request = new AbortController();
    const signal = ctx.request.signal,
      current = ++ctx.generation,
      activeTab = ctx.tab;
    if (!ctx.session! && !ctx.options.demo) {
      ctx.render();
      return;
    }
    if (ctx.options.demo) {
      ctx.simulated();
      ctx.render();
      return;
    }
    ctx.busy = true;
    ctx.render();
    try {
      const currentRequest = () => ctx.alive && !signal.aborted && current === ctx.generation;
      if (activeTab === 'ride') {
        const result = await ctx.api.month(ctx.session!!, ctx.month, signal);
        if (currentRequest()) ctx.monthly = result;
      } else if (activeTab === 'tracks') {
        const result = await ctx.api.tracks(ctx.session!!, ctx.day, ctx.trackPage, signal);
        if (currentRequest()) ctx.tracks = result;
      } else if (activeTab === 'tires') {
        const result = await ctx.api.tires(ctx.session!!, signal);
        if (currentRequest()) ctx.tires = result;
      } else if (activeTab === 'alerts') {
        if (!ctx.session!!.uid) {
          ctx.error = '消息不可用';
          return;
        }
        const result = await ctx.api.alerts(ctx.session!!, ctx.alertPage, signal);
        if (currentRequest())
          ctx.alerts =
            ctx.alertPage > 1 && ctx.alerts
              ? { ...result, alerts: [...ctx.alerts.alerts, ...result.alerts] }
              : result;
      } else {
        const result = await ctx.api.settings(ctx.session!!, signal);
        if (currentRequest()) {
          ctx.settings = result;
          ctx.settingsAt = Date.now();
        }
      }
    } catch (failure) {
      if (!ctx.alive || signal.aborted || current !== ctx.generation) return;
      if (failure instanceof ApiError && failure.kind === 'expired') ctx.expire();
      else ctx.error = '加载失败';
    } finally {
      if (ctx.alive && current === ctx.generation && !signal.aborted) {
        ctx.busy = false;
        ctx.render();
      }
    }
  };
}
