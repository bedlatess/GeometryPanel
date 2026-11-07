import './styles.css';
import { ApiError, messageFor } from './api/client';
import { ZeehoApi } from './api/zeeho';
import { VehicleControls, type VehicleAction } from './api/controls';
import { demoSnapshot, demoVehicle, type Session, type Snapshot, type Vehicle, type VehicleList } from './core/model';
import { version } from '../package.json';
import { forgetSession, loadSession, saveSession } from './core/vault';
import { mountCaptcha } from './ui/captcha';
import { storagePrefix } from './core/scope';
import { installUpdates } from './core/updates';
import { commandNames, commandSummary, type CommandMode, type CommandReport, type CommandStep } from './core/command-report';
import { renderDaily } from './ui/daily';
import { defaultPreferences, readPreferences, writePreferences, exportPreferences, importPreferences } from './core/preferences';
import { currentInstallContext } from './core/pwa';
import { navigationLinks } from './core/navigation';
import { renderUsagePreferences } from './ui/preferences';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<div id="content"></div><dialog id="modal" aria-labelledby="modal-title"></dialog>';
const content = document.querySelector<HTMLDivElement>('#content')!;
const modal = document.querySelector<HTMLDialogElement>('#modal')!;
const api = new ZeehoApi();
const controls = new VehicleControls();
let session: Session | null = null;
let reading: Snapshot | null = null;
let preview = false, busy = false, booting = true, committing = false, activeControl = false, expired = false, generation = 0;
let updateReady = false, updating = false, lastReadAttempt = 0;
let updates: ReturnType<typeof installUpdates> | undefined;
let tab: 'vehicle' | 'daily' | 'appearance' | 'settings' = 'vehicle';
let notice = '连接你的极核，开启自己的面板。';
let aborter: AbortController | null = null;
let pending: { token: string; uid: string; vehicles: Vehicle[] } | null = null;
let lastCommandReport: CommandReport | null = null;
let commandTarget: Session | null = null;
let commandIntent: 'horn' | VehicleAction | null = null;
let phone = '';
let cacheReady = Boolean(navigator.serviceWorker?.controller), checkingUpdate = false, lastUpdateCheck = 0;
const cooldowns = new Map<string, number>();
class UserMessage extends Error { }
let preferences = readPreferences(`${storagePrefix}preferences`);
function applyPreferences(save = true) {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.accent = preferences.accent;
  if (save && !writePreferences(preferences, `${storagePrefix}preferences`)) notice = '配置已在当前页面生效，但本机保存未完成，重开后可能恢复原配置。';
}
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const display = (value: number | null | undefined, unit = '') => value == null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
const vehicle = () => preview ? demoVehicle : session?.vehicle;
const isHorn = (mode: CommandMode) => mode === 'normal' || mode === 'high';
const reportButton = () => lastCommandReport ? `<button class="text-button" data-action="command-report">查看${isHorn(lastCommandReport.mode) ? '寻车' : '车控'}结果</button>` : '';

