import { ApiError } from '../../../api/client';
import { changeOnce } from '../../../core/owner-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.write = async function () {
    if (
      !ctx.alive ||
      ctx.expired ||
      ctx.busy ||
      ctx.options.demo ||
      !ctx.session! ||
      !ctx.confirmation?.setting.writable
    )
      return;
    const pending = ctx.confirmation;
    ctx.confirmation = null;
    ctx.busy = true;
    ctx.writing = true;
    ctx.error = '';
    ctx.note = '';
    ctx.render();
    ctx.request?.abort();
    ctx.request = new AbortController();
    const signal = ctx.request.signal;
    try {
      let confirmed = true;
      ctx.note = await changeOnce(
        async () => {
          if (pending.setting.key === 'cloudInductiveEnabled') {
            const result = await ctx.materials.configureInductive(
              ctx.session!,
              pending.value === '1',
              signal,
            );
            confirmed = result.confirmed;
          } else
            try {
              await ctx.api.writeSetting(ctx.session!, pending.setting.key, pending.value, signal);
            } catch (e) {
              if (e instanceof ApiError && e.kind === 'expired') ctx.expire();
              throw e;
            }
        },
        async () => {
          ctx.settings = await ctx.api.settings(ctx.session!, signal);
          ctx.settingsAt = Date.now();
          return ctx.settings;
        },
        () => {
          const actual = ctx.settings?.find((item) => item.key === pending.setting.key)?.value;
          return actual == null || !confirmed ? null : actual === pending.value;
        },
        signal,
      );
    } catch (failure) {
      if (!ctx.alive || signal.aborted) return;
      if (failure instanceof ApiError && failure.kind === 'expired') ctx.expire();
      else ctx.error = '已发送，车辆尚未确认';
    } finally {
      ctx.writing = false;
      if (ctx.alive && !signal.aborted) {
        ctx.busy = false;
        ctx.render();
      }
    }
  };
}
