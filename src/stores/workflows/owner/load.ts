import { type OwnerRead } from '../../../api/owner';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.load = async function (keys: OwnerRead[]) {
    if (!ctx.s! || ctx.o.demo) {
      ctx.render();
      return;
    }
    ctx.busy = true;
    ctx.render();
    const results = await Promise.allSettled(
      keys.map((k) =>
        ctx.read(k, {
          month: ctx.month,
          period: ctx.period,
          ...(k === 'rideDay' ? { date: ctx.path.split('/').at(-1)! } : {}),
        }),
      ),
    );
    if (!ctx.active()) return;
    ctx.failed = results.every((r) => r.status === 'rejected');
    ctx.busy = false;
    ctx.render();
  };
}