function render() {
  const car = vehicle();
  const data = preview ? demoSnapshot : reading;
  const locked = busy || booting || updating;
  const enabled = session && !locked && !expired && navigator.onLine;
  const shortcut = preferences.shortcut;
  const shortcutEnabled = shortcut === 'daily' ? !locked : enabled && (shortcut !== 'seat' || data?.daily.capabilities.seatOpen !== false);
  let body = '';
  if (tab === 'vehicle') body = `
    <div class="page-heading"><div><span class="eyebrow">我的车库</span><h1>${escape(car?.name ?? '几何面板')}</h1></div>
      <button class="round-button" data-action="${session && !expired ? 'refresh' : 'connect'}" aria-label="${session && !expired ? '刷新车况' : '连接车辆'}" ${locked || !navigator.onLine ? 'disabled' : ''}>${session && !expired ? '刷新' : '连接'}</button></div>
    <p class="subheading">${preview ? '演示车辆 · 当前显示示例数据' : car ? `车辆尾号 ${escape(car.vin.slice(-6))}` : '让每一次出发，都更合心意。'}</p>
    <section class="battery-card" aria-label="车辆电量">
      <div class="battery-top"><span>剩余电量</span><span class="status ${data?.online === true ? 'online' : ''}">${data?.online === true ? '车辆在线' : data?.online === false ? '车辆离线' : '等待车况'}</span></div>
      <div class="battery-number">${display(data?.soc)}<span>%</span></div>
      <div class="battery-bars" aria-hidden="true">${Array.from({ length: 20 }, (_, index) => `<i class="${data?.soc != null && index < Math.ceil(data.soc / 5) ? 'filled' : ''}"></i>`).join('')}</div>
      <div class="battery-bottom"><span>${escape(data?.charging ?? '等待首次读取')}</span><span>READY FOR YOUR NEXT RIDE</span></div>
    </section>
    <div class="metrics">${preferences.range ? `<section class="metric"><span>预计续航</span><strong>${display(data?.range)}<small>km</small></strong></section>` : ''}
      ${preferences.voltage ? `<section class="metric"><span>电池电压</span><strong>${display(data?.voltage)}<small>V</small></strong></section>` : ''}</div>
    <section class="section"><div class="section-heading"><h2>快捷操作</h2><span>随时掌握</span></div>
      <button class="action-card" aria-label="${shortcut === 'horn' ? '鸣笛寻车' : shortcut === 'seat' ? '打开座桶' : '日常用车'}" data-action="${shortcut === 'horn' ? 'horn' : shortcut === 'seat' ? 'vehicle-action' : 'tab'}" ${shortcut === 'seat' ? 'data-value="seat"' : shortcut === 'daily' ? 'data-value="daily"' : ''} ${shortcutEnabled ? '' : 'disabled'}><span class="action-symbol" aria-hidden="true">${shortcut === 'horn' ? ')))' : '→'}</span><span><strong>${shortcut === 'horn' ? '鸣笛寻车' : shortcut === 'seat' ? '打开座桶' : '日常用车'}</strong><small>${shortcut === 'horn' ? '让爱车回应你' : shortcut === 'seat' ? '确认后发送开启请求' : '查看车况、位置与车控'}</small></span><span class="arrow" aria-hidden="true">→</span></button>
      <button class="text-button block" data-action="tab" data-value="daily">查看日常用车、位置与更多车控 →</button>
    </section>
    <div class="notice ${expired ? 'error' : ''}" role="status" aria-live="polite">${escape(notice)}</div>
    ${reportButton()}
    ${data?.receivedAt ? `<p class="timestamp">上次读取 ${new Date(data.receivedAt).toLocaleString('zh-CN')} · 以车辆上报状态为准</p>` : ''}
    ${expired ? '<button class="primary block" data-action="connect">重新登录</button>' : ''}
    ${!session ? `<div class="welcome-actions"><button class="primary" data-action="connect" ${locked || !navigator.onLine ? 'disabled' : ''}>连接我的极核</button><button class="text-button" data-action="preview" ${locked ? 'disabled' : ''}>${preview ? '退出演示' : '先体验面板'}</button></div>` : ''}`;
  if (tab === 'daily') body = renderDaily({ car, data, demo: preview, enabled: Boolean(enabled), locked, online: navigator.onLine })
    + `<div class="notice ${expired ? 'error' : ''}" role="status" aria-live="polite">${escape(notice)}</div>${reportButton()}`
    + (expired ? '<button class="primary block" data-action="connect">重新登录</button>' : '');
  if (tab === 'appearance') body = `
    <div class="page-heading"><div><span class="eyebrow">按你的喜好</span><h1>我的风格</h1></div></div><p class="subheading">每一点改变，都保留在这台设备。</p>
    <section class="settings-card"><h2>外观模式</h2><div class="segmented">${(['system', 'light', 'dark'] as const).map((mode, i) => `<button data-action="theme" data-value="${mode}" aria-pressed="${preferences.theme === mode}">${['跟随系统', '浅色', '深色'][i]}</button>`).join('')}</div></section>
    <section class="settings-card"><h2>点缀颜色</h2><div class="color-options">${(['green', 'blue', 'orange'] as const).map((color, i) => `<button class="color-choice ${color}" data-action="accent" data-value="${color}" aria-pressed="${preferences.accent === color}">${['苔绿', '海蓝', '日落'][i]}</button>`).join('')}</div></section>
    <section class="settings-card"><button class="setting-row" data-action="voltage" role="switch" aria-checked="${preferences.voltage}"><span>显示电池电压</span><span class="switch ${preferences.voltage ? 'checked' : ''}" aria-hidden="true"></span></button></section>`;
  if (tab === 'settings') body = `
    <div class="page-heading"><div><span class="eyebrow">连接与偏好</span><h1>设置</h1></div></div><p class="subheading">属于你的面板，也属于你的设备。</p>
    <section class="settings-card"><h2>车辆连接</h2><p>${session ? `${escape(session.vehicle.name)} · 尾号 ${escape(session.vehicle.vin.slice(-6))}` : '尚未连接车辆'}</p>
      <button class="primary" data-action="connect" ${locked || !navigator.onLine ? 'disabled' : ''}>${session ? '重新登录' : '登录并连接'}</button>
      ${session ? `<button class="text-button" data-action="switch" ${enabled ? '' : 'disabled'}>切换车辆</button><button class="text-button danger" data-action="logout" ${locked ? 'disabled' : ''}>退出本机登录</button>` : ''}</section>
    <section class="settings-card"><h2>iPhone 与离线使用</h2><p>${currentInstallContext() === 'installed' ? '当前从主屏幕图标独立运行' : '当前在浏览器中运行'}</p><p>${cacheReady ? '离线页面已准备好；车辆数据和控制需要联网。' : '联网后准备离线页面；车辆数据和控制需要联网。'}</p><button class="setting-row" data-action="install"><span>${currentInstallContext() === 'installed' ? '查看主屏幕使用说明' : '添加到 iPhone 主屏幕'}</span><span aria-hidden="true">→</span></button><button class="text-button" data-action="check-update" ${locked || checkingUpdate || !navigator.onLine ? 'disabled' : ''}>${checkingUpdate ? '正在检查更新…' : '检查新版本'}</button></section>
    ${renderUsagePreferences(preferences)}
    <section class="settings-card"><h2>几何面板</h2><p>网页版 · ${escape(version)} 验收版</p><p class="muted">车况、充电、位置与日常车控，集中在“用车”页。</p></section>
    ${lastCommandReport ? '<section class="settings-card"><button class="setting-row" data-action="command-report"><span>查看操作结果与排查摘要</span><span aria-hidden="true">→</span></button></section>' : ''}
    <div class="notice" role="status">${escape(notice)}</div>`;
  content.innerHTML = `<div class="shell"><header class="brand"><span class="brand-mark" aria-hidden="true">Z.</span><span>几何面板<small>YOUR RIDE. YOUR WAY.</small></span><span class="platform-label">WEB</span></header>
    ${booting ? '<p class="connection-banner" role="status">正在恢复本机连接…</p>' : ''}
    ${!navigator.onLine ? '<p class="connection-banner" role="status">网络已断开，显示内容不会更新。联网后可重新读取。</p>' : ''}
    ${updateReady ? `<div class="connection-banner" role="status"><span>新版本已准备好</span><button class="text-button" data-action="update" ${locked || modal.open || !navigator.onLine ? 'disabled' : ''}>${updating ? '正在更新…' : '更新并重新打开'}</button></div>` : ''}
    <main>${body}</main>
    <nav class="bottom-nav" aria-label="主导航">${(['vehicle', 'daily', 'appearance', 'settings'] as const).map((page, i) => `<button data-action="tab" data-value="${page}" ${tab === page ? 'aria-current="page"' : ''}>${['车辆', '用车', '外观', '设置'][i]}</button>`).join('')}</nav></div>`;
}

