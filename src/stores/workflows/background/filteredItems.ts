import type { Context } from './context';
export function register(ctx: Context) {
  ctx.filteredItems = function () {
    const from = ctx.startTime
      ? new Date(ctx.startTime).getTime()
      : ctx.range === 'all' || ctx.range === 'custom'
        ? 0
        : Date.now() - ({ '24h': 1, '7d': 7, '30d': 30, '90d': 90 }[ctx.range] ?? 1) * 86400000;
    const until = ctx.endTime ? new Date(ctx.endTime).getTime() : Number.MAX_SAFE_INTEGER;
    return ctx.items.filter((item) => {
      const at = ctx.kind === 'charge' ? item.startedAt || item.detectedAt : item.at;
      return typeof at === 'number' && at >= from && at <= until;
    });
  };
}
