import { ApiError, messageFor } from '../api/client';
import { NativeMaterialsApi } from '../api/native-materials';
import { MeterApi, type WallpaperChoice } from '../api/meter';
import { nativeMessage, type NativeCapabilities, type NativeClient } from '../core/native';
import type { Session, Snapshot } from '../core/model';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const labels: Record<string, string> = { idle: '未连接', scanning: '正在搜索', connecting: '正在连接', connected: '蓝牙已连接', connected_unverified: '已连接，等待认证', ready: '连接就绪', authenticated: '认证通过', disconnected: '已断开', failed: '连接未完成', error: '连接未完成' };
const commandLabels: Record<string, string> = { authenticate: '认证车辆', register: '登记本手机钥匙', query: '查询车端登记', telemetryOn: '开始读取蓝牙车况', telemetryOff: '停止读取蓝牙车况', dashboardOn: '开始仪表数据', dashboardOff: '停止仪表数据' };
export function widgetSnapshot(session: Session, data: Snapshot) {
  return { vehicleLabel: session.vehicle.name.slice(0, 80), soc: data.soc, range: data.range, voltage: data.voltage, receivedAt: data.receivedAt };
}
export function mountNative(host: HTMLElement, options: { native: NativeClient; session: Session | null; demo: boolean; snapshot: Snapshot | null; onExpired(): void; onUncertain?(): void }): () => void {
  const { native, session, demo } = options;
  const api = new NativeMaterialsApi();
  const meterApi = new MeterApi();
  const aborter = new AbortController();
  let disposed = false, working = false, prepared = false, mutating = false;
  let capabilities: NativeCapabilities | null = null, message = '', status: any = null;
  let confirm = '', devices: { id: string; name: string; rssi: number | null }[] = [];
  let wallpapers: WallpaperChoice[] = [];
  const allowed = () => !demo && Boolean(session) && !working;
  const has = (key: keyof NativeCapabilities['features']) => capabilities?.features?.[key] === true;
  const button = (action: string, label: string, enabled: boolean, value = '') => `<button class="control-button" data-native-action="${action}" data-value="${escape(value)}" ${enabled ? '' : 'disabled'}>${escape(label)}</button>`;
  function readings() {
    const data = status?.telemetry;
    if (!data || typeof data !== 'object') return '';
    const values: [string, unknown, string, number, number][] = [
      ['蓝牙电量', data.soc ?? data.socPercent, '%', 0, 100], ['蓝牙电压', data.voltage ?? data.voltageV, 'V', 0, 200],
      ['蓝牙温度', data.temperature ?? data.temperatureC, '℃', -50, 150], ['仪表速度', data.speedKph, 'km/h', 0, 300],
    ];
    const rows = values.flatMap(([name, value, unit, min, max]) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
      ? [`<div><dt>${name}</dt><dd>${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${unit}</dd></div>`] : []);
    if (!rows.length) return '';
    const time = status.telemetryAt ?? data.receivedAt;
    return `<dl class="details-list">${rows.join('')}</dl><p class="fine-print">旧版协议映射，仍需核对车型。${typeof time === 'number' && time > 0 && Number.isFinite(time) ? `最近采样 ${escape(new Date(time).toLocaleTimeString('zh-CN'))}${Date.now() - time > 15000 ? ' · 读数较早' : ''}` : '采样时间未知'}</p>`;
  }
  function render() {
    if (disposed) return;
    if (!native.available) {
      host.innerHTML = '<p>Safari 与主屏幕版可使用全部已接入的云端功能。蓝牙、系统组件和仪表传输需要安装包。</p><p><a class="secondary-link" href="https://github.com/bedlatess/GeometryPanel/releases" target="_blank" rel="noopener noreferrer">下载 Android APK / 自签 iOS IPA</a></p><p class="muted">IPA 需要使用者自行签名；不签名可继续用 Safari 添加到主屏幕。</p>';
      return;
    }
    const state = typeof status?.state === 'string' ? labels[status.state] ?? '设备状态已读取' : '等待读取设备状态';
    const read = allowed(), control = read && prepared;
    host.innerHTML = `<p>${demo ? '演示模式：原生控制已停用。' : session ? '请在车旁完成首次连接。蓝牙资料按当前账号和车辆准备。' : '先登录并连接车辆，再使用原生能力。'}</p>
      <p>${escape(capabilities?.platform === 'ios' ? 'iOS 原生容器' : capabilities?.platform === 'android' ? 'Android 原生容器' : '正在识别原生能力…')} · <span data-native-state>${escape(state)}</span></p>
      <div data-native-readings>${readings()}</div>
      ${has('ble') ? `<section class="settings-card"><h3>蓝牙钥匙与车况</h3><p>旧版蓝牙协议仍需车型确认。认证、登记和车端确认分开显示；连接成功不代表自动解锁。</p><div class="control-grid">
      ${button('prepare', '准备 / 刷新蓝牙资料', read && navigator.onLine)}${button('scan', '搜索车辆蓝牙', control)}${button('connect', '连接已绑定车辆', control && capabilities?.platform === 'android')}${button('disconnect', '断开蓝牙', !working && !demo)}
      ${Object.entries(commandLabels).map(([action, label]) => button('command', label, control, action)).join('')}</div>
      ${devices.length ? `<p>选择你的车辆。iOS 不提供蓝牙 MAC，连接前请核对车旁设备。</p><div class="vehicle-list">${devices.map(device => `<button class="vehicle-choice" data-native-action="device" data-value="${escape(device.id)}" ${control ? '' : 'disabled'}>${escape(device.name || '附近车辆')} ${device.rssi == null ? '' : `· ${device.rssi} dBm`}</button>`).join('')}</div>` : ''}
      ${status?.authenticated === true ? '<p>协议认证：通过</p>' : ''}${status?.bindAcknowledged === true ? '<p>本机登记：已收到车端回执</p>' : ''}${status?.vehicleRegistered === true ? '<p>车端登记查询：已确认</p>' : ''}</section>` : ''}
      ${has('proximity') ? `<section class="settings-card"><h3>连接提醒</h3><p>用户主动开启后，按当前平台检测车辆信号或连接变化并提醒。系统可能暂停后台任务；不承诺靠近自动解锁。</p><div class="control-grid">${button('proximity-on', '开启连接提醒', control)}${button('proximity-off', '停止连接提醒', !working && !demo)}</div></section>` : ''}
      ${has('notifications') || has('widget') ? `<section class="settings-card"><h3>系统提醒与桌面组件</h3><p>使用最近一次读取的车况，显示更新时间。没有持续获取云端车况；系统提醒也受手机权限和后台策略影响。</p><div class="control-grid">${has('notifications') ? button('notifications-on', '开启低电量提醒（20%）', read) + button('notifications-off', '关闭低电量提醒', !working && !demo) : ''}${has('widget') ? button('widget', '更新桌面组件', read && Boolean(options.snapshot)) : ''}</div></section>` : ''}
      ${has('meter') ? `<section class="settings-card"><h3>仪表工具</h3><p>仅适用于兼容旧版协议的仪表，按原生页面选择图片和连接车辆 Wi-Fi。传输时保持停车。</p><div class="control-grid">${button('meter', '设置仪表壁纸', read, 'wallpaper')}${button('meter', '仪表投屏', read, 'cast')}</div></section>` : ''}
      ${wallpapers.length ? `<section class="settings-card"><h3>选择壁纸配置模板</h3><p>保留所选模板的仪表编号与显示配置，在原生工具中换成自己的图片。不会自动应用云端壁纸。</p><div class="vehicle-list">${wallpapers.map(wallpaper => `<button class="vehicle-choice" data-native-action="wallpaper" data-value="${escape(wallpaper.id)}" ${read ? '' : 'disabled'}>${escape(wallpaper.name)}</button>`).join('')}</div></section>` : ''}
      ${capabilities?.limitations?.length ? `<details><summary>当前平台能力说明</summary>${capabilities.limitations.slice(0, 12).map(item => `<p>${escape(String(item).slice(0, 500))}</p>`).join('')}</details>` : ''}
      <button class="text-button" data-native-action="status" ${working ? 'disabled' : ''}>读取设备状态</button>
      ${button('forget', '忘记本机车辆资料', !working && !demo)}
      ${confirm ? `<section class="settings-card"><p>${escape(confirm === 'register' ? '将为当前车辆登记本手机钥匙，并向云端保存登记。只应在车旁、确认这是自己的车辆时继续。' : confirm === 'forget' ? '清除本 App 的车辆材料、提醒与组件摘要。车端钥匙和系统配对不会自动撤销。' : '将打开仪表工具；实际传输前还需按系统提示确认。')}</p><div class="control-grid">${button('confirm', '确认继续', !working, confirm)}${button('cancel', '取消', !working)}</div></section>` : ''}
      <p class="form-message" role="status" aria-live="polite">${escape(working ? '正在处理，请稍候…' : message)}</p>`;
  }
  async function run(task: () => Promise<void>) {
    if (working || disposed) return;
    working = true; render();
    try { await task(); }
    catch (error) {
      if (disposed || aborter.signal.aborted) return;
      if (error instanceof ApiError && error.kind === 'expired') { prepared = false; options.onExpired(); }
      message = error instanceof ApiError ? messageFor(error) : nativeMessage(error);
    } finally { working = false; render(); }
  }
  const call = <T = any>(method: Parameters<NativeClient['call']>[0], params: object = {}) => native.call<T>(method, params, aborter.signal);
  const readStatus = async () => { status = await call('status'); };
  async function command(action: string) {
    if (!prepared || !session || demo) return;
    mutating = true;
    try {
    const result = await call('ble.command', { action });
    if (action === 'register') {
      if (result?.bindAcknowledged !== true || typeof result?.uniqueIdentify !== 'string' || !/^[0-9a-f]{16}$/.test(result.uniqueIdentify)) { message = '未收到完整登记回执，未保存云端登记。'; return; }
      message = '已收到本机登记回执，正在保存云端登记。';
      await api.register(session, result.uniqueIdentify, aborter.signal);
      if (disposed) return;
      await call('ble.command', { action: 'query' });
      message = '云端登记已提交，请查看车端登记查询状态；自动解锁仍需实车确认。';
    } else message = `${commandLabels[action] ?? '蓝牙操作'}已返回，请以设备状态和实车表现为准。`;
    await readStatus();
    } finally { mutating = false; }
  }
  function click(event: Event) {
    const element = (event.target as Element).closest<HTMLButtonElement>('button[data-native-action]');
    if (!element || element.disabled || working) return;
    const action = element.dataset.nativeAction!, value = element.dataset.value ?? '';
    if (action === 'cancel') { confirm = ''; render(); return; }
    if (action === 'command' && value === 'register' || action === 'forget' || action === 'meter') { confirm = action === 'command' ? value : action === 'meter' ? value : action; render(); return; }
    const stopping = ['disconnect', 'proximity-off', 'notifications-off'].includes(action) || action === 'confirm' && confirm === 'forget';
    if (action !== 'status' && !(allowed() || stopping && !demo)) return;
    void run(async () => {
      if (action === 'prepare' && session && !demo) {
        prepared = false;
        const binding = await api.prepare(session, aborter.signal);
        if (disposed) return;
        await call('bindVehicle', binding); prepared = true;
        message = `蓝牙资料已准备，感应代际 ${binding.inductiveGeneration > 0 ? binding.inductiveGeneration : '未明确'}，五分钟后需刷新。`;
      } else if (action === 'scan' && prepared) {
        const result = await call('ble.scan');
        const rows = Array.isArray(result) ? result : result?.devices;
        devices = Array.isArray(rows) ? rows.slice(0, 30).filter(row => row && typeof row.id === 'string' && row.id.length <= 80).map(row => ({ id: row.id, name: typeof row.name === 'string' ? row.name.slice(0, 80) : '', rssi: typeof row.rssi === 'number' && Number.isFinite(row.rssi) ? Math.round(row.rssi) : null })) : [];
        message = devices.length ? '请选择自己的车辆连接。' : '未发现可选车辆，请确认车辆蓝牙已开启。';
      } else if ((action === 'connect' || action === 'device') && prepared) { await call('ble.connect', action === 'device' ? { id: value } : {}); await readStatus(); message = '连接流程已返回，请继续认证或查询状态。'; }
      else if (action === 'disconnect') { await call('ble.disconnect'); await readStatus(); message = '已请求断开蓝牙。'; }
      else if (action === 'command') await command(value);
      else if (action === 'status') { await readStatus(); message = '设备状态已读取。'; }
      else if (action.startsWith('proximity-')) { await call('ble.proximity', { enabled: action.endsWith('-on') }); message = action.endsWith('-on') ? '连接提醒已开启；此功能不代表自动解锁。' : '连接提醒已停止。'; }
      else if (action.startsWith('notifications-')) { await call('notifications.configure', { enabled: action.endsWith('-on'), lowBattery: 20 }); message = '系统提醒设置已提交，请留意系统授权提示。'; }
      else if (action === 'widget' && session && options.snapshot) { await call('widget.update', widgetSnapshot(session, options.snapshot)); message = '最近车况已交给系统组件，请在桌面添加组件查看。'; }
      else if (action === 'confirm') {
        const intent = confirm; confirm = '';
        if (intent === 'register') await command('register');
        else if (intent === 'forget') { await call('forgetVehicle'); prepared = false; devices = []; status = null; message = '本 App 车辆资料已清除。'; }
        else if (intent === 'wallpaper' && session) {
          wallpapers = await meterApi.wallpapers(session, aborter.signal);
          message = wallpapers.length ? '请选择要替换的壁纸模板。' : '当前车辆未返回壁纸模板，暂时无法确定仪表显示配置。';
        } else if (intent === 'cast' && session) await openMeter(null);
      } else if (action === 'wallpaper' && wallpapers.some(wallpaper => wallpaper.id === value)) {
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
    wallpapers = []; message = '已打开原生仪表工具，按屏幕提示完成操作。';
  }
  host.addEventListener('click', click); render();
  if (native.available) void run(async () => {
    const value = await call('capabilities');
    if (value?.version === 1 && (value.platform === 'android' || value.platform === 'ios') && value.features && Array.isArray(value.limitations)) capabilities = value;
    else message = '安装包版本不兼容，请下载新版本。';
    await readStatus();
  });
  let polling = false;
  const timer = setInterval(() => {
    if (disposed || working || polling || document.visibilityState !== 'visible' || !native.available
      || !(status?.telemetryRunning || status?.dashboardRunning || status?.telemetrySubscribed || status?.dashboardSubscribed)) return;
    polling = true;
    void call('status').then(value => {
      if (disposed) return; status = value;
      const readingsHost = host.querySelector('[data-native-readings]'); if (readingsHost) readingsHost.innerHTML = readings();
      const stateHost = host.querySelector('[data-native-state]'); if (stateHost) stateHost.textContent = labels[status?.state] ?? '设备状态已读取';
    }).catch(() => {}).finally(() => polling = false);
  }, 2000);
  return () => {
    disposed = true; clearInterval(timer); aborter.abort();
    if (mutating) { options.onUncertain?.(); void native.call('ble.disconnect').catch(() => {}); }
    host.removeEventListener('click', click); host.replaceChildren();
  };
}