function show(title: string, body: string) {
  commandTarget = null; commandIntent = null;
  modal.innerHTML = `<div class="modal-heading"><h2 id="modal-title">${escape(title)}</h2><button class="text-button" data-action="close" aria-label="关闭">关闭</button></div>${body}<p id="modal-message" class="form-message" role="status" aria-live="polite"></p>`;
  if (!modal.open) modal.showModal();
  if (busy) modal.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not([data-action="close"]),input').forEach(element => element.disabled = true);
  render();
}
function close() {
  if (committing) return;
  if (busy) {
    aborter?.abort(); generation++; busy = false;
    if (activeControl) notice = '请求结果尚未确认，请先观察车辆，避免重复发送。';
    activeControl = false;
  }
  pending = null; commandTarget = null; commandIntent = null; modal.close(); modal.replaceChildren(); render();
}
async function run(task: (signal: AbortSignal, current: () => boolean) => Promise<void>, options: { bound?: Session; control?: boolean } = {}) {
  if (busy || booting || updating) return;
  if (!navigator.onLine && !options.control && options.bound) { notice = '当前离线，请联网后重新读取。'; render(); return; }
  busy = true; const epoch = ++generation; aborter = new AbortController();
  activeControl = Boolean(options.control);
  if (activeControl) notice = '正在发送车辆操作请求…';
  const signal = aborter.signal;
  render();
  modal.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not([data-action="close"]),input').forEach(element => element.disabled = true);
  const progress = modal.querySelector('#modal-message');
  if (progress) progress.textContent = '正在连接，请稍候…';
  try { await task(signal, () => epoch === generation && !signal.aborted); }
  catch (error) {
    if (epoch !== generation || signal.aborted) return;
    if (error instanceof ApiError && error.kind === 'expired' && options.bound && session === options.bound) expired = true;
    notice = (error instanceof UserMessage ? error.message : messageFor(error)) + (options.control && !(error instanceof ApiError && error.kind === 'expired')
      ? ' 执行结果尚未确认，请先观察车辆，避免重复发送。' : '');
    if (error instanceof ApiError && error.kind === 'expired' && pending) { pending = null; showPhone(); }
    const message = modal.open ? modal.querySelector('#modal-message') : null;
    if (message) message.textContent = notice;
  } finally {
    if (epoch === generation) {
      busy = false; activeControl = false; render();
      modal.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input').forEach(element => element.disabled = false);
      if (expired) modal.querySelectorAll<HTMLButtonElement>('[data-action="send-horn"],[data-action="send-horn-high"],[data-action="send-control"]').forEach(element => element.disabled = true);
      updateCooldown();
    }
  }
}

