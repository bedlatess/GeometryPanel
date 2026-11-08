import type { Context } from './context';
export function register(ctx: Context) {
  ctx.expire = function () {
    if (ctx.expired) return;
    ctx.expired = true;
    ctx.busy = false;
    ctx.generation++;
    ctx.request?.abort();
    ctx.confirmation = null;
    ctx.monthly = null;
    ctx.tracks = null;
    ctx.tires = null;
    ctx.alerts = null;
    ctx.settings = null;
    ctx.error = '登录已过期';
    ctx.render();
    ctx.options.onExpired();
  };
}
