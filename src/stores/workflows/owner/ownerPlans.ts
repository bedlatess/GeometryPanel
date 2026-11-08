import { ownerRows as rows, ownerText as txt } from '../../../core/owner-model';
import { ConfirmSheet } from '../../workflow-actions';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.ownerPlans = async function (event: Event) {
    const b = (event.target as Element).closest<HTMLElement>('button');
    if (!b || b.hasAttribute('disabled') || ctx.busy) return;
    const cmd = b.dataset.owner,
      i = Number(b.dataset.index);
    if (!cmd || ctx.o.demo || !ctx.s!) return;
    const readKey = ctx.path.endsWith('/sharing')
      ? ctx.shareTab === 'long'
        ? 'shareLong'
        : 'shareTemp'
      : 'settings';
    if (cmd === 'plan-new' || cmd === 'plan-edit') {
      ctx.editor = {
        type: 'plan',
        row:
          cmd === 'plan-edit'
            ? { ...ctx.list('plans')[i] }
            : { startTime: '07:00', endTime: '21:00' },
      };
      ctx.render();
    }
    if (cmd === 'plan-time' && ctx.editor) {
      ctx.times('充电时段', txt(ctx.editor.row.startTime), txt(ctx.editor.row.endTime), (x, y) => {
        if (ctx.editor) {
          ctx.editor.row.startTime = x;
          ctx.editor.row.endTime = y;
          ctx.render();
        }
      });
    }
    if (cmd === 'plan-save' && ctx.editor?.type === 'plan') {
      const r = { ...ctx.editor.row },
        old = ctx.list('plans').find((x) => x.id === r.id);
      ctx.editor = null;
      ctx.a.sheet(
        '充电计划',
        ConfirmSheet(
          '保存并启用',
          ctx.s!.vehicle.name,
          ctx.s!.vehicle.vin.slice(-6),
          'data-plan-confirm',
          `从 ${old ? txt(old.startTime) + '–' + txt(old.endTime) : '无计划'} ` +
            `改为 ${txt(r.startTime)}–${txt(r.endTime)}`,
        ),
        (button) => {
          if (button.hasAttribute('data-plan-confirm') && !ctx.busy) {
            ctx.a.closeSheet();
            void ctx.savePlan(r);
          }
        },
      );
      ctx.render();
    }
    if (cmd === 'plan-use' || cmd === 'plan-retry') {
      const r = cmd === 'plan-retry' ? { id: ctx.pendingPlan, delFlag: '1' } : ctx.list('plans')[i];
      if (!r) return;
      const on = String(r.delFlag) !== '0';
      void ctx.mutate(
        '充电计划',
        on ? '未启用' : '已启用',
        on ? '已启用' : '未启用',
        () => ctx.api.usePlan(ctx.s!, txt(r.id), on, ctx.scope.signal),
        'plans',
        (v) =>
          Array.isArray(v)
            ? rows(v).some((x) => x.id === r.id && String(x.delFlag) === (on ? '0' : '1'))
            : null,
      );
    }
  };
}