function showPhone() {
  pending = null;
  show('连接我的极核', `<p class="muted">使用你的极核账号手机号登录。</p><form id="phone-form"><label>手机号<input id="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="11" placeholder="请输入手机号" required pattern="1[0-9]{10}" value="${escape(phone)}"></label><button class="primary block" type="submit">下一步</button></form><p class="fine-print">登录信息保存在本机，不经过我们自己的账号服务器。</p>`);
}
function secondsRemaining() {
  let deadline = cooldowns.get(phone) ?? 0;
  try { deadline = Math.max(deadline, Number(sessionStorage.getItem(`${storagePrefix}sms:${phone}`)) || 0); } catch { }
  return Math.max(0, Math.ceil((Math.min(deadline, Date.now() + 60000) - Date.now()) / 1000));
}
function startCooldown() {
  const deadline = Date.now() + 60000;
  cooldowns.set(phone, deadline);
  try { sessionStorage.setItem(`${storagePrefix}sms:${phone}`, String(deadline)); } catch { }
}
function updateCooldown() {
  const button = modal.querySelector<HTMLButtonElement>('[data-action="resend"]');
  if (!button) return;
  const seconds = secondsRemaining();
  button.disabled = busy || seconds > 0;
  button.textContent = seconds ? `${seconds} 秒后可重新获取` : '重新获取验证码';
}
function showCode(sent = true) {
  show('输入短信验证码', `<p class="muted">${sent ? '验证码已发送至' : '如已收到短信，请直接输入'} ${escape(phone.slice(0, 3))}****${escape(phone.slice(-4))}</p><form id="code-form"><label>短信验证码<input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4,8}" maxlength="8" required placeholder="请输入验证码"></label><button class="primary block" type="submit">登录并选择车辆</button></form><button class="text-button" data-action="resend">重新获取验证码</button><button class="text-button" data-action="phone">更换手机号</button>`);
  updateCooldown();
}
async function fetchCaptcha() {
  if (secondsRemaining()) { showCode(false); return; }
  show('完成图形验证', '<p class="muted">正在获取验证图片…</p><button class="text-button" data-action="new-captcha">重新加载图片</button><button class="text-button" data-action="code">已有短信验证码</button><button class="text-button" data-action="phone">更换手机号</button>');
  await run(async (signal, current) => {
    const captcha = await api.captcha(phone, signal);
    if (!current()) return;
    show('完成图形验证', '<p class="muted">拖动图片，将拼图移到缺口后松手。</p><canvas class="captcha" width="720" height="360" role="slider" tabindex="0" aria-label="拖动拼图完成验证" aria-valuemin="0" aria-valuenow="0"></canvas><p class="fine-print">也可使用左右方向键移动，按回车提交。</p><button class="text-button" data-action="new-captcha">换一张</button><button class="text-button" data-action="code">已有短信验证码</button><button class="text-button" data-action="phone">更换手机号</button>');
    await mountCaptcha(modal.querySelector('canvas')!, captcha, track => {
      void run(async (codeSignal, isCurrent) => {
        startCooldown();
        showCode(false);
        await api.sendCode(phone, captcha, track, codeSignal);
        if (!isCurrent()) return;
        showCode();
      });
    });
  });
}
function listBody(result: VehicleList | null) {
  const cars = result?.vehicles ?? [];
  const status = !result ? '<p>正在读取车辆列表…</p>' : cars.length
    ? `<p class="muted">已读取 ${cars.length} 辆车。${result.unrecognizedCount ? `另有 ${result.unrecognizedCount} 条车辆记录暂未识别。` : ''}</p><div class="vehicle-list">${cars.map((car, index) => `<button class="vehicle-choice" data-action="select" data-value="${index}"><strong>${escape(car.name)}</strong><small>尾号 ${escape(car.vin.slice(-6))}${session?.vehicle.vin === car.vin ? ' · 当前车辆' : ''}</small></button>`).join('')}</div>`
    : result.receivedCount ? `<p>已返回 ${result.receivedCount} 条车辆记录，但车辆编号暂未识别。这不代表车辆已解绑，请稍后重新读取。</p>`
    : '<p>极核车辆接口本次返回 0 辆车。这不代表车辆已解绑；若官方应用中已有车辆，请先重新读取，无需重复获取短信。</p>';
  return status + '<button class="text-button" data-action="retry-list">重新读取车辆列表</button><button class="text-button" data-action="phone">更换账号</button>';
}
async function retrieveCars(signal: AbortSignal, current: () => boolean) {
  const account = pending;
  if (!account) return;
  show('选择你的车辆', listBody(null));
  try {
    const result = await api.list(account.token, signal);
    if (!current() || pending !== account) return;
    pending.vehicles = result.vehicles;
    show('选择你的车辆', listBody(result));
  } catch (error) {
    if (current()) show('选择你的车辆', '<p>车辆列表读取未完成，账号已验证，可以直接重试。</p><button class="primary block" data-action="retry-list">重新读取车辆列表</button><button class="text-button" data-action="phone">更换账号</button>');
    throw error;
  }
}
async function refresh() {
  if (!session || expired) return;
  const bound = session;
  lastReadAttempt = Date.now();
  await run(async (signal, current) => {
    const data = await api.read(bound, signal);
    if (current() && session === bound) { reading = data; notice = data.partial ? '已读取车况，电池详情暂未取得。' : '车况已读取。'; }
  }, { bound });
}
async function selectVehicle(index: number) {
  if (!pending?.vehicles[index]) return;
  const candidate: Session = { token: pending.token, uid: pending.uid, vehicle: pending.vehicles[index] };
  await run(async (signal, current) => {
    committing = true;
    const closeButton = modal.querySelector<HTMLButtonElement>('[data-action="close"]');
    if (closeButton) closeButton.disabled = true;
    try { await saveSession(candidate); }
    catch { throw new UserMessage('本机未能保存连接，本次切换未完成。请重试，或检查浏览器的存储设置。'); }
    finally { committing = false; }
    if (!current()) return;
    session = candidate; reading = null; lastCommandReport = null; preview = expired = false; pending = null; tab = preferences.startPage;
    notice = '车辆已连接，正在读取车况…';
    modal.close();
    render();
    lastReadAttempt = Date.now();
    const data = await api.read(candidate, signal);
    if (current()) { reading = data; notice = data.partial ? '车辆已连接，电池详情暂未取得。' : '车辆已连接，出发前看一眼。'; }
  }, { bound: candidate });
}

