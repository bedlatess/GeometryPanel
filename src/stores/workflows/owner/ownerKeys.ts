import {
  ownerNumber as num,
  ownerObject as obj,
  ownerRows as rows,
  ownerText as txt,
} from '../../../core/owner-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.ownerKeys = async function (event: Event) {
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
    if (cmd === 'retry') {
      void ctx.initial();
      return;
    }
    if (cmd === 'editor-cancel') {
      ctx.editor = null;
      ctx.render();
      return;
    }
    if (cmd === 'reset-maintenance') {
      const old = num(ctx.get('maintenance').keepMileage);
      void ctx.mutate(
        '重置保养提醒',
        old === null ? '—' : old + ' km',
        '已完成保养',
        () => ctx.api.resetMaintenance(ctx.s!, ctx.scope.signal),
        'maintenance',
        (v) => (num(obj(v).keepMileage) === null ? null : Number(obj(v).keepMileage) > Number(old)),
        true,
      );
    }
    if (cmd === 'ota-detail') {
      const r = ctx.list('otaTasks')[i];
      const id = txt(r?.iotTaskId);
      if (id) {
        await ctx.loadDetail(id);
      }
    }
    if (cmd === 'auto-head' || cmd === 'fcw') {
      const key = cmd === 'fcw' ? 'radarFcw' : 'automaticLock',
        current = Number(ctx.get('settings')[key]),
        on = cmd === 'fcw' ? current === 1 : current !== 1;
      void ctx.mutate(
        cmd === 'fcw' ? '前碰撞预警' : '自动龙头锁',
        on ? '关闭' : '开启',
        on ? '开启' : '关闭',
        () =>
          cmd === 'fcw'
            ? ctx.api.fcw(ctx.s!, on, ctx.scope.signal)
            : ctx.api.autoHead(ctx.s!, on, ctx.scope.signal),
        'settings',
        (v) => ctx.readMatch(v, key, cmd === 'fcw' ? (on ? 2 : 1) : on ? 1 : 0),
      );
    }
    if (cmd === 'password') {
      ctx.a.sheet(
        '修改车端密码',
        {
          kind: 'form',
          label: '继续',
          data: { passwordNext: '' },
          fields: [
            { label: '新密码', name: 'password', type: 'password' },
            { label: '再次输入', name: 'repeat', type: 'password' },
          ],
        },
        (button) => {
          if (!button.hasAttribute('data-password-next')) return;
          const d = button.closest('#runtime-modal')!,
            p = d.querySelector<HTMLInputElement>('[data-owner-field="password"]')!,
            r = d.querySelector<HTMLInputElement>('[data-owner-field="repeat"]')!;
          let secret = p.value;
          if (!/^\d{4}$/.test(secret) || secret !== r.value) {
            ctx.a.toast('两次密码需为相同的 4 位数字');
            return;
          }
          p.value = r.value = '';
          ctx.a.closeSheet();
          void ctx.mutate(
            '修改车端密码',
            '原密码',
            '新密码',
            () => {
              const v = secret;
              secret = '';
              return ctx.api.password(ctx.s!, v, ctx.scope.signal);
            },
            'settings',
            () => null,
            true,
          );
        },
      );
    }
    if (cmd === 'remove-phone') {
      const r = ctx.phoneKeys()[i];
      if (
        !r ||
        !ctx.identityReady ||
        (ctx.o.native.available && !ctx.ownIdentity) ||
        !r.uniqueIdentify ||
        r.uniqueIdentify === ctx.ownIdentity
      )
        return;
      void ctx.mutate(
        '删除设备',
        txt(r.phoneName),
        '已删除',
        () => ctx.api.removePhoneKey(ctx.s!, txt(r.id), ctx.scope.signal),
        'phoneKeys',
        (v) =>
          Array.isArray(v)
            ? !rows(v)
                .flatMap((r) =>
                  rows(r.inductiveUnlockVOList).length ? rows(r.inductiveUnlockVOList) : [r],
                )
                .some((x) => x.id === r.id)
            : null,
        true,
      );
    }
    if (cmd === 'remove-card') {
      const r = ctx.list('nfcKeys')[i];
      if (!r) return;
      void ctx.mutate(
        '删除卡钥匙',
        txt(r.nfcName),
        '已删除',
        () => ctx.api.removeCard(ctx.s!, txt(r.nfcNo), ctx.scope.signal),
        'nfcKeys',
        (v) => (Array.isArray(v) ? !rows(v).some((x) => x.id === r.id) : null),
        true,
      );
    }
    if (cmd === 'rename-card') {
      const r = ctx.list('nfcKeys')[i];
      if (!r) return;
      ctx.a.sheet(
        '卡钥匙名称',
        {
          kind: 'form',
          label: '继续',
          data: { cardName: '' },
          fields: [{ label: '名称', name: 'name', value: txt(r.nfcName) }],
        },
        (button) => {
          if (!button.hasAttribute('data-card-name')) return;
          const name = button
            .closest('#runtime-modal')!
            .querySelector<HTMLInputElement>('input')!
            .value.trim();
          if (!name) return;
          ctx.a.closeSheet();
          void ctx.mutate(
            '卡钥匙改名',
            txt(r.nfcName),
            name,
            () => ctx.api.renameCard(ctx.s!, txt(r.id), name, ctx.scope.signal),
            'nfcKeys',
            (v) =>
              Array.isArray(v) ? rows(v).some((x) => x.id === r.id && x.nfcName === name) : null,
          );
        },
      );
    }
    if (cmd === 'low-toggle' || cmd === 'low-period') {
      const r = ctx.get('settings'),
        on = Number(r.ultraLowBatteryReminder) === 1,
        start = txt(r.withdrawalStartTime).slice(0, 5) || '07:00',
        end = txt(r.withdrawalEndTime).slice(0, 5) || '21:00';
      const save = (x: string, y: string, next: boolean) =>
        void ctx.mutate(
          '超低电量电话提醒',
          `${on ? '开启' : '关闭'} ${start}–${end}`,
          `${next ? '开启' : '关闭'} ${x}–${y}`,
          () => ctx.api.lowPhone(ctx.s!, next, x, y, ctx.scope.signal),
          'settings',
          (v) =>
            obj(v).ultraLowBatteryReminder === undefined
              ? null
              : Number(obj(v).ultraLowBatteryReminder) === (next ? 1 : 0) &&
                txt(obj(v).withdrawalStartTime).slice(0, 5) === x &&
                txt(obj(v).withdrawalEndTime).slice(0, 5) === y,
        );
      if (cmd === 'low-period') ctx.times('提醒时段', start, end, (x, y) => save(x, y, on));
      else save(start, end, !on);
    }
  };
}
