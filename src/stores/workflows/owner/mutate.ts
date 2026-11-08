import { type OwnerRead } from '../../../api/owner';
import { changeOnce } from '../../../core/owner-model';
import { ConfirmSheet } from '../../workflow-actions';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.mutate = async function (
    title: string,
    from: string,
    to: string,
    write: () => Promise<unknown>,
    readKey: OwnerRead,
    matches: (v: unknown) => boolean | null,
    danger = false,
  ) {
    if (!ctx.s! || ctx.o.demo || ctx.busy || !navigator.onLine) return;
    ctx.a.sheet(
      title,
      {
        ...ConfirmSheet(
          danger ? '确认' : '确认修改',
          ctx.s!.vehicle.name,
          ctx.s!.vehicle.vin.slice(-6),
          'data-owner-confirm',
          '从 ' + from + ' 改为 ' + to,
        ),
        danger,
      },
      (button) => {
        if (!button.hasAttribute('data-owner-confirm') || ctx.busy || !ctx.active()) return;
        ctx.a.closeSheet();
        ctx.busy = true;
        ctx.note = '';
        ctx.render();
        void changeOnce(
          write,
          () => ctx.read(readKey, { month: ctx.month, period: ctx.period }),
          matches,
          ctx.scope.signal,
        )
          .then((result) => {
            if (ctx.active()) {
              ctx.note = result;
              if (readKey === 'plans' && result === '已生效') ctx.pendingPlan = '';
            }
          })
          .catch(() => {})
          .finally(() => {
            if (ctx.active()) {
              ctx.busy = false;
              ctx.render();
            }
          });
      },
    );
  };
}