function beginCommand(mode: CommandMode) {
  const bound = commandTarget;
  if (!bound || session !== bound || busy || expired || preview || !navigator.onLine) return;
  if (isHorn(mode) ? commandIntent !== 'horn' : commandIntent !== mode) return;
  const capability = reading?.daily.capabilities;
  if ((mode === 'powerOn' || mode === 'powerOff') && capability?.networkUnlock === false
    || mode === 'seat' && capability?.seatOpen === false) return;
  const report: CommandReport = { mode, startedAt: Date.now(), steps: [] };
  lastCommandReport = report;
  void run(async (signal, current) => {
    const progress = (step: CommandStep) => {
      const index = report.steps.findIndex(value => value.stage === step.stage);
      if (index < 0) report.steps.push(step); else report.steps[index] = step;
      if (current()) {
        const message = modal.querySelector('#modal-message');
        if (message) message.textContent = step.stage === 'prepare' ? '正在准备车辆操作…' : '正在提交车辆操作…';
      }
    };
    if (mode === 'normal' || mode === 'high') await api.horn(bound, signal, { mode, onProgress: progress });
    else await controls.execute(bound, mode, signal, progress);
    if (current()) {
      notice = mode === 'normal' ? '普通寻车完整流程已提交，请确认车辆是否鸣响。'
        : mode === 'high' ? '高声寻车已提交，请确认车辆是否鸣响。' : `${commandNames[mode]}请求已提交，请刷新车况并确认车辆实际状态。`;
      commandTarget = null; commandIntent = null; modal.close();
    }
  }, { bound, control: true });
}

