import type { Context } from './context';
export function register(ctx: Context) {
  ctx.monthChanged = function (event: Event) {
    const d = new Date(ctx.month + '-01T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + Number((event as CustomEvent).detail));
    ctx.month = d.toISOString().slice(0, 7);
    void ctx.load(['analysis']);
  };
}
