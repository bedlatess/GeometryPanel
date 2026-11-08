import { ConfirmSheet, chooseDate } from '../../workflow-actions';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.clicked = function (event: Event) {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (
      !target ||
      (!(event as any).toolbar && !ctx.host.contains(target)) ||
      target.hasAttribute('disabled') ||
      ctx.busy ||
      ctx.expired
    )
      return;
    if (target.dataset.messageTab) {
      ctx.messageTab = target.dataset.messageTab;
      ctx.render();
      return;
    }
    if (target.dataset.monthStep) {
      const d = new Date(ctx.month + '-01T12:00:00');
      d.setMonth(d.getMonth() + Number(target.dataset.monthStep));
      ctx.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      void ctx.load();
      return;
    }
    const action = target.dataset.ext || target.dataset.pageTool;
    if (action === 'pick-day') {
      chooseDate(ctx.options.actions, '日期', ctx.day, (value) => {
        ctx.day = value;
        ctx.options.actions.navigate('/records/ride/' + ctx.day);
      });
      return;
    }
    if (action === 'message') {
      const visible =
          ctx.alerts?.alerts.filter((item) =>
            ctx.messageTab === 'vehicle' ? Boolean(item.vin) : !item.vin,
          ) || [],
        item = visible[Number(target.dataset.message)];
      if (item) ctx.options.actions.navigate('/vehicle/messages/' + encodeURIComponent(item.id));
      return;
    }
    if (action === 'setting') {
      const item = ctx.settings?.find((i) => i.key === target.dataset.key);
      if (!item?.writable || !item.choices || item.value === null || ctx.options.demo) return;
      const binary =
        item.choices.length === 2 && item.choices.every(([v]) => v === '0' || v === '1');
      if (binary) {
        const choice = item.choices.find(([v]) => v !== item.value)!;
        ctx.confirmSetting(item, choice[0], choice[1]);
      } else
        ctx.options.actions.sheet(
          ctx.settingName(item.key, item.title),
          { kind: 'choose', label: '确定', options: item.choices, value: item.value },
          (button) => {
            const choice = item.choices?.find(([v]) => v === button.dataset.value);
            if (choice) ctx.confirmSetting(item, choice[0], choice[1]);
          },
        );
      return;
    }
    if (action === 'track-map') {
      const index = Number(target.dataset.trackIndex);
      if (!ctx.options.demo && Number.isInteger(index) && ctx.tracks?.tracks[index]) {
        ctx.roadMaps.add(index);
        ctx.render();
      }
      return;
    }
    if (action === 'read-messages' || action === 'delete-messages') {
      if (!ctx.options.demo && ctx.session!) {
        const deleting = action === 'delete-messages',
          label = deleting ? '删除全部' : '全部已读';
        ctx.messageConfirmation = deleting ? 'delete' : 'read';
        ctx.options.actions.sheet(
          label,
          ConfirmSheet(
            label,
            ctx.session!.vehicle.name,
            ctx.session!.vehicle.vin.slice(-6),
            'data-ext="confirm-message"',
            '此账号全部车辆',
          ),
          (button) => {
            if (button.dataset.ext === 'confirm-message') {
              ctx.options.actions.closeSheet();
              void ctx.updateMessages();
            }
          },
        );
      }
      return;
    }
    if (action === 'cancel-message') {
      ctx.messageConfirmation = null;
      ctx.render();
      return;
    }
    if (action === 'confirm-message') {
      void ctx.updateMessages();
      return;
    }
    if (action === 'cancel-setting') {
      ctx.confirmation = null;
      ctx.render();
      return;
    }
    if (action === 'confirm-setting') {
      void ctx.write();
      return;
    }
    if (action === 'day-tracks') {
      ctx.options.actions.navigate('/records/rides/' + target.dataset.day!);
      return;
    } else if (action === 'tracks-prev') ctx.trackPage--;
    else if (action === 'tracks-next') ctx.trackPage++;
    else if (action === 'alerts-prev') ctx.alertPage--;
    else if (action === 'alerts-next') ctx.alertPage++;
    else if (action !== 'refresh') return;
    void ctx.load();
  };
}
