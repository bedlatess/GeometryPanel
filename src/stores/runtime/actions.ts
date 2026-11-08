import {
  ActionSheet,
  ConfirmSheet,
  dataSheet,
  hornSheet,
  PickerSheet,
  shortcutNames,
  vehiclePicker,
} from '../../app/sheet-model';
type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { version } from '../../../package.json';
import { type VehicleAction } from '../../api/controls';
import { demoSnapshot, demoVehicle } from '../../core/model';
import { downloadPanelImage, panelImage } from '../../core/panel-export';

import { managePageCache } from '../../core/cache';
import { commandSummary } from '../../core/command-report';

import { exportPreferences } from '../../app/home-layout';
import { defaultPreferences } from '../../core/preferences';
import { navigationLinks } from '../../core/navigation';

import { type RuntimeContext } from './context';
export function registeractions(ctx: RuntimeContext) {
  ctx.handleAction = function (event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (ctx.booting || ctx.updating) return;
    if (action === 'page-toolbar') {
      ctx.toolbarClick?.(button);
      return;
    }
    if (action === 'route') {
      ctx.router.navigate(button.dataset.value!);
      return;
    }
    if (action === 'back') {
      ctx.router.back();
      return;
    }
    if (action === 'preview') {
      if (!ctx.preview) {
        ctx.realPreferences = ctx.preferences;
        ctx.preferences = structuredClone(defaultPreferences);
        ctx.preview = true;
      } else {
        ctx.preview = false;
        if (ctx.realPreferences) ctx.preferences = ctx.realPreferences;
        ctx.realPreferences = null;
      }
      ctx.notice = '';
      ctx.resetLever();
      ctx.applyPreferences(false);
      ctx.router.navigate('/vehicle');
      ctx.render();
    }
    if (action === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (action === 'data-status')
      ctx.show('数据状态', dataSheet(ctx.preview ? demoSnapshot : ctx.reading));
    if (action === 'vehicle-picker' && !ctx.busy) {
      if (ctx.preview) ctx.show('切换车辆', { kind: 'picker' });
      else ctx.show('切换车辆', vehiclePicker(ctx.accountBook));
    }
    if (action === 'more')
      ctx.show(
        '更多',
        ActionSheet([
          ['寻车', 'horn', 'horn'],
          ['座桶', 'seat', 'vehicle-action', 'seat'],
          ['位置', 'pin', 'route', '/vehicle/location'],
          ['车况', 'pulse', 'route', '/vehicle/status'],
          ['车辆设置', 'gear', 'route', '/vehicle/settings'],
          ['骑行', 't-rec', 'route', '/records?tab=ride'],
          ['电池', 'batt', 'route', '/records?tab=battery'],
          ['胎压', 'tire', 'route', '/records?tab=tire'],
          ['消息', 'bell', 'route', '/vehicle/messages'],
          ['高声寻车', 'horn', 'horn-high'],
          ['打开储物箱', 'seat', 'storage'],
          ['分享车况图片', 'image', 'status-export'],
          ['查看上次车控结果', 'info', 'command-report'],
          ['首页按钮', 'gear', 'route', '/me/home'],
        ]),
      );
    if (action === 'walk' && !ctx.preview) {
      const links = navigationLinks(ctx.reading?.daily.location ?? null);
      if (links?.walk) window.open(links.walk, '_blank', 'noopener,noreferrer');
    }
    if (action === 'connect' && !ctx.busy) ctx.showPhone();
    if (action === 'status-export' && !ctx.busy && (ctx.preview || ctx.reading)) {
      void (async () => {
        try {
          const image = await panelImage(
            ctx.preview ? demoSnapshot : ctx.reading!,
            ctx.preview,
            ctx.vehicle()?.name,
          );
          if (ctx.native.available)
            void ctx.run(async () => {
              await ctx.native.call('asset.export', { kind: 'panel', ...image });
              ctx.notice = '已导出';
            });
          else downloadPanelImage(image);
        } catch {
          ctx.notice = '导出失败';
          ctx.render();
        }
      })();
    }
    if (action === 'switch' && ctx.session && !ctx.busy && !ctx.expired) {
      const bound = ctx.session;
      ctx.pending = { token: bound.token, uid: bound.uid, vehicles: [] };
      void ctx.run(ctx.retrieveCars, { bound });
    }
    if (action === 'theme' && ['system', 'light', 'dark'].includes(button.dataset.value ?? '')) {
      ctx.preferences.theme = button.dataset.value as typeof ctx.preferences.theme;
      ctx.applyPreferences();
      ctx.render();
    }
    if (action === 'voltage') {
      ctx.preferences.voltage = !ctx.preferences.voltage;
      ctx.applyPreferences();
      ctx.render();
    }
    if (action === 'range') {
      ctx.preferences.range = !ctx.preferences.range;
      ctx.applyPreferences();
      ctx.render();
    }
    if (action === 'foreground-refresh') {
      ctx.preferences.foregroundRefresh = !ctx.preferences.foregroundRefresh;
      ctx.applyPreferences();
      ctx.render();
    }
    if (action === 'map' && !ctx.preview && !ctx.busy && navigator.onLine) {
      ctx.mapVisible = !ctx.mapVisible;
      ctx.render();
    }
    if (action === 'account-backup-export' || action === 'account-backup-import') {
      ctx.showAccountBackup(action.endsWith('export'));
      return;
    }
    if (action === 'version') {
      if (++ctx.versionTaps >= 5) {
        ctx.developer = true;
        ctx.render();
      }
    }
    if (action === 'pick-start')
      ctx.show(
        '打开后的首页',
        PickerSheet(
          [
            ['vehicle', '车辆'],
            ['records', '记录'],
            ['tools', '工具'],
            ['me', '我的'],
          ],
          ctx.preferences.startPage,
          'start-value',
        ),
      );
    if (action === 'pick-shortcut')
      ctx.show(
        '首页按键',
        PickerSheet(
          Object.entries(shortcutNames),
          ctx.preferences.shortcut[Number(button.dataset.value)],
          'shortcut-' + button.dataset.value,
        ),
      );
    if (action === 'download-app') ctx.show('下载 App', { kind: 'download' });
    if (action === 'export-preferences')
      ctx.downloadText(exportPreferences(ctx.preferences, ctx.preview), 'geometry-config.json');
    if (action === 'import-preferences') ctx.show('导入配置', { kind: 'preferences' });
    if (action === 'copy-preferences') ctx.copyPreferences();
    if (action === 'reset-preferences')
      ctx.show(
        '恢复默认',
        ConfirmSheet('恢复默认', '使用偏好', '—', 'data-action="confirm-reset-preferences"'),
      );
    if (action === 'command-report' && ctx.lastCommandReport && !ctx.busy) {
      ctx.router.navigate('/tools/diagnostics');
      return;
    }
    if (action === 'export-command-report' && ctx.lastCommandReport)
      ctx.downloadText(commandSummary(ctx.lastCommandReport, version), 'geometry-command.txt');
    if (action === 'parity-export')
      void fetch(import.meta.env.BASE_URL + 'verification/original-parity.json')
        .then((r) => r.text())
        .then((t) => ctx.downloadText(t, 'geometry-functions.json'));
    if ((action === 'cache-status' || action === 'cache-clear') && !ctx.busy)
      void ctx.run(async () => {
        const result = await managePageCache(action === 'cache-clear');
        ctx.notice = result.includes('未')
          ? '加载失败'
          : action === 'cache-clear'
            ? '已清理'
            : '离线数据已就绪';
      });
    if (
      action === 'check-update' &&
      !ctx.busy &&
      !ctx.modal.open &&
      !ctx.checkingUpdate &&
      navigator.onLine
    ) {
      ctx.checkingUpdate = true;
      ctx.render();
      void (ctx.updates?.check() ?? Promise.resolve('unavailable'))
        .then((result) => {
          ctx.notice =
            result === 'ready' || ctx.updateReady
              ? '新版本已就绪'
              : result === 'current'
                ? '已是最新版本'
                : '加载失败';
        })
        .finally(() => {
          ctx.checkingUpdate = false;
          ctx.render();
        });
    }
    if (action === 'refresh') void ctx.refresh();
    if (action === 'update' && !ctx.busy && !ctx.modal.open && navigator.onLine) {
      ctx.updating = true;
      ctx.render();
      ctx.updates?.activate();
    }
    if (action === 'horn' && !ctx.busy && navigator.onLine && !ctx.expired) {
      if (ctx.preview) {
        ctx.show('寻车', hornSheet(demoVehicle));
        return;
      }
      if (ctx.session) {
        ctx.show('寻车', hornSheet(ctx.session.vehicle));
        ctx.commandTarget = ctx.session;
        ctx.commandIntent = 'horn';
      }
    }
    if (action === 'horn-high' && !ctx.busy && navigator.onLine && !ctx.expired) {
      if (ctx.preview) ctx.show('寻车', hornSheet(demoVehicle, 'high'));
      else if (ctx.session) {
        ctx.show('寻车', hornSheet(ctx.session.vehicle, 'high'));
        ctx.commandTarget = ctx.session;
        ctx.commandIntent = 'horn';
      }
    }
    if (action === 'storage') void ctx.openStorage();
    if (
      action === 'vehicle-action' &&
      !ctx.busy &&
      navigator.onLine &&
      !ctx.expired &&
      ['powerOn', 'powerOff', 'seat'].includes(button.dataset.value ?? '')
    )
      ctx.presentControl(button.dataset.value as VehicleAction);
    if (action === 'logout' && !ctx.busy && !ctx.preview)
      ctx.show(
        '退出全部账号',
        ConfirmSheet(
          '退出全部账号',
          '本机全部账号',
          '—',
          'data-action="confirm-logout"',
          '移除本机登录和后台绑定',
        ),
      );
  };
  ctx.action = function (action: string, value?: string, attributes: Record<string, string> = {}) {
    const button = document.createElement('button');
    button.dataset.action = action;
    if (value !== undefined) button.dataset.value = value;
    Object.assign(button.dataset, attributes);
    ctx.handleAction({ target: button } as unknown as MouseEvent);
    ctx.render();
  };
}
