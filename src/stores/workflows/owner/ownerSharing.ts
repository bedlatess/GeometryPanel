import { ownerNumber as num, ownerRows as rows, ownerText as txt } from '../../../core/owner-model';
import { choose } from '../../workflow-actions';
import { maskPhone } from './shared';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.ownerSharing = async function (event: Event) {
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
    if (cmd === 'share-new') {
      const existing = ctx
        .list(readKey)
        .filter((r) => ctx.shareTab === 'long' || Number(r.residualSeconds) > 0);
      if (existing.length >= 3) return;
      ctx.editor = { type: 'share', row: { hours: txt(ctx.list('shareTimes')[0]?.hours) || '24' } };
      ctx.render();
    }
    if (cmd === 'share-hours' && ctx.editor) {
      ctx.editor.row.name = ctx.host.querySelector<HTMLInputElement>(
        '[data-owner-field="name"]',
      )!.value;
      ctx.editor.row.phone = ctx.host.querySelector<HTMLInputElement>(
        '[data-owner-field="phone"]',
      )!.value;
      choose(
        ctx.a,
        '分享时长',
        ctx
          .list('shareTimes')
          .filter((r) => num(r.hours) !== null)
          .map((r) => [txt(r.hours), txt(r.hours) + ' 小时']),
        txt(ctx.editor.row.hours),
        (v) => {
          if (ctx.editor) {
            ctx.editor.row.hours = v;
            ctx.render();
            ctx.host.querySelector<HTMLInputElement>('[data-owner-field="name"]')!.value = txt(
              ctx.editor.row.name,
            );
            ctx.host.querySelector<HTMLInputElement>('[data-owner-field="phone"]')!.value = txt(
              ctx.editor.row.phone,
            );
          }
        },
      );
    }
    if (cmd === 'share-save' && ctx.editor?.type === 'share') {
      const name = ctx.host
          .querySelector<HTMLInputElement>('[data-owner-field="name"]')!
          .value.trim(),
        phone = ctx.host
          .querySelector<HTMLInputElement>('[data-owner-field="phone"]')!
          .value.trim(),
        hours = Number(ctx.editor.row.hours) || 24;
      if (!name || !/^1\d{10}$/.test(phone)) {
        ctx.a.toast('请填写姓名和手机号');
        return;
      }
      ctx.editor = null;
      void ctx.mutate(
        '车辆分享',
        ctx.shareTab === 'long' ? '未分享' : '未分享',
        `${name} ${maskPhone(phone)}　对方可以控制这台车`,
        () =>
          ctx.api.share(
            ctx.s!,
            ctx.shareTab === 'long' ? 'long' : 'temp',
            name,
            phone,
            hours,
            ctx.scope.signal,
          ),
        readKey,
        (v) =>
          Array.isArray(v) ? rows(v).some((r) => (r.sharePhone ?? r.userPhone) === phone) : null,
        true,
      );
      ctx.render();
    }
    if (cmd === 'share-revoke') {
      const r = ctx.list(readKey)[i];
      if (!r) return;
      void ctx.mutate(
        '撤销分享',
        txt(r.shareName ?? r.userName),
        '已撤销',
        () => ctx.api.revokeShare(ctx.s!, r, ctx.scope.signal),
        readKey,
        (v) =>
          Array.isArray(v)
            ? !rows(v).some(
                (x) => x.id === r.id && (ctx.shareTab === 'long' || Number(x.residualSeconds) > 0),
              )
            : null,
        true,
      );
    }
  };
}
