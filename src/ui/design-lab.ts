import { demoSnapshot, demoVehicle, type Snapshot } from '../core/model';
import { defaultPreferences } from '../core/preferences';
import { renderHome, html, type HomeOptions } from './home';

const scenes = {
  normal: '正常 · 车辆锁定', unlocked: '车辆未锁定', loading: '数据读取中', sending: '指令发送中',
  pending: '已提交 · 执行待确认', success: '已确认执行（演示）', error: '超时 · 结果不确定',
  offline: '手机离线', vehicleOffline: '车辆离线', stale: '数据过期', low: '低电量',
  missing: '字段缺失', unsupported: '车型不支持', long: '长车辆名称', signedOut: '未登录',
} as const;
type Scene = keyof typeof scenes;

/** A deliberately local state machine. No API, account store or native client is imported. */
export function mountDesignLab(host: HTMLElement): () => void {
  let scene: Scene = 'normal', platform = 'pwa', theme = 'dark', confirming = '', message = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  function render(focus?: string) {
    if (disposed) return;
    const data: Snapshot = structuredClone(demoSnapshot), now = Date.now();
    data.receivedAt = now; data.daily.reportedAt = now - 30000; data.daily.reportState = 'fresh'; data.daily.vehicleLocked = scene !== 'unlocked' && scene !== 'success';
    let phase: HomeOptions['phase'];
    if (['loading', 'sending', 'pending', 'error', 'success', 'unsupported'].includes(scene)) phase = scene as HomeOptions['phase'];
    if (scene === 'vehicleOffline') data.online = false;
    if (scene === 'stale' || scene === 'offline') { data.daily.reportState = 'stale'; data.daily.reportedAt = now - 3600_000; }
    if (scene === 'low') { data.soc = 12; data.range = 9; data.voltage = 61.2; }
    if (scene === 'missing') { data.soc = data.range = data.voltage = data.online = null; data.daily.reportState = 'unknown'; data.daily.vehicleLocked = null; data.daily.reportedAt = null; }
    if (scene === 'unsupported') { data.daily.capabilities.networkUnlock = false; data.daily.capabilities.seatOpen = false; }
    const car = { ...demoVehicle, name: scene === 'long' ? '每天陪我穿过城市去看海的那一辆极核电动车 · 长名称演示' : '我的极核', type: '演示车辆' };
    const messages: Partial<Record<Scene,string>> = {
      loading: '正在读取演示车况，保留上次数据。', sending: '正在发送上电开锁演示指令，请勿重复操作。',
      pending: '指令已提交，车辆执行结果待确认。请先观察车辆。', success: '演示状态：已通过模拟回读确认车辆未锁定。',
      error: '请求超时，车辆可能已执行。请先确认实际状态，避免重复发送。',
      offline: '手机网络已断开，保留上次读数；车控暂不可用。', stale: '车辆上报较早，当前读数不代表实时车况。',
      vehicleOffline: '车辆上次上报为离线，云端指令可能无法及时送达。',
      missing: '部分字段暂未提供，以 — 表示，不把缺失当作零。', unsupported: '此演示车型没有云开关锁与座桶开启能力。',
    };
    const blocked = ['loading', 'sending', 'offline'].includes(scene);
    host.innerHTML = `<div class="lab-controls"><p class="lab-disclosure">演示数据 · 只在本页模拟，不读取或修改真实账号、车辆和偏好。</p>
      <div class="lab-selects"><label>平台形态<select name="lab-platform">${[['pwa','iPhone PWA'],['ios','iOS App'],['android','Android App']].map(([v,n]) => `<option value="${v}" ${platform === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>界面主题<select name="lab-theme"><option value="dark" ${theme === 'dark' ? 'selected' : ''}>深色</option><option value="light" ${theme === 'light' ? 'selected' : ''}>浅色</option></select></label>
      <label class="lab-scene">业务状态<select name="lab-scene">${Object.entries(scenes).map(([v,n]) => `<option value="${v}" ${scene === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <button class="text-button" data-lab="reset">恢复初始演示</button></div>
      <div class="design-frame" data-design-theme="${theme}" data-platform="${platform}" data-accent="green"><div class="preview-safe-top"><span>${platform === 'android' ? 'Android App' : platform === 'ios' ? 'iOS App' : 'iPhone PWA'} · 形态预览</span><span>演示</span></div>
        <p class="preview-capability">${platform === 'pwa' ? '浏览器形态：蓝牙与仪表工具需安装包。' : '仅预览安全区与布局，未获得原生系统能力。'}</p>
        ${renderHome({ car: scene === 'signedOut' ? undefined : car, data: scene === 'signedOut' ? null : data,
          preferences: { ...defaultPreferences, theme: theme as 'dark'|'light' }, enabled: !blocked && scene !== 'signedOut', locked: blocked,
          busy: scene === 'loading' || scene === 'sending', control: scene === 'sending', expired: false,
          online: scene !== 'offline', demo: true, lab: true, phase, message: message || messages[scene] || '演示数据，不会连接或控制真实车辆。' })}
        ${confirming ? `<section class="lab-confirm" aria-label="演示操作确认"><h3>确认演示操作</h3><p>目标：${html(car.name)}</p><p>${confirming === 'powerOff' ? '关机锁车' : confirming === 'seat' ? '打开座桶' : confirming === 'horn' ? '鸣笛寻车' : '上电开锁'} · 不发送真实请求</p><div class="control-grid"><button class="primary" data-lab="confirm">确认演示</button><button class="control-button" data-lab="cancel">取消演示</button></div></section>` : ''}
        <div class="preview-safe-bottom" aria-hidden="true"><i></i></div></div>`;
    if (focus) host.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  }
  function change(event: Event) {
    const target = event.target as HTMLSelectElement;
    if (!target.name?.startsWith('lab-')) return;
    event.stopPropagation(); clear(); confirming = message = '';
    if (target.name === 'lab-platform') platform = target.value;
    if (target.name === 'lab-theme') theme = target.value;
    if (target.name === 'lab-scene' && target.value in scenes) scene = target.value as Scene;
    render(`[name="${target.name}"]`);
  }
  function click(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    event.stopPropagation();
    if (button.dataset.lab === 'reset') { clear(); scene = 'normal'; platform = 'pwa'; theme = 'dark'; confirming = message = ''; render('[data-lab="reset"]'); return; }
    if (button.dataset.lab === 'cancel') { confirming = ''; render('[data-value="powerOn"]'); return; }
    if (button.dataset.lab === 'confirm') {
      confirming = ''; scene = 'sending'; message = ''; render();
      clear(); timer = setTimeout(() => { scene = 'pending'; render('[name="lab-scene"]'); }, 1100); return;
    }
    if (button.dataset.action !== 'lab-action') return;
    const action = button.dataset.value;
    if (['powerOn','powerOff','horn','seat'].includes(action ?? '')) { confirming = action!; render('[data-lab="confirm"]'); host.querySelector('.lab-confirm')?.scrollIntoView({ block: 'nearest' }); }
    else { message = action === 'identity' ? `演示车辆全名：${scene === 'long' ? '每天陪我穿过城市去看海的那一辆极核电动车 · 长名称演示' : '我的极核'}` : '此入口为界面演示；真实功能保留在主面板，不会在模拟器中打开。'; render('[name="lab-scene"]'); }
  }
  host.addEventListener('change', change); host.addEventListener('click', click); render();
  return () => { disposed = true; clear(); host.removeEventListener('change', change); host.removeEventListener('click', click); host.replaceChildren(); };
}
