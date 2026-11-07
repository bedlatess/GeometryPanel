import { demoSnapshot, demoVehicle, type Snapshot } from '../core/model';
import { defaultPreferences } from '../core/preferences';
import { renderHome, type HomeOptions } from './home';
import { mountLever } from './kit/lever';
import { commandSheet, dataSheet, hornSheet } from './pages/home-sheets';
import { html } from './kit';
const scenes = {
  normal: '正常', unlocked: '未锁车', loading: '正在加载', sending: '正在发送', pending: '等待车辆响应', success: '已开锁', error: '未收到车辆响应',
  offline: '手机没网', vehicleOffline: '车辆离线', stale: '数据过期', low: '电量低', missing: '读数缺失', unsupported: '此车型不支持', long: '长车名', signedOut: '未登录',
  charging: '充电中', leverTimeout: '拨杆超时', multi: '多车切换', expired: '登录已过期', future: '时间异常', unknown: '时间未知',
} as const;
type Scene = keyof typeof scenes;
/** Local presentation only: no account, storage, network or device access. */
export function mountDesignLab(host: HTMLElement): () => void {
  let scene: Scene = 'normal', platform = 'pwa', theme = 'dark', confirming = '', overlay = '', selected = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const car = () => ({ ...demoVehicle, name: scene === 'long' ? '每天陪我穿过城市去看海的那一辆极核电动车' : scene === 'multi' ? ['AE5i 通勤', 'AE8 周末'][selected] : '我的极核' });
  function render(focus?: string) {
    if (disposed) return;
    const data: Snapshot = structuredClone(demoSnapshot), now = Date.now();
    data.receivedAt = now; data.daily.reportedAt = now - 30000; data.daily.reportState = 'fresh'; data.daily.vehicleLocked = !['unlocked', 'success'].includes(scene);
    let phase: HomeOptions['phase'];
    if (['loading', 'sending', 'pending', 'error', 'success', 'unsupported'].includes(scene)) phase = scene as HomeOptions['phase'];
    if (scene === 'leverTimeout') phase = 'error';
    if (scene === 'vehicleOffline') data.online = false;
    if (scene === 'stale' || scene === 'offline') { data.daily.reportState = 'stale'; data.daily.reportedAt = now - 3600_000; }
    if (scene === 'future') { data.daily.reportState = 'future'; data.daily.reportedAt = now + 3600_000; }
    if (scene === 'unknown') { data.daily.reportState = 'unknown'; data.daily.reportedAt = null; }
    if (scene === 'low') { data.soc = 12; data.range = 9; data.voltage = 61.2; }
    if (scene === 'charging') { data.charging = '充电中'; data.daily.expectedFullText = '约 1 小时 20 分后充满'; }
    if (scene === 'missing') { data.soc = data.range = data.voltage = data.online = null; data.daily.reportState = 'unknown'; data.daily.vehicleLocked = null; data.daily.reportedAt = null; }
    if (scene === 'unsupported') { data.daily.capabilities.networkUnlock = false; data.daily.capabilities.seatOpen = false; }
    const blocked = ['loading','sending','pending','offline','expired'].includes(scene);
    host.innerHTML = `<div class="lab-controls"><p class="lab-disclosure">演示数据 · 只在本页模拟</p><div class="lab-selects"><label>平台形态<select name="lab-platform">${[['pwa','iPhone 主屏幕'],['ios','iOS App'],['android','Android App']].map(([v,n]) => `<option value="${v}" ${platform === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>主题<select name="lab-theme">${[['dark','深色'],['light','浅色']].map(([v,n]) => `<option value="${v}" ${theme === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label class="lab-scene">状态<select name="lab-scene">${Object.entries(scenes).map(([v,n]) => `<option value="${v}" ${scene === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div><button class="text-button" data-lab="reset">恢复初始演示</button></div><div class="design-frame" data-design-theme="${theme}" data-platform="${platform}">${scene === 'expired' ? '<div class="global-banner error">登录已过期<button class="text-button" data-action="connect">重新登录</button></div>' : scene === 'offline' ? '<div class="global-banner">网络不可用</div>' : ''}${renderHome({ car: scene === 'signedOut' ? undefined : car(), data: scene === 'signedOut' || scene === 'loading' ? null : data, preferences: { ...defaultPreferences, theme: theme as 'dark'|'light' }, enabled: !blocked, locked: blocked, busy: scene === 'loading' || scene === 'sending', control: scene === 'sending', expired: scene === 'expired', online: scene !== 'offline', demo: true, lab: true, phase, message: '', multi: scene === 'multi' })}${confirming ? `<section class="lab-confirm" aria-label="演示操作确认"><h2>${confirming === 'powerOff' ? '关机锁车' : confirming === 'seat' ? '打开座桶' : '上电开锁'}</h2>${commandSheet(car(), '确认演示', confirming).replace('send-control','lab-confirm').replace('data-action="close"','data-lab="cancel"')}</section>` : overlay ? `<section class="lab-confirm" aria-label="演示选择">${overlay}</section>` : ''}<p class="lab-message" role="status" aria-live="polite">${scene === 'pending' ? '等待车辆响应' : scene === 'error' || scene === 'leverTimeout' ? '未收到车辆响应' : ''}</p></div>`;
    if (focus) host.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  }
  function change(event: Event) {
    const target = event.target as HTMLSelectElement; if (!target.name?.startsWith('lab-')) return;
    event.stopPropagation(); clear(); confirming = overlay = '';
    if (target.name === 'lab-platform') platform = target.value;
    if (target.name === 'lab-theme') theme = target.value;
    if (target.name === 'lab-scene' && target.value in scenes) scene = target.value as Scene;
    render(`[name="${target.name}"]`);
  }
  function confirm(action: string) { confirming = action; overlay = ''; render(); host.querySelector('.lab-confirm')?.scrollIntoView({ block: 'nearest' }); }
  function click(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    event.stopPropagation();
    if (button.dataset.lab === 'reset') { clear(); scene = 'normal'; platform = 'pwa'; theme = 'dark'; confirming = overlay = ''; render('[data-lab="reset"]'); return; }
    if (button.dataset.lab === 'cancel') { confirming = overlay = ''; render(); return; }
    const action = button.dataset.action;
    if (action === 'lever') return;
    if (action === 'lab-confirm') { confirming = ''; scene = 'sending'; render(); clear(); timer = setTimeout(() => { scene = 'pending'; render(); }, 1100); return; }
    if (action === 'vehicle-action') { confirm('seat'); return; }
    if (action === 'horn') overlay = hornSheet(car()).replace('send-horn-choice','lab-horn');
    else if (action === 'lab-horn') overlay = '<p role="status">已发送鸣笛寻车</p>';
    else if (action === 'vehicle-picker') overlay = ['AE5i 通勤','AE8 周末'].map((name,i) => `<button class="list-row" data-action="lab-car" data-value="${i}">${name}</button>`).join('');
    else if (action === 'lab-car') { selected = Number(button.dataset.value); overlay = ''; }
    else if (action === 'data-status') overlay = dataSheet(null);
    else if (action === 'close') overlay = confirming = '';
    else if (action !== 'top') overlay = '<p role="status">界面演示</p>';
    render();
  }
  const unmountLever = mountLever(host, confirm);
  host.addEventListener('change', change); host.addEventListener('click', click); render();
  return () => { disposed = true; clear(); unmountLever(); host.removeEventListener('change', change); host.removeEventListener('click', click); host.replaceChildren(); };
}