content.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (booting || updating) return;
  if (action === 'tab') { tab = button.dataset.value as typeof tab; render(); window.scrollTo(0, 0); }
  if (action === 'preview') { preview = !preview; notice = preview ? '当前为演示数据，所有车辆控制均已停用。' : '连接你的极核，开启自己的面板。'; render(); }
  if (action === 'connect' && !busy) showPhone();
  if (action === 'switch' && session && !busy && !expired) {
    const bound = session;
    pending = { token: bound.token, uid: bound.uid, vehicles: [] };
    void run(retrieveCars, { bound });
  }
  if (action === 'theme' && ['system', 'light', 'dark'].includes(button.dataset.value ?? '')) { preferences.theme = button.dataset.value as typeof preferences.theme; applyPreferences(); render(); }
  if (action === 'accent' && ['green', 'blue', 'orange'].includes(button.dataset.value ?? '')) { preferences.accent = button.dataset.value as typeof preferences.accent; applyPreferences(); render(); }
  if (action === 'voltage') { preferences.voltage = !preferences.voltage; applyPreferences(); render(); }
  if (action === 'range') { preferences.range = !preferences.range; applyPreferences(); render(); }
  if (action === 'foreground-refresh') { preferences.foregroundRefresh = !preferences.foregroundRefresh; applyPreferences(); render(); }
  if (action === 'install') show('主屏幕使用说明', currentInstallContext() === 'installed'
    ? '<p>你已经从主屏幕图标独立运行几何面板。重新打开会恢复此入口保存的登录与配置，联网后读取车况。</p><p>离线仍可打开页面和设置，车况不会更新，车控不可用。新版本准备好后点“更新并重新打开”。</p>'
    : '<p>在 iPhone 的 Safari 中打开正式网址，点分享按钮 → 添加到主屏幕 → 添加。以后从桌面图标打开。</p><p>首次从桌面图标打开时，如果没有恢复浏览器里的登录，请在桌面版连接一次。iPhone 可能分别保存这两个入口的登录。</p><p>离线能打开页面，但读取车况和控制车辆需要联网。配置可在“备份我的配置”中复制带走。</p>');
  if (action === 'map' && !preview && !busy && navigator.onLine) {
    const links = navigationLinks(reading?.daily.location ?? null);
    if (links) show('车辆地图', `<iframe class="vehicle-map" title="车辆停车位置地图" src="${escape(links.map)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="geolocation 'none'"></iframe><p>地图标记是车辆最近上报的停车位置，可能有延迟。</p><a class="secondary-link" href="${escape(links.map)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">地图未显示？在高德中打开</a>${links.walk ? `<p><a class="secondary-link" href="${escape(links.walk)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">带我去找车</a>：规划从你所在位置步行到车辆的路线。</p>` : ''}`);
  }
  if (action === 'export-preferences') show('备份我的配置', `<p>复制下面的配置，之后可粘贴导入；不包含登录信息。</p><textarea id="preferences-backup" aria-label="配置备份" readonly>${escape(exportPreferences(preferences))}</textarea><button class="primary block" data-action="copy-preferences">复制配置</button>`);
  if (action === 'import-preferences') show('导入配置', '<form id="preferences-form"><label>粘贴配置<textarea id="preferences-import" maxlength="4096" required></textarea></label><button class="primary block" type="submit">确认导入</button></form><p>只替换使用偏好，不改变本机登录和车辆。</p>');
  if (action === 'reset-preferences') show('恢复默认配置', '<p>恢复使用偏好，不退出登录，不改变车辆。</p><button class="primary block" data-action="confirm-reset-preferences">确认恢复默认配置</button>');
  if (action === 'check-update' && !busy && !modal.open && !checkingUpdate && navigator.onLine) {
    checkingUpdate = true; render();
    void (updates?.check() ?? Promise.resolve('unavailable')).then(result => {
      notice = result === 'ready' || updateReady ? '新版本已准备好，请点击“更新并重新打开”。'
        : result === 'current' ? '已检查，目前没有新版本。' : result === 'failed' ? '更新检查未完成，请联网后重试。' : '当前入口暂不支持离线更新，请在 Safari 中重新打开正式网址。';
    }).finally(() => { checkingUpdate = false; render(); });
  }
  if (action === 'refresh') void refresh();
  if (action === 'update' && !busy && !modal.open && navigator.onLine) { updating = true; render(); updates?.activate(); }
  if (action === 'horn' && session && !expired && !busy && navigator.onLine) {
    show('鸣笛寻车', `<p>向 <strong>${escape(session.vehicle.name)}</strong>（尾号 ${escape(session.vehicle.vin.slice(-6))}）发送寻车请求。</p><button class="primary block" data-action="send-horn">发送鸣笛</button><button class="text-button block" data-action="send-horn-high">高声寻车</button><p class="muted">高声寻车可能更响；每次只执行你选择的一种。</p>`);
    commandTarget = session; commandIntent = 'horn';
  }
  if (action === 'vehicle-action' && session && !expired && !busy && navigator.onLine) {
    const mode = button.dataset.value as VehicleAction;
    if (['powerOn', 'powerOff', 'seat'].includes(mode)) {
      const description = mode === 'powerOn' ? '将开机并解锁车辆。' : mode === 'powerOff' ? '将关机并锁车，请在停车后操作。' : '将发送座桶开启请求，请在车旁确认开启结果。';
      show(commandNames[mode], `<p>目标：<strong>${escape(session.vehicle.name)}</strong>（尾号 ${escape(session.vehicle.vin.slice(-6))}）</p><p>${description}</p><button class="primary block" data-action="send-control" data-value="${mode}">确认${commandNames[mode]}</button>`);
      commandTarget = session; commandIntent = mode;
    }
  }
  if (action === 'command-report' && lastCommandReport && !busy) show(isHorn(lastCommandReport.mode) ? '寻车结果' : '车控结果', `<pre class="diagnostic-summary" tabindex="0">${escape(commandSummary(lastCommandReport, version))}</pre><button class="primary block" data-action="copy-command-report">复制排查摘要</button>`);
  if (action === 'logout' && !busy) show('退出本机登录', '<p>此设备保存的登录信息将被移除。</p><button class="primary block" data-action="confirm-logout">确认退出</button>');
});
content.addEventListener('change', event => {
  const select = event.target as HTMLSelectElement;
  if (select.dataset.preference === 'startPage' && ['vehicle', 'daily'].includes(select.value)) preferences.startPage = select.value as typeof preferences.startPage;
  else if (select.dataset.preference === 'shortcut' && ['horn', 'seat', 'daily'].includes(select.value)) preferences.shortcut = select.value as typeof preferences.shortcut;
  else return;
  applyPreferences(); render();
});
modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
modal.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  if (button.dataset.action === 'close') close();
  if (busy) return;
  if (button.dataset.action === 'confirm-reset-preferences') { preferences = { ...defaultPreferences }; notice = '已恢复默认配置，车辆连接保持。'; applyPreferences(); close(); }
  if (button.dataset.action === 'copy-preferences') {
    const text = exportPreferences(preferences);
    void (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => {
      const message = modal.querySelector('#modal-message'); if (message) message.textContent = '配置已复制。';
    }).catch(() => { (modal.querySelector('#preferences-backup') as HTMLTextAreaElement)?.select(); const message = modal.querySelector('#modal-message'); if (message) message.textContent = '请长按已选中的配置并复制。'; });
  }
  if (button.dataset.action === 'new-captcha') void fetchCaptcha();
  if (button.dataset.action === 'resend' && !secondsRemaining()) void fetchCaptcha();
  if (button.dataset.action === 'code') showCode(false);
  if (button.dataset.action === 'phone') showPhone();
  if (button.dataset.action === 'retry-list') void run(retrieveCars, { bound: pending?.token === session?.token ? session! : undefined });
  if (button.dataset.action === 'select') void selectVehicle(Number(button.dataset.value));
  if (button.dataset.action === 'send-horn') beginCommand('normal');
  if (button.dataset.action === 'send-horn-high') beginCommand('high');
  if (button.dataset.action === 'send-control' && ['powerOn', 'powerOff', 'seat'].includes(button.dataset.value ?? '')) beginCommand(button.dataset.value as VehicleAction);
  if (button.dataset.action === 'copy-command-report' && lastCommandReport) {
    const summary = commandSummary(lastCommandReport, version);
    const copy = navigator.clipboard ? navigator.clipboard.writeText(summary) : Promise.reject(new Error('Clipboard unavailable'));
    void copy.then(() => {
      const message = modal.querySelector('#modal-message');
      if (message) message.textContent = '已复制，可直接用于排查。';
    }).catch(() => {
      const message = modal.querySelector('#modal-message');
      if (message) message.textContent = '浏览器未允许复制，可长按上方摘要复制。';
    });
  }
  if (button.dataset.action === 'confirm-logout') void run(async (_signal, current) => {
    committing = true;
    const closeButton = modal.querySelector<HTMLButtonElement>('[data-action="close"]');
    if (closeButton) closeButton.disabled = true;
    try { await forgetSession(); }
    catch { throw new UserMessage('本机登录信息未能清除，请重试。'); }
    finally { committing = false; }
    if (!current()) return;
    session = null; reading = null; pending = null; lastCommandReport = null; expired = preview = false; notice = '已退出本机登录。'; modal.close();
  });
});
modal.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (!form.reportValidity()) return;
  if (form.id === 'preferences-form') {
    try { preferences = importPreferences(modal.querySelector<HTMLTextAreaElement>('#preferences-import')!.value); notice = '配置已导入，登录与车辆保持。'; applyPreferences(); close(); }
    catch { const message = modal.querySelector('#modal-message'); if (message) message.textContent = '配置格式不正确或版本不支持，请粘贴本应用导出的完整配置。'; }
    return;
  }
  if (form.id === 'phone-form') { phone = modal.querySelector<HTMLInputElement>('#phone')!.value.trim(); void fetchCaptcha(); }
  if (form.id === 'code-form') {
    const code = modal.querySelector<HTMLInputElement>('#code')!.value.trim();
    void run(async (signal, current) => {
      const account = await api.login(phone, code, signal);
      if (!current()) return;
      pending = { ...account, vehicles: [] };
      await retrieveCars(signal, current);
    });
  }
});

