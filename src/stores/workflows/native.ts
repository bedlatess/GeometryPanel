import { ConfirmSheet, type PageActions } from '../workflow-actions';

import { ApiError } from '../../api/client';
import { MeterApi, type WallpaperChoice } from '../../api/meter';
import { NativeMaterialsApi } from '../../api/native-materials';
import type { Session, Snapshot } from '../../core/model';
import { type NativeCapabilities, type NativeClient } from '../../core/native';

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const labels: Record<string, string> = {
  idle: '未连接',
  scanning: '正在搜索',
  connecting: '正在连接',
  connected: '蓝牙已连接',
  connected_unverified: '已连接，等待认证',
  ready: '连接就绪',
  authenticated: '认证通过',
  disconnected: '已断开',
  failed: '连接未完成',
  error: '连接未完成',
};
const commandLabels: Record<string, string> = {
  authenticate: '认证车辆',
  register: '登记手机钥匙',
  query: '查询车端登记',
  telemetryOn: '读取蓝牙车况',
  telemetryOff: '停止读取',
  dashboardOn: '开始仪表数据',
  dashboardOff: '停止仪表数据',
};
export function widgetSnapshot(session: Session, data: Snapshot) {
  return {
    vehicleLabel: session.vehicle.name.slice(0, 80),
    soc: data.soc,
    range: data.range,
    voltage: data.voltage,
    receivedAt: data.receivedAt,
  };
}
export function mountNative(
  host: HTMLElement,
  options: {
    native: NativeClient;
    session: Session | null;
    demo: boolean;
    snapshot: Snapshot | null;
    onExpired(): void;
    onUncertain?(): void;
    section?: 'bluetooth' | 'meter';
    view?: string;
    actions: PageActions;
    publish(value: any): void;
  },
): () => void {
  const { native, session, demo } = options;
  const api = new NativeMaterialsApi();
  const meterApi = new MeterApi();
  const aborter = new AbortController();
  let disposed = false,
    working = false,
    prepared = false,
    mutating = false;
  let capabilities: NativeCapabilities | null = null,
    message = '',
    status: any = null;
  let confirm = '',
    devices: { id: string; name: string; rssi: number | null }[] = [];
  let wallpapers: WallpaperChoice[] = [];
  const allowed = () => !demo && Boolean(session) && !working;
  const has = (key: keyof NativeCapabilities['features']) => capabilities?.features?.[key] === true;

  function render() {
    if (disposed) return;
    options.publish({
      working,
      prepared,
      capabilities,
      message,
      status,
      devices,
      wallpapers,
      labels,
      commandLabels,
    });
  }

  async function run(task: () => Promise<void>) {
    if (working || disposed) return;
    working = true;
    render();
    try {
      await task();
    } catch (error) {
      if (disposed || aborter.signal.aborted) return;
      if (error instanceof ApiError && error.kind === 'expired') {
        prepared = false;
        options.onExpired();
      }
      message =
        error instanceof ApiError && error.kind === 'expired' ? '登录已过期' : '未收到车辆响应';
    } finally {
      working = false;
      render();
    }
  }
  const call = <T = any>(method: Parameters<NativeClient['call']>[0], params: object = {}) =>
    native.call<T>(method, params, aborter.signal);
  const readStatus = async () => {
    status = await call('status');
    prepared = status?.bound === true;
  };
  async function command(action: string) {
    if (!prepared || !session || demo) return;
    mutating = true;
    try {
      const result = await call('ble.command', { action });
      if (action === 'register') {
        if (
          result?.bindAcknowledged !== true ||
          typeof result?.uniqueIdentify !== 'string' ||
          !/^[0-9a-f]{16}$/.test(result.uniqueIdentify)
        ) {
          message = '未收到车辆响应';
          return;
        }
        message = '已更新';
        await api.register(session, result.uniqueIdentify, aborter.signal);
        if (disposed) return;
        await call('ble.command', { action: 'query' });
        message = '已更新';
      } else message = '已更新';
      await readStatus();
    } finally {
      mutating = false;
    }
  }
  function click(event: Event) {
    const element = (event.target as Element).closest<HTMLButtonElement>(
      'button[data-native-action]',
    );
    if (!element || element.disabled || working) return;
    const action = element.dataset.nativeAction!,
      value = element.dataset.value ?? '';
    if (action === 'cancel') {
      confirm = '';
      render();
      return;
    }
    if (
      (action === 'command' && value === 'register') ||
      action === 'forget' ||
      action === 'meter'
    ) {
      confirm = action === 'command' ? value : action === 'meter' ? value : action;
      const label =
        confirm === 'register'
          ? '登记手机钥匙'
          : confirm === 'forget'
            ? '清除车辆资料'
            : confirm === 'cast'
              ? '仪表投屏'
              : '设置仪表壁纸';
      options.actions.sheet(
        label,
        ConfirmSheet(
          '继续',
          session?.vehicle.name ?? '—',
          session?.vehicle.vin.slice(-6) ?? '—',
          'data-native-action="confirm"',
          confirm === 'register'
            ? '登记手机钥匙并保存'
            : confirm === 'forget'
              ? '清除本机车辆资料'
              : '',
        ),
        (button) => {
          if (button.dataset.nativeAction === 'confirm') {
            options.actions.closeSheet();
            click({ target: button } as unknown as Event);
          }
        },
      );
      return;
    }
    const stopping =
      ['disconnect', 'proximity-off', 'notifications-off'].includes(action) ||
      (action === 'confirm' && confirm === 'forget');
    if (action !== 'status' && !(allowed() || (stopping && !demo))) return;
    void run(async () => {
      if (action === 'prepare' && session && !demo) {
        prepared = false;
        const binding = await api.prepare(session, aborter.signal);
        if (disposed) return;
        await call('bindVehicle', binding);
        prepared = true;
        message = '已更新';
      } else if (action === 'scan' && prepared) {
        const result = await call('ble.scan');
        const rows = Array.isArray(result) ? result : result?.devices;
        devices = Array.isArray(rows)
          ? rows
              .slice(0, 30)
              .filter((row) => row && typeof row.id === 'string' && row.id.length <= 80)
              .map((row) => ({
                id: row.id,
                name: typeof row.name === 'string' ? row.name.slice(0, 80) : '',
                rssi:
                  typeof row.rssi === 'number' && Number.isFinite(row.rssi)
                    ? Math.round(row.rssi)
                    : null,
              }))
          : [];
        message = devices.length ? '选择车辆' : '未发现车辆';
      } else if ((action === 'connect' || action === 'device') && prepared) {
        await call('ble.connect', action === 'device' ? { id: value } : {});
        await readStatus();
        message = '已更新';
      } else if (action === 'disconnect') {
        await call('ble.disconnect');
        await readStatus();
        message = '已更新';
      } else if (action === 'command') await command(value);
      else if (action === 'local-tool') {
        await call('tools.open', { tool: value });
      } else if (action === 'status') {
        await readStatus();
        message = '已更新';
      } else if (action.startsWith('proximity-')) {
        await call('ble.proximity', { enabled: action.endsWith('-on') });
        message = action.endsWith('-on') ? '已开启' : '已关闭';
      } else if (action.startsWith('notifications-')) {
        await call('notifications.configure', { enabled: action.endsWith('-on'), lowBattery: 20 });
        message = '已更新';
      } else if (action === 'widget' && session && options.snapshot) {
        await call('widget.update', widgetSnapshot(session, options.snapshot));
        message = '已更新';
      } else if (action === 'confirm') {
        const intent = confirm;
        confirm = '';
        if (intent === 'register') await command('register');
        else if (intent === 'forget') {
          await call('forgetVehicle');
          prepared = false;
          devices = [];
          status = null;
          message = '已更新';
        } else if (intent === 'wallpaper' && session) {
          wallpapers = await meterApi.wallpapers(session, aborter.signal);
          message = wallpapers.length ? '选择壁纸模板' : '壁纸不可用';
        } else if (intent === 'cast' && session) await openMeter(null);
      } else if (action === 'wallpaper' && wallpapers.some((wallpaper) => wallpaper.id === value)) {
        await openMeter(value);
      }
    });
  }
  async function openMeter(wallpaperId: string | null) {
    if (!session || demo) return;
    const context = await meterApi.openContext(session, wallpaperId, aborter.signal);
    if (disposed) return;
    await call('bindVehicle', context.binding);
    await call('meter.open', context.params);
    wallpapers = [];
    message = '已更新';
  }
  host.addEventListener('click', click);
  render();
  if (!demo && native.available)
    void run(async () => {
      const value = await call('capabilities');
      if (
        value?.version === 1 &&
        (value.platform === 'android' || value.platform === 'ios') &&
        value.features &&
        Array.isArray(value.limitations)
      )
        capabilities = value;
      else message = '未收到车辆响应';
      await readStatus();
    });
  let polling = false;
  const timer = setInterval(() => {
    if (
      demo ||
      disposed ||
      working ||
      polling ||
      document.visibilityState !== 'visible' ||
      !native.available ||
      !(
        status?.telemetryRunning ||
        status?.dashboardRunning ||
        status?.telemetrySubscribed ||
        status?.dashboardSubscribed
      )
    )
      return;
    polling = true;
    void call('status')
      .then((value) => {
        if (disposed) return;
        status = value;
        render();
      })
      .catch(() => {})
      .finally(() => (polling = false));
  }, 2000);
  return () => {
    disposed = true;
    clearInterval(timer);
    aborter.abort();
    if (mutating) {
      options.onUncertain?.();
      void native.call('ble.disconnect').catch(() => {});
    }
    host.removeEventListener('click', click);
    // The Vue page owns these nodes; clearing them would blank a re-entered cached page.
  };
}
