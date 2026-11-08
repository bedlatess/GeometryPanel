import { type VehicleSetting } from '../../../core/extensions-model';
import { ConfirmSheet } from '../../workflow-actions';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.confirmSetting = function (setting: VehicleSetting, value: string, label: string) {
    if (ctx.options.demo || !ctx.session! || !setting.writable || value === setting.value) return;
    ctx.confirmation = { setting, value, label };
    ctx.options.actions.sheet(
      ctx.settingName(setting.key, setting.title),
      ConfirmSheet(
        '确认修改',
        ctx.session!.vehicle.name,
        ctx.session!.vehicle.vin.slice(-6),
        'data-ext="confirm-setting"',
        `从 ${setting.display} 改为 ${label}`,
      ),
      (button) => {
        if (button.dataset.ext === 'confirm-setting') {
          ctx.options.actions.closeSheet();
          void ctx.write();
        }
      },
    );
  };
}
