import { ApiError } from '../../../api/client';
import {
  changeOnce,
  ownerRows as rows,
  ownerText as txt,
  type OwnerRow,
} from '../../../core/owner-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.savePlan = async function (r: OwnerRow) {
    if (!ctx.s!) return;
    ctx.busy = true;
    ctx.note = '';
    ctx.render();
    let saved = false;
    try {
      let result: unknown,
        rejected = false;
      try {
        result = await ctx.api.savePlan(
          ctx.s!,
          txt(r.startTime),
          txt(r.endTime),
          txt(r.id) || undefined,
          ctx.scope.signal,
        );
        saved = true;
      } catch (e) {
        rejected =
          e instanceof ApiError &&
          e.kind === 'rejected' &&
          (e.httpStatus === undefined ||
            (e.httpStatus < 500 && ![408, 429].includes(e.httpStatus)));
      }
      if (!ctx.active()) return;
      await ctx.read('plans').catch(() => null);
      if (!ctx.active()) return;
      ctx.pendingPlan = saved ? txt(result) || txt(r.id) : '';
      if (!saved || !ctx.pendingPlan) {
        ctx.note = rejected ? '修改未生效' : '已发送，车辆尚未确认';
        return;
      }
      // The enable operation is separate, only after an acknowledged save with a known id.
      const outcome = await changeOnce(
        () => ctx.api.usePlan(ctx.s!!, ctx.pendingPlan, true, ctx.scope.signal),
        () => ctx.read('plans'),
        (v) =>
          Array.isArray(v)
            ? rows(v).some((x) => x.id === ctx.pendingPlan && String(x.delFlag) === '0')
            : null,
        ctx.scope.signal,
      );
      if (!ctx.active()) return;
      const confirmed = ctx.list('plans').find((x) => x.id === ctx.pendingPlan);
      ctx.note =
        outcome === '已生效'
          ? '已生效'
          : confirmed && String(confirmed.delFlag) === '1'
            ? '已保存，未启用'
            : '已发送，车辆尚未确认';
      if (ctx.note === '已生效') ctx.pendingPlan = '';
    } catch {
      if (ctx.active()) ctx.note = '已发送，车辆尚未确认';
    } finally {
      if (ctx.active()) {
        ctx.busy = false;
        ctx.render();
      }
    }
  };
}
