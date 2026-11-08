import { ownerRows as rows } from '../../../core/owner-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.phoneKeys = function () {
    return ctx
      .list('phoneKeys')
      .flatMap((r) => (rows(r.inductiveUnlockVOList).length ? rows(r.inductiveUnlockVOList) : [r]));
  };
}
