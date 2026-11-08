import { readLocalHistory } from '../../../core/history-store';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.loadHistory = async function (append = false) {
    if (!ctx.selected || ctx.demo) {
      ctx.items = [];
      ctx.total = 0;
      return;
    }
    if (ctx.useNativeHistory()) {
      const last = append ? ctx.items.at(-1) : null,
        before = last
          ? ctx.kind === 'charge'
            ? last.startedAt || last.detectedAt
            : last.at
          : undefined;
      const result = await ctx.native.call<{
        items: unknown[];
        total: number;
      }>(
        'background.history',
        { vehicleId: ctx.selected, kind: ctx.kind, limit: 500, ...(before ? { before } : {}) },
        ctx.controller.signal,
      );
      const received = Array.isArray(result.items) ? result.items.slice(0, 500) : [];
      ctx.items = append ? [...ctx.items, ...received].slice(0, 5000) : received;
      ctx.total = result.total ?? ctx.items.length;
      if (append && !received.length) ctx.total = ctx.items.length;
    } else {
      const history = await readLocalHistory(ctx.selected),
        count = append ? ctx.items.length + 500 : 500;
      ctx.items =
        ctx.kind === 'battery'
          ? history.samples.slice(-count).reverse()
          : ctx.kind === 'charge'
            ? history.chargingSessions.slice(-count).reverse()
            : [];
      ctx.total =
        ctx.kind === 'battery'
          ? history.samples.length
          : ctx.kind === 'charge'
            ? history.chargingSessions.length
            : 0;
    }
  };
}
