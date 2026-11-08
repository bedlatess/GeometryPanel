import { ListGroup,ListRow,PlatformNote,ConfirmSheet,age,PrimaryButton,RefreshButton } from './kit';
import type { PageActions } from './pages/actions';
import { ApiError, messageFor } from '../api/client';
import { NativeMaterialsApi } from '../api/native-materials';
import { MeterApi, type WallpaperChoice } from '../api/meter';
import { nativeMessage, type NativeCapabilities, type NativeClient } from '../core/native';
import type { Session, Snapshot } from '../core/model';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const labels: Record<string, string> = { idle: '未连接', scanning: '正在搜索', connecting: '正在连接', connected: '蓝牙已连接', connected_unverified: '已连接，等待认证', ready: '连接就绪', authenticated: '认证通过', disconnected: '已断开', failed: '连接未完成', error: '连接未完成' };
const commandLabels: Record<string, string> = { authenticate: '认证车辆', register: '登记手机钥匙', query: '查询车端登记', telemetryOn: '读取蓝牙车况', telemetryOff: '停止读取', dashboardOn: '开始仪表数据', dashboardOff: '停止仪表数据' };
export function widgetSnapshot(session: Session, data: Snapshot) {
  return { vehicleLabel: session.vehicle.name.slice(0, 80), soc: data.soc, range: data.range, voltage: data.voltage, receivedAt: data.receivedAt };
}
export function mountNative(host: HTMLElement, options: { native: NativeClient; session: Session | null; demo: boolean; snapshot: Snapshot | null; onExpired(): void; onUncertain?(): void; section?: 'bluetooth'|'meter'; view?:string; actions:PageActions }): () => void {
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
  const button = (action: string, label: string, enabled: boolean, value = '') => `<button class="list-row action-row" data-native-action="${action}" data-value="${escape(value)}" ${enabled ? '' : 'disabled'}>${escape(label)}</button>`;
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
    return `<dl class="details-list">${rows.join('')}</dl><p class="muted">${age(typeof time==='number'?time:null)}</p>`;
  }
  function render() {
    if(disposed)return;
    const read=allowed(),control=read&&prepared,state=typeof status?.state==='string'?labels[status.state]??'状态未知':'未连接';
    const meter=options.section==='meter';
    const steps=['准备资料','搜索车辆','连接','认证','登记或查询','读取车况'];
    const progress=status?.telemetry?5:status?.vehicleRegistered?4:status?.authenticated?3:status?.state==='connected'?2:prepared?1:0;
    const main=progress===0?['prepare','准备资料','']:progress===1?['scan','搜索车辆','']:progress===2?['command','认证车辆','authenticate']:progress===3?['command','查询车端登记','query']:['command','读取蓝牙车况','telemetryOn'];
    const primary=PrimaryButton(main[1],`data-native-action="${main[0]}" data-value="${main[2]}"`,!read||!has('ble'));
    const more=ListGroup('',button('connect','连接车辆',control&&has('ble'))+button('disconnect','断开蓝牙',!working&&!demo&&has('ble'))+Object.entries(commandLabels).map(([a,l])=>button('command',l,control&&has('ble'),a)).join(''))+(has('proximity')?ListGroup('连接提醒',button('proximity-on','开启连接提醒',control)+button('proximity-off','关闭连接提醒',!working&&!demo)):'')+(has('notifications')||has('widget')?ListGroup('提醒与桌面',(has('notifications')?button('notifications-on','开启低电提醒',read)+button('notifications-off','关闭低电提醒',!working&&!demo):'')+(has('widget')?button('widget','更新桌面组件',read&&Boolean(options.snapshot)):'')):'')+ListGroup('',button('forget','清除车辆资料',!working&&!demo&&native.available).replace('list-row action-row','list-row action-row danger'));
    const meterHome=ListGroup('',ListRow('仪表壁纸','','data-action="route" data-value="/tools/meter/wallpaper"')+ListRow('仪表投屏','','data-action="route" data-value="/tools/meter/cast"')+(has('ota')?ListRow('仪表升级','','data-action="route" data-value="/tools/meter/upgrade"'):''));
    const meterView=options.view==='wallpaper'?ListGroup('',button('meter','选择壁纸模板',read&&has('meter'),'wallpaper')+button('local-tool','导入 ZIP 壁纸',read&&has('wallpaperZip'),'wallpaperZip'))+ (wallpapers.length?ListGroup('壁纸模板',wallpapers.map(w=>button('wallpaper',w.name,read,w.id)).join('')):''):options.view==='cast'?PrimaryButton('开始投屏','data-native-action="meter" data-value="cast"',!read||!has('meter')):options.view==='upgrade'?PrimaryButton('仪表升级','data-native-action="local-tool" data-value="ota"',!read||!has('ota')):meterHome;
    options.actions.toolbar(RefreshButton('刷新状态'),()=>{if(native.available&&!working&&!demo)void run(readStatus);});
    host.innerHTML=`${!native.available||demo?PlatformNote():''}${meter?meterView:options.view==='more'?more:`<p data-native-state>${escape(state)}</p><ol class="connection-steps">${steps.map((label,i)=>`<li ${i===progress?'aria-current="step"':''}><span>${i<progress?'✓':i+1}</span>${label}</li>`).join('')}</ol>${primary}${devices.length?ListGroup('附近车辆',devices.map(d=>button('device',d.name||'附近车辆',control,d.id)).join('')):''}${ListGroup('',ListRow('认证',status?.authenticated===true?'已确认':'状态未知','',undefined,true)+ListRow('手机登记',status?.bindAcknowledged===true?'已确认':'状态未知','',undefined,true)+ListRow('车辆登记',status?.vehicleRegistered===true?'已确认':'状态未知','',undefined,true)+ListRow('更多操作','','data-action="route" data-value="/tools/bluetooth/more"'))}<div data-native-readings>${readings()}</div>`}<p class="form-message" role="status" aria-live="polite">${escape(working?'正在加载':message)}</p>`;
  }

  async function run(task: () => Promise<void>) {
    if (working || disposed) return;
    working = true; render();
    try { await task(); }
    catch (error) {
      if (disposed || aborter.signal.aborted) return;
      if (error instanceof ApiError && error.kind === 'expired') { prepared = false; options.onExpired(); }
      message = error instanceof ApiError&&error.kind==='expired'?'登录已过期':'未收到车辆响应';
    } finally { working = false; render(); }
  }
  const call = <T = any>(method: Parameters<NativeClient['call']>[0], params: object = {}) => native.call<T>(method, params, aborter.signal);
  const readStatus = async () => { status = await call('status'); prepared=status?.bound===true; };
  async function command(action: string) {
    if (!prepared || !session || demo) return;
    mutating = true;
    try {
    const result = await call('ble.command', { action });
    if (action === 'register') {
      if (result?.bindAcknowledged !== true || typeof result?.uniqueIdentify !== 'string' || !/^[0-9a-f]{16}$/.test(result.uniqueIdentify)) { message = '未收到车辆响应'; return; }
      message = '已更新';
      await api.register(session, result.uniqueIdentify, aborter.signal);
      if (disposed) return;
      await call('ble.command', { action: 'query' });
      message = '已更新';
    } else message = '已更新';
    await readStatus();
    } finally { mutating = false; }
  }
  function click(event: Event) {
    const element = (event.target as Element).closest<HTMLButtonElement>('button[data-native-action]');
    if (!element || element.disabled || working) return;
    const action = element.dataset.nativeAction!, value = element.dataset.value ?? '';
    if (action === 'cancel') { confirm = ''; render(); return; }
    if(action==='command'&&value==='register'||action==='forget'||action==='meter') {
      confirm=action==='command'?value:action==='meter'?value:action;
      const label=confirm==='register'?'登记手机钥匙':confirm==='forget'?'清除车辆资料':confirm==='cast'?'仪表投屏':'设置仪表壁纸';
      options.actions.sheet(label,ConfirmSheet('继续',session?.vehicle.name??'—',session?.vehicle.vin.slice(-6)??'—','data-native-action="confirm"',confirm==='register'?'登记手机钥匙并保存':confirm==='forget'?'清除本机车辆资料':''),button=>{if(button.dataset.nativeAction==='confirm'){options.actions.closeSheet();click({target:button} as unknown as Event);}});return;
    }
    const stopping = ['disconnect', 'proximity-off', 'notifications-off'].includes(action) || action === 'confirm' && confirm === 'forget';
    if (action !== 'status' && !(allowed() || stopping && !demo)) return;
    void run(async () => {
      if (action === 'prepare' && session && !demo) {
        prepared = false;
        const binding = await api.prepare(session, aborter.signal);
        if (disposed) return;
        await call('bindVehicle', binding); prepared = true;
        message = '已更新';
      } else if (action === 'scan' && prepared) {
        const result = await call('ble.scan');
        const rows = Array.isArray(result) ? result : result?.devices;
        devices = Array.isArray(rows) ? rows.slice(0, 30).filter(row => row && typeof row.id === 'string' && row.id.length <= 80).map(row => ({ id: row.id, name: typeof row.name === 'string' ? row.name.slice(0, 80) : '', rssi: typeof row.rssi === 'number' && Number.isFinite(row.rssi) ? Math.round(row.rssi) : null })) : [];
        message = devices.length ? '选择车辆' : '未发现车辆';
      } else if ((action === 'connect' || action === 'device') && prepared) { await call('ble.connect', action === 'device' ? { id: value } : {}); await readStatus(); message = '已更新'; }
      else if (action === 'disconnect') { await call('ble.disconnect'); await readStatus(); message = '已更新'; }
      else if (action === 'command') await command(value);
      else if(action==='local-tool'){await call('tools.open',{tool:value});}
      else if (action === 'status') { await readStatus(); message = '已更新'; }
      else if (action.startsWith('proximity-')) { await call('ble.proximity', { enabled: action.endsWith('-on') }); message = action.endsWith('-on') ? '已开启' : '已关闭'; }
      else if (action.startsWith('notifications-')) { await call('notifications.configure', { enabled: action.endsWith('-on'), lowBattery: 20 }); message = '已更新'; }
      else if (action === 'widget' && session && options.snapshot) { await call('widget.update', widgetSnapshot(session, options.snapshot)); message = '已更新'; }
      else if (action === 'confirm') {
        const intent = confirm; confirm = '';
        if (intent === 'register') await command('register');
        else if (intent === 'forget') { await call('forgetVehicle'); prepared = false; devices = []; status = null; message = '已更新'; }
        else if (intent === 'wallpaper' && session) {
          wallpapers = await meterApi.wallpapers(session, aborter.signal);
          message = wallpapers.length ? '选择壁纸模板' : '壁纸不可用';
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
    wallpapers = []; message = '已更新';
  }
  host.addEventListener('click', click); render();
  if (!demo && native.available) void run(async () => {
    const value = await call('capabilities');
    if (value?.version === 1 && (value.platform === 'android' || value.platform === 'ios') && value.features && Array.isArray(value.limitations)) capabilities = value;
    else message = '未收到车辆响应';
    await readStatus();
  });
  let polling = false;
  const timer = setInterval(() => {
    if (demo || disposed || working || polling || document.visibilityState !== 'visible' || !native.available
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
