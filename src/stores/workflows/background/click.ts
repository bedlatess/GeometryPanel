import { nativeAccounts } from '../../../core/accounts';
import { authorizeNativeAccounts, saveBackgroundPreferences } from '../../../core/background';
import { historyCsv } from '../../../core/history';
import { clearLocalHistory } from '../../../core/history-store';
import { ConfirmSheet, choose, chooseDate } from '../../workflow-actions';
import { download } from './shared';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.click = function (event: Event) {
    const element = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!element || element.disabled || ctx.working) return;
    if (element.dataset.backgroundSection) {
      ctx.section = element.dataset.backgroundSection as typeof ctx.section;
      ctx.confirmingClear = false;
      ctx.render();
      if (ctx.section === 'history') void ctx.task(ctx.loadHistory);
      return;
    }
    const action = element.dataset.background;
    if (action === 'history-info') {
      ctx.options.actions.navigate('/records/battery/info');
      return;
    }
    if (action === 'pick-vehicle') {
      choose(
        ctx.options.actions,
        '目标车辆',
        ctx.vehicles.map((c) => [c.id, c.accountLabel + '　' + c.label]),
        ctx.selected,
        (value) => {
          ctx.selected = value;
          ctx.loadDesktop();
          ctx.render();
          if (ctx.section === 'history') void ctx.task(ctx.loadHistory);
        },
      );
      return;
    }
    if (action === 'custom-range') {
      chooseDate(ctx.options.actions, '起始日期', ctx.startTime, (value) => {
        ctx.startTime = value;
        chooseDate(ctx.options.actions, '截止日期', ctx.endTime || value, (end) => {
          ctx.endTime = end + 'T23:59:59';
          ctx.range = 'custom';
          ctx.render();
        });
      });
      return;
    }
    if (action === 'pick-threshold') {
      choose(
        ctx.options.actions,
        '低电提醒',
        Array.from({ length: 16 }, (_, i) => [String((i + 1) * 5), (i + 1) * 5 + '%']),
        String(ctx.preferences.lowBatteryThreshold),
        (value) => {
          ctx.preferences.lowBatteryThreshold = Number(value);
          ctx.render();
        },
      );
      return;
    }
    if (!action || ctx.demo) return;
    if (action === 'toggle-monitor') {
      ctx.monitorEnabled = !ctx.monitorEnabled;
      ctx.render();
      return;
    }
    if (action === 'history-clear') {
      const car = ctx.vehicles.find((v) => v.id === ctx.selected);
      ctx.options.actions.sheet(
        '清除本机记录',
        ConfirmSheet(
          '清除本机记录',
          car?.label ?? '—',
          car?.vin.slice(-6) ?? '—',
          'data-background="history-confirm-clear"',
          '清除当前分类记录',
        ),
        (button) => {
          if (button.dataset.background === 'history-confirm-clear') {
            ctx.options.actions.closeSheet();
            ctx.click({ target: button } as unknown as Event);
          }
        },
      );
      return;
    }
    void ctx.task(async () => {
      if (action === 'save-monitor') {
        if (ctx.monitorEnabled) await authorizeNativeAccounts(ctx.native, ctx.book);
        ctx.status = await ctx.call('background.configure', {
          enabled: ctx.monitorEnabled,
          ...nativeAccounts(ctx.book),
          ...ctx.preferences,
        });
        saveBackgroundPreferences(ctx.preferences);
        ctx.message = '已保存';
      } else if (
        action.startsWith('history-') &&
        ['battery', 'charge', 'events'].includes(action.slice(8))
      ) {
        ctx.section = 'history';
        ctx.kind = action.slice(8) as typeof ctx.kind;
        await ctx.loadHistory();
      } else if (action === 'enable') {
        await authorizeNativeAccounts(ctx.native, ctx.book);
        ctx.status = await ctx.call('background.configure', {
          enabled: true,
          ...nativeAccounts(ctx.book),
          ...ctx.preferences,
        });
        saveBackgroundPreferences(ctx.preferences);
        ctx.message = '已更新';
      } else if (action === 'disable') {
        ctx.status = await ctx.call('background.configure', {
          enabled: false,
          ...nativeAccounts(ctx.book),
          ...ctx.preferences,
        });
        ctx.message = '已更新';
      } else if (action === 'status') ctx.status = await ctx.call('background.status');
      else if (action === 'run') {
        await authorizeNativeAccounts(ctx.native, ctx.book);
        ctx.status = await ctx.call('background.run', { vehicleId: ctx.selected });
        ctx.message = '已更新';
      } else if (action === 'history-clear') ctx.confirmingClear = true;
      else if (action === 'history-cancel-clear') ctx.confirmingClear = false;
      else if (action === 'history-confirm-clear') {
        if (ctx.useNativeHistory())
          await ctx.call('history.clear', {
            vehicleId: ctx.selected,
            kind: ctx.kind,
            confirmed: true,
          });
        else await clearLocalHistory(ctx.selected, ctx.kind);
        ctx.confirmingClear = false;
        await ctx.loadHistory();
        ctx.message = '已清除';
      } else if (action === 'history-export')
        download(
          historyCsv(ctx.filteredItems(), ctx.kind),
          `geometry-${ctx.kind}-history.csv`,
          'text/csv;charset=utf-8',
        );
      else if (action === 'history-more') await ctx.loadHistory(true);
      else if (action === 'widget-save') {
        await authorizeNativeAccounts(ctx.native, ctx.book);
        await ctx.call('widget.configure', {
          vehicleId: ctx.selected,
          style: ctx.style,
          controls: ctx.controls,
        });
        ctx.saveDesktop();
        ctx.message = '已更新';
      } else if (action === 'widget-pin') {
        await ctx.call('widget.pin', { style: ctx.style });
        ctx.message = '已更新';
      } else if (action === 'shortcuts') {
        await authorizeNativeAccounts(ctx.native, ctx.book);
        await ctx.call('shortcuts.configure', {
          vehicleId: ctx.selected,
          actions: ['refresh', 'unlock', 'lock', 'horn', 'seat'],
        });
        ctx.message = '已更新';
      } else if (action === 'widget-reset') {
        ctx.controls = false;
        await authorizeNativeAccounts(ctx.native, ctx.book);
        await ctx.call('widget.configure', {
          vehicleId: ctx.selected,
          style: ctx.style,
          controls: ctx.controls,
        });
        ctx.saveDesktop();
        ctx.message = '已更新';
      } else if (action.startsWith('tool-'))
        await ctx.call('tools.open', { tool: action.slice(5) });
      else if (action === 'diagnostics') {
        await ctx.call('diagnostics.export');
        ctx.message = '已导出';
      } else if (action === 'update-check') {
        const result = await ctx.call('updates.check');
        ctx.updateAvailable = result.available || result.updateAvailable;
        ctx.message = ctx.updateAvailable ? '新版本已就绪' : '已是最新版本';
      } else if (action === 'update-install') await ctx.call('updates.install');
      else if (action === 'keepalive') await ctx.call('keepalive.export');
      else if (action === 'official-start') await ctx.call('officialLogin.start');
      else if (action === 'official-stop') await ctx.call('officialLogin.stop');
      else if (action === 'official-result') {
        const result = await ctx.call('officialLogin.result', { importToPanel: true });
        if (result.imported && result.session && ctx.options.onImported)
          await ctx.options.onImported(result.session);
        else ctx.message = result.imported || result.accountId ? '已连接' : '未连接';
      }
    });
  };
}
