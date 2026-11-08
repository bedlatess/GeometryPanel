import { ApiError } from '../../../api/client';
import { type OwnerRead } from '../../../api/owner';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.read = async function (k: OwnerRead, args: Record<string, string> = {}) {
    if (!ctx.s! || ctx.o.demo) return;
    try {
      const result = await ctx.api.read(ctx.s!, k, args, ctx.scope.signal);
      if (ctx.active()) {
        ctx.data[k] = result;
        ctx.known.add(k);
        ctx.errors.delete(k);
      }
      return result;
    } catch (e) {
      if (!ctx.active()) return;
      ctx.errors.add(k);
      if (e instanceof ApiError && e.kind === 'expired') ctx.o.onExpired();
      throw e;
    }
  };
}