applyPreferences(false); render();
void loadSession().then(saved => {
  session = saved;
  if (saved) tab = preferences.startPage;
  if (saved) notice = navigator.onLine ? '已恢复本机连接，正在读取车况…' : '已恢复本机连接，联网后可读取车况。';
}).catch(() => { notice = '本机连接未能恢复，请重新登录。'; }).finally(() => {
  booting = false; render();
  if (session && navigator.onLine) void refresh();
});
setInterval(updateCooldown, 1000);
function foreground() {
  if (document.visibilityState !== 'visible') return;
  if (navigator.onLine && Date.now() - lastUpdateCheck > 60000) { lastUpdateCheck = Date.now(); void updates?.check(); }
  if (preferences.foregroundRefresh && !busy && !booting && !modal.open && navigator.onLine && Date.now() - lastReadAttempt > 60000) void refresh();
}
window.addEventListener('offline', render);
window.addEventListener('online', () => { render(); foreground(); });
document.addEventListener('visibilitychange', foreground);
window.addEventListener('pageshow', event => { if (event.persisted) foreground(); });
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  updates = installUpdates(() => { updateReady = true; render(); }, () => {
    updating = false; notice = '本次更新未完成，请联网后重新打开页面。'; render();
  });
  void navigator.serviceWorker.ready.then(() => { cacheReady = true; render(); });
}
