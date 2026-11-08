import { settingDefinitions } from '../../../core/extensions-model';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.submitted = function (event: Event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !ctx.host.contains(form)) return;
    event.preventDefault();
    if (ctx.busy || ctx.expired) return;
    const values = new FormData(form);
    if (form.hasAttribute('data-ext-filter')) {
      const period = String(values.get('period') ?? '');
      if (ctx.tab === 'ride') ctx.month = period;
      else {
        ctx.day = period;
        ctx.trackPage = 1;
      }
      void ctx.load();
      return;
    }
    if (!form.dataset.extSetting || ctx.options.demo || !ctx.session!) return;
    const setting = ctx.settings?.find((item) => item.key === form.dataset.extSetting),
      value = String(values.get('value') ?? '');
    const label = setting?.choices?.find(([id]) => id === value)?.[1];
    if (
      !setting?.writable ||
      !label ||
      (setting.key !== 'cloudInductiveEnabled' &&
        !settingDefinitions.some((item) => item.key === setting.key))
    )
      return;
    if (value === setting.value) {
      ctx.note = '已更新';
      ctx.render();
      return;
    }
    ctx.confirmation = { setting, value, label };
    ctx.error = '';
    ctx.note = '';
    ctx.render();
    ctx.host.querySelector<HTMLElement>('[data-ext="confirm-setting"]')?.focus();
  };
}
