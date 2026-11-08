import './styles.css';
import { renderHome } from './ui/home';
import { icon, type Icon } from './ui/icons';
import { mountDesignLab } from './ui/design-lab';
import { ApiError, messageFor } from './api/client';
import { ZeehoApi } from './api/zeeho';
import { VehicleControls, type VehicleAction } from './api/controls';
import { demoSnapshot, demoVehicle, type Session, type Snapshot, type Vehicle, type VehicleList } from './core/model';
import { version } from '../package.json';
import { forgetSession, loadAccounts, saveSession, updateAccounts } from './core/vault';
import { accountSession, changeAccountPreferences, emptyAccounts, removeAccount, type AccountBook } from './core/accounts';
import { nativeAccountsAuthorized, revokeNativeAccounts, syncNativeAccounts } from './core/background';
import { clearLocalHistory, flushLocalHistory, recordLocalHistory } from './core/history-store';
import { downloadPanelImage, panelImage } from './core/panel-export';
import { mountAccounts } from './ui/accounts';
import { mountBackground } from './ui/background';
import { authorizeNativeAccounts } from './core/background';
import { mountTasks } from './ui/tasks';
import { clearTaskConfig } from './core/tasks-store';
import { mountCaptcha } from './ui/captcha';
import { storagePrefix } from './core/scope';
import { installUpdates } from './core/updates';
import { managePageCache } from './core/cache';
import { commandNames, commandSummary, type CommandMode, type CommandReport, type CommandStep } from './core/command-report';
import { pageFor, pageTitles } from './ui/pages';
import { createRouter } from './core/router';
import { shortcutNames } from './ui/pages/home-custom';
import { mountRecordsSummary } from './ui/pages/records-summary';
import type { PageActions } from './ui/pages/actions';
import { defaultPreferences, readPreferences, writePreferences, exportPreferences, importPreferences } from './core/preferences';
import { currentInstallContext } from './core/pwa';
import { navigationLinks } from './core/navigation';

import { connectNative, NativeClient } from './core/native';
import { mountNative, widgetSnapshot } from './ui/native';
import { ExtensionsApi } from './api/extensions';
import { MonthBars, Badge } from './ui/kit';
import { chinaDay } from './core/extensions-model';
import { mountExtensions } from './ui/extensions';
import { componentsPage } from './ui/kit/components-page';
import { PageHeader, Sheet, ListRow, ActionSheet, PickerSheet, ConfirmSheet } from './ui/kit';
import { mountLever, type LeverPhase } from './ui/kit/lever';
import { mountVehicleArt, rememberVehicleArt } from './ui/vehicle-art';
import { commandSheet, dataSheet, hornSheet, loginVehicleList, vehiclePicker } from './ui/pages/home-sheets';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<a class="skip-link" href="#main-content">跳到主要内容</a><div id="content"></div><dialog id="modal" aria-labelledby="modal-title"></dialog>';
const content = document.querySelector<HTMLDivElement>('#content')!;
const modal = document.querySelector<HTMLDialogElement>('#modal')!;
const api = new ZeehoApi();
const controls = new VehicleControls();
const native = connectNative(window);
let disposePanel: (() => void) | undefined;
let modalReturnFocus: { action: string; value?: string } | null = null;
let session: Session | null = null;
let accountBook: AccountBook = emptyAccounts();
let nativeSyncPending = false;
let pendingNativeShortcut: { vehicleId: string; action: 'refresh' | 'unlock' | 'lock' | 'horn' | 'seat' } | null = null;
let reading: Snapshot | null = null;
let preview = false, busy = false, booting = true, committing = false, activeControl = false, expired = false, generation = 0;
let updateReady = false, updating = false, lastReadAttempt = 0;
let updates: ReturnType<typeof installUpdates> | undefined;
let disposePage: (()=>void)|undefined, pageKey='';
let toolbarBody='', toolbarClick:((button:HTMLElement)=>void)|undefined;
document.addEventListener('keydown',()=>document.documentElement.dataset.input='keyboard');
document.addEventListener('pointerdown',()=>document.documentElement.dataset.input='pointer',true);
let sheetListener: ((button:HTMLElement)=>void)|undefined;
let mapVisible=false, versionTaps=0, developer=false;
const noNative=new NativeClient(null);
const hadRoute=location.hash.startsWith('#/');
const router=createRouter(()=>{ mapVisible=false; render(); },()=>{if(!modal.open)return false;close();return true;});
let notice = '';
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let shownNotice = '';
let realPreferences: typeof preferences | null = null;
let leverPhase: LeverPhase = 'idle', leverTarget: 'powerOn' | 'powerOff' = 'powerOn';
let leverTimer: ReturnType<typeof setTimeout> | undefined;
let leverStarted = 0;
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

  const dark = preferences.theme === 'dark' || preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B0D10' : '#FBFCFD');
  if (save && !preview && !writePreferences(preferences, `${storagePrefix}preferences`)) notice = '保存失败，请重试';
}
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const vehicle = () => preview ? demoVehicle : session?.vehicle;
const isHorn = (mode: CommandMode) => mode === 'normal' || mode === 'high';
const reportButton = () => lastCommandReport ? `<button class="action-row" data-action="command-report">查看${isHorn(lastCommandReport.mode) ? '寻车' : '车控'}结果</button>` : '';

const actions:PageActions={
 sheet(title,body,clicked){show(title,body);sheetListener=clicked;},
 toolbar(body,clicked){toolbarBody=body;toolbarClick=clicked;const slot=content.querySelector('.header-extra');if(slot)slot.innerHTML=body;},
 closeSheet:()=>close(),navigate:path=>router.navigate(path),toast:text=>{notice=text;render();},
};
function mountPage(host:HTMLElement) {
 const path=router.path,nativeClient=preview?noNative:native,book=preview?emptyAccounts():structuredClone(accountBook),bound=preview||expired?null:session;
 const uncertain=()=>{notice='未收到车辆响应';};
 const common={native:nativeClient,session:bound,demo:preview,snapshot:preview?demoSnapshot:reading,onExpired:panelExpired,onUncertain:uncertain,actions};
 if(path==='/vehicle'){let alive=true;const abort=new AbortController(),month=chinaDay().slice(0,7);if(preview)host.innerHTML=MonthBars(month,[{day:month+'-06',mileageKm:12.4}]);else if(bound){void new ExtensionsApi().month(bound,month,abort.signal).then(v=>{if(alive)host.innerHTML=MonthBars(month,v.days);}).catch(()=>{});void new ExtensionsApi().alerts(bound,1,abort.signal).then(v=>{if(alive&&(v.accountUnread||v.alerts.some(a=>a.unread))){const bell=content.querySelector('[aria-label="消息"]');if(bell&&!bell.querySelector('.badge'))bell.insertAdjacentHTML('beforeend',Badge());}}).catch(()=>{});}return()=>{alive=false;abort.abort();};}
 if(path==='/records')return mountRecordsSummary(host,{...common,vehicleId:book.selectedVehicleId??''});
 if(path==='/me/lab')return mountDesignLab(host);
 if(path==='/me/accounts')return mountAccounts(host,{book,onSelect:activateSavedVehicle,onRemove:forgetSavedAccount,onChange:changeSavedAccounts,onAdd:showPhone,actions,demo:preview});
 if(path==='/tools/tasks')return mountTasks(host,{...common,accounts:book,onNativeConsent:()=>preview?Promise.reject():authorizeNativeAccounts(native,accountBook).then(()=>{})});
 if(path.startsWith('/tools/bluetooth')||path.startsWith('/tools/meter')) {
   const dispose=mountNative(host.querySelector<HTMLElement>('#native-panel')!,{...common,section:path.startsWith('/tools/meter')?'meter':'bluetooth',view:path.split('/')[3]});
   const extra=host.querySelector<HTMLElement>('#background-panel');
   const disposeExtra=extra?mountBackground(extra,{...common,book,initial:'tools',toolGroup:'meter',onImported:importOfficialAccount}):undefined;
   return ()=>{dispose();disposeExtra?.();};
 }
 const ext=path.startsWith('/vehicle/settings')?'settings':path.startsWith('/vehicle/messages')?'alerts':path==='/records/tires'?'tires':path.startsWith('/records/rides/')?'tracks':path==='/records/rides'?'ride':null;
 if(ext)return mountExtensions(host,{...common,initial:ext,view:path.endsWith('/unsupported')?'unsupported':path.startsWith('/vehicle/messages/')?'message:'+decodeURIComponent(path.split('/').at(-1)!):undefined,day:ext==='tracks'?path.split('/').at(-1):undefined});
 if(path==='/tools'){let alive=true;if(!preview&&native.available)void native.call<any>('background.status').then(status=>{if(alive){const row=host.querySelector('[data-value="/tools/monitor"] .row-value');if(row)row.textContent=status?.enabled===true?'已开启':'未开启';}}).catch(()=>{});return()=>{alive=false;};}
 const initial=path==='/records/battery'?'history':path==='/tools/monitor'?'monitor':path==='/tools/widgets'?'desktop':'tools';
 return mountBackground(host,{...common,book,initial,toolGroup:path==='/tools/android'?'android':path==='/tools/scan'?'scan':'diagnostics',onImported:importOfficialAccount});
}
function render() {
 const focused=document.activeElement instanceof HTMLButtonElement&&content.contains(document.activeElement)?{action:document.activeElement.dataset.action,value:document.activeElement.dataset.value}:null;
 const car=vehicle(),data=preview?demoSnapshot:reading,locked=busy||booting||updating;
 const enabled=Boolean(!preview&&session&&!locked&&!expired&&navigator.onLine);
 const path=router.path;
 const key=[path,preview,expired,session?.uid,session?.vehicle.vin,path==='/records'?reading?.receivedAt:''].join('|');
 const existing=key===pageKey?content.querySelector<HTMLElement>('[data-page-controller]'):null;
 if(existing)existing.remove();
 else {const dispose=disposePage;disposePage=undefined;pageKey=key;dispose?.();toolbarBody='';toolbarClick=undefined;}
 let body=path==='/vehicle'?renderHome({car,data,preferences,enabled,locked,busy,control:activeControl,expired,online:navigator.onLine,demo:preview,message:notice,phase:leverPhase==='idle'?undefined:leverPhase,target:leverTarget,multi:!preview&&accountBook.accounts.reduce((n,a)=>n+a.vehicles.length,0)>1})
 :pageFor(path,{car,data,book:preview?emptyAccounts():accountBook,preferences,version,demo:preview,app:!preview&&native.available,android:!preview&&Boolean((window as any).GeometryNative),mapVisible,checking:checkingUpdate,developer,installed:currentInstallContext()==='installed'});
 if(!car&&!booting&&path!=='/vehicle'){router.navigate('/vehicle',true);return;}
 if(path==='/vehicle'&&preview)body+='<button class="action-row" data-action="preview">退出演示</button>';
 const header=path==='/vehicle'?'':path.split('/').length===2?`<h1 class="root-title">${pageTitles[path]}</h1>`:PageHeader(pageTitles[path]??(path.startsWith('/records/rides/')?'骑行':'几何面板'),toolbarBody||(path==='/vehicle/status'?`<button class="icon-button" data-action="refresh" aria-label="刷新车况" ${!enabled?'disabled':''}>${icon('refresh')}</button>`:''));
 content.innerHTML=`<div class="shell ${path==='/vehicle'?'home-shell':''} ${!car?'signed-out':''}">${expired?'<div class="global-banner error" role="status">登录已过期<button class="action-row" data-action="connect">重新登录</button></div>':!navigator.onLine?'<div class="global-banner" role="status">网络不可用</div>':nativeSyncPending?'<div class="global-banner" role="status">后台提醒需重新保存<button class="action-row" data-action="route" data-value="/tools/monitor">去设置</button></div>':''}${updateReady?`<div class="update-bar" role="status"><span>新版本已就绪</span><button class="action-row" data-action="update" ${locked||modal.open||!navigator.onLine?'disabled':''}>更新</button></div>`:''}${notice?`<div class="result-toast notice" role="status">${escape(notice)}</div>`:''}<main id="main-content" tabindex="-1">${header}${body}</main>${car?`<nav class="bottom-nav" aria-label="主导航">${(['vehicle','records','tools','me'] as const).map((root,i)=>`<button data-action="route" data-value="/${root}" ${router.root===root?'aria-current="page"':''}>${icon((['vehicle','chart','grid','user'] as Icon[])[i])}<span>${['车辆','记录','工具','我的'][i]}</span></button>`).join('')}</nav>`:''}</div>`;
 const host=content.querySelector<HTMLElement>('[data-page-controller]');
 if(host&&existing)host.replaceWith(existing);
 else if(host)disposePage=mountPage(host);
 mountVehicleArt(content);
 if(notice&&notice!==shownNotice){shownNotice=notice;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice='';shownNotice='';content.querySelector('.result-toast')?.remove();},4000);}
 if(!modal.open&&focused?.action)Array.from(content.querySelectorAll<HTMLButtonElement>('button[data-action]')).find(b=>b.dataset.action===focused.action&&b.dataset.value===focused.value&&!b.disabled)?.focus({preventScroll:true});
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyPreferences(false));

function show(title: string, body: string) {
  if (!modal.open) {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLButtonElement>('button[data-action]') : null;
    modalReturnFocus = opener?.dataset.action ? { action: opener.dataset.action, value: opener.dataset.value } : null;
  }
  disposePanel?.(); disposePanel = undefined; sheetListener=undefined;
  commandTarget = null; commandIntent = null;
  modal.innerHTML = Sheet(title, body);
  mountVehicleArt(modal);
  if (!modal.open) modal.showModal();
  if (busy) modal.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not([data-action="close"]),input').forEach(element => element.disabled = true);
  render();
}
function close() {
  if (committing) return;
  disposePanel?.(); disposePanel = undefined; sheetListener=undefined;
  if (busy) {
    aborter?.abort(); generation++; busy = false;
    if (activeControl) { notice = '未收到车辆响应'; if (leverPhase === 'sending') leverPhase = 'error'; }
    activeControl = false;
  }
  pending = null; commandTarget = null; commandIntent = null; modal.close(); modal.replaceChildren(); render();
  const target = modalReturnFocus; modalReturnFocus = null;
  const restoreFocus = () => {
    if (target && !modal.open) Array.from(content.querySelectorAll<HTMLButtonElement>('button[data-action]')).find(button => button.dataset.action === target.action && button.dataset.value === target.value && !button.disabled)?.focus({ preventScroll: true });
  };
  restoreFocus();
  // WebKit may finish its native dialog focus restoration after cancel dispatch.
  requestAnimationFrame(restoreFocus);
}
async function run(task: (signal: AbortSignal, current: () => boolean) => Promise<void>, options: { bound?: Session; control?: boolean } = {}) {
  if (busy || booting || updating) return;
  if (!navigator.onLine && !options.control && options.bound) { notice = '网络不可用'; render(); return; }
  busy = true; const epoch = ++generation; aborter = new AbortController();
  activeControl = Boolean(options.control);
  if (activeControl) notice = '正在发送';
  const signal = aborter.signal;
  render();
  modal.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not([data-action="close"]),input').forEach(element => element.disabled = true);
  const progress = modal.querySelector('#modal-message');
  if (progress) progress.textContent = '正在加载';
  try { await task(signal, () => epoch === generation && !signal.aborted); }
  catch (error) {
    if (epoch !== generation || signal.aborted) return;
    if (error instanceof ApiError && error.kind === 'expired' && options.bound && session === options.bound) {
      expired = true;
      void disableExpiredAccount(options.bound);
      if (native.available) void native.call('forgetVehicle').catch(() => {});
    }
    notice = error instanceof ApiError && error.kind === 'expired' ? '登录已过期' : options.control ? '未收到车辆响应' : error instanceof UserMessage ? error.message : '加载失败';
    if (options.control && leverPhase === 'sending') leverPhase = 'error';
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
  show('手机号', `<form id="phone-form"><label>手机号<input id="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="11" required pattern="1[0-9]{10}" value="${escape(phone)}"></label><button class="primary block" type="submit">获取验证码</button></form>`);
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
  button.textContent = seconds ? `${seconds} 秒后重新获取` : '重新获取验证码';
}
function showCode(_sent = true) {
  show('短信验证码', `<form id="code-form"><label>短信验证码<input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4,8}" maxlength="8" required></label><button class="primary block" type="submit">登录</button></form><button class="action-row" data-action="resend">重新获取验证码</button><button class="action-row" data-action="phone">更换手机号</button>`);
  updateCooldown();
}
async function fetchCaptcha() {
  if (secondsRemaining()) { showCode(false); return; }
  show('图形验证码', '<p class="muted">正在加载</p><button class="action-row" data-action="new-captcha">重新加载图片</button><button class="action-row" data-action="code">已有短信验证码</button><button class="action-row" data-action="phone">更换手机号</button>');
  await run(async (signal, current) => {
    const captcha = await api.captcha(phone, signal);
    if (!current()) return;
    show('图形验证码', '<canvas class="captcha" width="720" height="360" role="slider" tabindex="0" aria-label="拖动拼图完成验证" aria-valuemin="0" aria-valuenow="0"></canvas><button class="action-row" data-action="new-captcha">换一张</button><button class="action-row" data-action="code">已有短信验证码</button><button class="action-row" data-action="phone">更换手机号</button>');
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
function listBody(result: VehicleList | null) { return loginVehicleList(result, session?.vehicle.vin); }
async function retrieveCars(signal: AbortSignal, current: () => boolean) {
  const account = pending;
  if (!account) return;
  show('选择车辆', listBody(null));
  try {
    const result = await api.list(account.token, signal);
    if (!current() || pending !== account) return;
    pending.vehicles = result.vehicles; rememberVehicleArt(result.vehicles);
    show('选择车辆', listBody(result));
  } catch (error) {
    if (current()) show('选择车辆', '<p>加载失败</p><button class="primary block" data-action="retry-list">重新读取</button><button class="action-row" data-action="phone">更换账号</button>');
    throw error;
  }
}
async function refresh() {
  if (preview) { notice = '已更新'; render(); return; }
  if (!session || expired) return;
  const bound = session;
  lastReadAttempt = Date.now();
  await run(async (signal, current) => {
    const data = await api.read(bound, signal);
    if (current() && session === bound) { reading = data; notice = '已更新'; confirmLever(data); syncWidget(bound, data); }
  }, { bound });
}
async function selectVehicle(index: number) {
  if (!pending?.vehicles[index]) return;
  const candidate: Session = { token: pending.token, uid: pending.uid, vehicle: pending.vehicles[index] };
  const cars = pending.vehicles;
  await run(async (signal, current) => {
    committing = true;
    const closeButton = modal.querySelector<HTMLButtonElement>('[data-action="close"]');
    if (closeButton) closeButton.disabled = true;
    try { if (native.available) await native.call('forgetVehicle', {}, signal); await saveSession(candidate, cars); accountBook = await loadAccounts(); }
    catch { throw new UserMessage('保存失败，请重试'); }
    finally { committing = false; }
    if (!current()) return;
    session = candidate; reading = null; lastCommandReport = null; resetLever(); preview = expired = false; pending = null;
    await synchronizeAccounts();
    notice = '正在加载';
    modal.close(); router.navigate('/'+preferences.startPage);
    render();
    lastReadAttempt = Date.now();
    const data = await api.read(candidate, signal);
    if (current()) { reading = data; notice = '已更新'; syncWidget(candidate, data); }
  }, { bound: candidate });
}
function syncWidget(bound: Session, data: Snapshot) {
  if (native.available && session === bound && !expired && !preview) void native.call('widget.update', { ...widgetSnapshot(bound, data), vehicleId: accountBook.selectedVehicleId }).catch(() => {});
  if (session === bound && !expired && !preview && accountBook.selectedVehicleId) void recordLocalHistory(accountBook.selectedVehicleId, data).catch(() => { notice = '保存失败，请重试'; render(); });
}
async function synchronizeAccounts() {
  try { await syncNativeAccounts(native, accountBook); nativeSyncPending = false; }
  catch { nativeSyncPending = true; }
}
async function activateSavedVehicle(vehicleId: string) {
  const candidate = accountSession(accountBook, vehicleId); if (!candidate) return;
  await run(async (signal, current) => {
    committing = true;
    try { if (native.available) await native.call('forgetVehicle', {}, signal); accountBook = await updateAccounts(book => {
      const latest = accountSession(book, vehicleId); if (!latest || latest.token !== candidate.token) throw new Error('storage_changed');
      book.selectedVehicleId = vehicleId; return book;
    }); }
    catch { throw new UserMessage('保存失败，请重试'); }
    finally { committing = false; }
    if (!current()) return;
    session = candidate; reading = null; lastCommandReport = null; resetLever(); preview = expired = false; pending = null;
    await synchronizeAccounts();
    disposePanel?.(); disposePanel = undefined; modal.close(); router.navigate('/'+preferences.startPage); render();
    lastReadAttempt = Date.now(); const data = await api.read(candidate, signal);
    if (current() && session === candidate) { reading = data; notice = '已更新'; syncWidget(candidate, data); }
  }, { bound: candidate });
  if (accountBook.selectedVehicleId !== vehicleId) return;
}
async function forgetSavedAccount(accountId: string) {
  await run(async (_signal, current) => {
    committing = true;
    try {
      if (native.available && nativeAccountsAuthorized()) await native.call('accounts.remove', { accountId });
      if (native.available) await native.call('forgetVehicle');
      const removedCars = accountBook.accounts.find(item => item.id === accountId)?.vehicles ?? [];
      accountBook = await updateAccounts(book => removeAccount(book, accountId));
      for (const car of removedCars) await clearLocalHistory(car.id);
      await clearTaskConfig(accountId);
    } finally { committing = false; }
    if (!current()) return;
    session = accountSession(accountBook); reading = null; lastCommandReport = null; resetLever(); expired = preview = false;
    await synchronizeAccounts(); notice = '已移除此账号'; render();
  });
  if (accountBook.accounts.some(item => item.id === accountId)) throw new Error('storage');
}
function panelExpired() {
  expired = true; notice = '登录已过期'; if(modal.open)close();router.navigate('/vehicle');render();
  if (session) void disableExpiredAccount(session);
  if (native.available) void native.call('forgetVehicle').catch(() => {});
}
async function disableExpiredAccount(bound: Session) {
  try {
    accountBook = await updateAccounts(book => {
      const account = book.accounts.find(item => item.uid === bound.uid && item.token === bound.token);
      if (account?.enabled) { account.enabled = false; account.epoch++; }
      return book;
    });
    await synchronizeAccounts();
  } catch { nativeSyncPending = true; render(); }
}
async function changeSavedAccounts(next: AccountBook, before: AccountBook) {
  let saved = false;
  await run(async () => {
    committing = true;
    try { accountBook = await updateAccounts(book => changeAccountPreferences(book, before, next)); saved = true; }
    finally { committing = false; }
    await synchronizeAccounts();
  });
  if (!saved) throw new Error('storage');
}
async function importOfficialAccount(value: unknown) {
  const data = value as { token?: unknown; uid?: unknown } | null;
  if (!data || typeof data.token !== 'string' || !data.token || data.token.length > 8192 || /\s/.test(data.token)
    || typeof data.uid !== 'string' || !data.uid || data.uid.length > 128 || /[\u0000-\u001f\u007f]/.test(data.uid)) throw new UserMessage('登录资料不完整');
  await run(async (signal, current) => {
    pending = { token: data.token as string, uid: data.uid as string, vehicles: [] };
    await retrieveCars(signal, current);
  });
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
  if (mode === 'powerOn' || mode === 'powerOff') { clearTimeout(leverTimer); leverTarget = mode; leverStarted = Date.now(); leverPhase = 'sending'; }
  void run(async (signal, current) => {
    const progress = (step: CommandStep) => {
      const index = report.steps.findIndex(value => value.stage === step.stage);
      if (index < 0) report.steps.push(step); else report.steps[index] = step;
      if (current()) {
        const message = modal.querySelector('#modal-message');
        if (message) message.textContent = '正在发送';
      }
    };
    if (mode === 'normal' || mode === 'high') await api.horn(bound, signal, { mode, onProgress: progress });
    else await controls.execute(bound, mode, signal, progress);
    if (current()) {
      notice = isHorn(mode) ? '已发送鸣笛寻车' : '等待车辆响应';
      if (mode === 'powerOn' || mode === 'powerOff') { leverPhase = 'pending'; leverTimer = setTimeout(() => { leverPhase = 'error'; notice = '未收到车辆响应'; render(); }, 15000); }
      commandTarget = null; commandIntent = null; modal.close();
    }
  }, { bound, control: true });
}

function presentControl(mode: VehicleAction, drag = false) {
  if (busy || expired || !navigator.onLine || (!session && !preview)) return;
  const label = mode === 'powerOn' ? '上电开锁' : mode === 'powerOff' ? '关机锁车' : '打开座桶';
  if (preview) { leverTarget = mode === 'powerOff' ? 'powerOff' : 'powerOn'; show(label, commandSheet(demoVehicle, label, mode).replace('send-control', 'demo-control')); return; }
  const bound = session!;
  show(label, commandSheet(bound.vehicle, label, mode)); commandTarget = bound; commandIntent = mode;
  if (drag) beginCommand(mode);
}
function confirmLever(data: Snapshot) {
  if ((leverPhase === 'pending' || leverPhase === 'error') && data.daily.reportState === 'fresh' && (data.daily.reportedAt ?? 0) > leverStarted && data.daily.vehicleLocked === (leverTarget === 'powerOff')) {
    clearTimeout(leverTimer); leverPhase = 'success'; leverTimer = setTimeout(() => { leverPhase = 'idle'; render(); }, 2000);
  }
}
function resetLever() { clearTimeout(leverTimer); leverPhase = 'idle'; leverStarted = 0; }
mountLever(content, presentControl);
window.addEventListener('scroll', () => { const photo = content.querySelector('.studio-photo'); content.querySelector('.home-page')?.classList.toggle('folded', Boolean(photo && photo.getBoundingClientRect().bottom < 100)); }, { passive: true });
function handleAction(event: MouseEvent) {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (booting || updating) return;
  if(action==='page-toolbar'){toolbarClick?.(button);return;}
  if(action==='route'){router.navigate(button.dataset.value!);return;}
  if(action==='back'){router.back();return;}
  if (action === 'preview') { if (!preview) { realPreferences = preferences; preferences = structuredClone(defaultPreferences); preview = true; } else { preview = false; if (realPreferences) preferences = realPreferences; realPreferences = null; } notice = ''; resetLever(); applyPreferences(false); router.navigate('/vehicle'); render(); }
  if (action === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
  if (action === 'data-status') show('数据状态', dataSheet(preview ? demoSnapshot : reading));
  if (action === 'vehicle-picker' && !busy) { if (preview) show('切换车辆', '<div class="list-row">演示车辆</div>'); else show('切换车辆', vehiclePicker(accountBook)); }
  if (action === 'more') show('更多', ActionSheet([['分享车况图片', 'grid', 'status-export'], ['查看上次车控结果', 'info', 'command-report'], ['首页按键设置', 'settings', 'route', '/me/home']]));
  if (action === 'walk' && !preview) { const links = navigationLinks(reading?.daily.location ?? null); if (links?.walk) window.open(links.walk, '_blank', 'noopener,noreferrer'); }
  if (action === 'connect' && !busy) showPhone();
  if (action === 'status-export' && !busy && (preview || reading)) {
    void (async()=>{try {
      const image = await panelImage(preview ? demoSnapshot : reading!, preview, vehicle()?.name);
      if (native.available) void run(async () => { await native.call('asset.export', { kind: 'panel', ...image }); notice = '已导出'; });
      else downloadPanelImage(image);
    } catch { notice = '导出失败'; render(); }})();
  }
  if (action === 'switch' && session && !busy && !expired) {
    const bound = session;
    pending = { token: bound.token, uid: bound.uid, vehicles: [] };
    void run(retrieveCars, { bound });
  }
  if (action === 'theme' && ['system', 'light', 'dark'].includes(button.dataset.value ?? '')) { preferences.theme = button.dataset.value as typeof preferences.theme; applyPreferences(); render(); }
  if (action === 'voltage') { preferences.voltage = !preferences.voltage; applyPreferences(); render(); }
  if (action === 'range') { preferences.range = !preferences.range; applyPreferences(); render(); }
  if (action === 'foreground-refresh') { preferences.foregroundRefresh = !preferences.foregroundRefresh; applyPreferences(); render(); }
  if(action==='map'&&!preview&&!busy&&navigator.onLine){mapVisible=!mapVisible;render();}
  if(action==='version'){if(++versionTaps>=5){developer=true;render();}}
  if(action==='pick-start')show('打开后的首页',PickerSheet([['vehicle','车辆'],['records','记录'],['tools','工具'],['me','我的']],preferences.startPage,'start-value'));
  if(action==='pick-shortcut')show('首页按键',PickerSheet(Object.entries(shortcutNames),preferences.shortcut[Number(button.dataset.value)],'shortcut-'+button.dataset.value));
  if(action==='download-app')show('下载 App',`<div class="list-group"><a class="list-row" href="https://github.com/bedlatess/GeometryPanel/releases/latest" target="_blank" rel="noopener noreferrer">Android</a><a class="list-row" href="https://github.com/bedlatess/GeometryPanel/releases/latest" target="_blank" rel="noopener noreferrer">iPhone 自签</a></div>`);
  if(action==='export-preferences')downloadText(exportPreferences(preferences),'geometry-config.json');
  if(action==='import-preferences')show('导入配置',`<label>选择配置文件<input type="file" id="preferences-file" accept=".json,application/json"></label><form id="preferences-form"><label>粘贴配置<textarea id="preferences-import" maxlength="4096" required></textarea></label><button class="primary" type="submit">导入配置</button></form>`);
  if(action==='copy-preferences')copyPreferences();
  if(action==='reset-preferences')show('恢复默认',ConfirmSheet('恢复默认','使用偏好','—','data-action="confirm-reset-preferences"'));
  if(action==='command-report'&&lastCommandReport&&!busy){router.navigate('/tools/diagnostics');return;}
  if(action==='export-command-report'&&lastCommandReport)downloadText(commandSummary(lastCommandReport,version),'geometry-command.txt');
  if(action==='parity-export')void fetch(import.meta.env.BASE_URL+'verification/original-parity.json').then(r=>r.text()).then(t=>downloadText(t,'geometry-functions.json'));
  if ((action === 'cache-status' || action === 'cache-clear') && !busy) void run(async () => { const result=await managePageCache(action==='cache-clear');notice=result.includes('未')?'加载失败':action==='cache-clear'?'已清理':'离线数据已就绪'; });
  if (action === 'check-update' && !busy && !modal.open && !checkingUpdate && navigator.onLine) {
    checkingUpdate = true; render();
    void (updates?.check() ?? Promise.resolve('unavailable')).then(result => {
      notice=result==='ready'||updateReady?'新版本已就绪':result==='current'?'已是最新版本':'加载失败';
    }).finally(() => { checkingUpdate = false; render(); });
  }
  if (action === 'refresh') void refresh();
  if (action === 'update' && !busy && !modal.open && navigator.onLine) { updating = true; render(); updates?.activate(); }
  if (action === 'horn' && !busy && navigator.onLine && !expired) {
    if (preview) { show('寻车', hornSheet(demoVehicle)); return; }
    if (session) { show('寻车', hornSheet(session.vehicle)); commandTarget = session; commandIntent = 'horn'; }
  }
  if (action === 'horn-high' && !busy && navigator.onLine && !expired) {
    if (preview) show('寻车', hornSheet(demoVehicle, 'high'));
    else if (session) { show('寻车', hornSheet(session.vehicle, 'high')); commandTarget = session; commandIntent = 'horn'; }
  }
  if (action === 'storage') { notice = '此车型不支持'; render(); }
  if (action === 'vehicle-action' && !busy && navigator.onLine && !expired && ['powerOn','powerOff','seat'].includes(button.dataset.value ?? '')) presentControl(button.dataset.value as VehicleAction);
  if(action==='logout'&&!busy&&!preview)show('退出全部账号',ConfirmSheet('退出全部账号','本机全部账号','—','data-action="confirm-logout"','移除本机登录和后台绑定'));
}
content.addEventListener('click', handleAction);
function downloadText(text:string,name:string){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function copyPreferences(){const value=exportPreferences(preferences);void(navigator.clipboard?.writeText(value)??Promise.reject()).then(()=>{notice='已复制';render();}).catch(()=>{content.querySelector<HTMLTextAreaElement>('#preferences-backup')?.select();notice='复制配置';render();});}
modal.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || !modal.open) return;
  const items = Array.from(modal.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled,[hidden]') && element.getClientRects().length > 0);
  const first = items[0], last = items.at(-1);
  if (!first) { event.preventDefault(); modal.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last || !modal.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
});
modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
let sheetPointer: { id: number; y: number } | null = null;
modal.addEventListener('pointerdown', event => {
  if (!(event.target as Element).closest('.sheet-handle')) return;
  sheetPointer = { id: event.pointerId, y: event.clientY }; modal.setPointerCapture(event.pointerId);
});
modal.addEventListener('pointermove', event => {
  if (!sheetPointer || sheetPointer.id !== event.pointerId) return;
  modal.style.transform = `translateY(${Math.max(0, event.clientY - sheetPointer.y)}px)`;
});
modal.addEventListener('pointerup', event => {
  if (!sheetPointer || sheetPointer.id !== event.pointerId) return;
  const distance = event.clientY - sheetPointer.y; sheetPointer = null; modal.style.removeProperty('transform'); if (distance > 80) close();
});
modal.addEventListener('pointercancel', () => { sheetPointer = null; modal.style.removeProperty('transform'); });
modal.addEventListener('click', event => {
  const selected=(event.target as Element).closest<HTMLElement>('button');
  if(selected&&!selected.hasAttribute('disabled')&&selected.dataset.action!=='close'&&sheetListener){sheetListener(selected);return;}
  if (event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { close(); return; } }
  const mode = (event.target as Element).closest<HTMLButtonElement>('button[data-horn-mode]');
  if (mode) { const bound = commandTarget; show('寻车', hornSheet(preview ? demoVehicle : bound!.vehicle, mode.dataset.hornMode)); commandTarget = bound; commandIntent = 'horn'; return; }
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  if (button.dataset.action === 'close') close();
  if (['status-export','command-report','route'].includes(button.dataset.action ?? '')){handleAction(event);return;}
  if (button.dataset.action === 'saved-vehicle') void activateSavedVehicle(button.dataset.value!);
  if (button.dataset.action === 'send-horn-choice') { if (preview) { notice = '已发送鸣笛寻车'; close(); } else beginCommand(button.dataset.value === 'high' ? 'high' : 'normal'); }
  if (button.dataset.action === 'demo-control') { close(); leverPhase = 'sending'; render(); clearTimeout(leverTimer); leverTimer = setTimeout(() => { leverPhase = 'pending'; render(); leverTimer = setTimeout(() => { leverPhase = 'error'; render(); }, 15000); }, 700); }

  if (busy) return;
  if(button.dataset.action==='start-value'){preferences.startPage=button.dataset.value as typeof preferences.startPage;applyPreferences();close();}
  if(button.dataset.action?.startsWith('shortcut-')){preferences.shortcut=[...preferences.shortcut];preferences.shortcut[Number(button.dataset.action.slice(9))]=button.dataset.value as typeof preferences.shortcut[number];applyPreferences();close();}
  if (button.dataset.action === 'confirm-reset-preferences') { preferences = structuredClone(defaultPreferences); notice = '已恢复默认'; applyPreferences(); close(); }
  if (button.dataset.action === 'new-captcha') void fetchCaptcha();
  if (button.dataset.action === 'resend' && !secondsRemaining()) void fetchCaptcha();
  if (button.dataset.action === 'code') showCode(false);
  if (button.dataset.action === 'phone') showPhone();
  if (button.dataset.action === 'retry-list') void run(retrieveCars, { bound: pending?.token === session?.token ? session! : undefined });
  if (button.dataset.action === 'select') void selectVehicle(Number(button.dataset.value));
  if (button.dataset.action === 'send-horn') beginCommand('normal');
  if (button.dataset.action === 'send-horn-high') beginCommand('high');
  if (button.dataset.action === 'send-control' && ['powerOn', 'powerOff', 'seat'].includes(button.dataset.value ?? '')) beginCommand(button.dataset.value as VehicleAction);
  if (button.dataset.action === 'native-shortcut-continue') void continueNativeShortcut();
  if (button.dataset.action === 'confirm-logout') void run(async (_signal, current) => {
    committing = true;
    const closeButton = modal.querySelector<HTMLButtonElement>('[data-action="close"]');
    if (closeButton) closeButton.disabled = true;
    try { await revokeNativeAccounts(native); if (native.available) await native.call('forgetVehicle'); for (const account of accountBook.accounts) await clearTaskConfig(account.id); await flushLocalHistory(); await forgetSession(); accountBook = emptyAccounts(); nativeSyncPending = false; }
    catch { throw new UserMessage('保存失败，请重试'); }
    finally { committing = false; }
    if (!current()) return;
    session = null; reading = null; pending = null; lastCommandReport = null; resetLever(); expired = preview = false; notice = '已退出全部账号'; modal.close(); router.navigate('/vehicle');
  });
});
function handleSubmit(event:SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (!form.reportValidity()) return;
  if (form.id === 'preferences-form') {
    try { preferences = importPreferences(modal.querySelector<HTMLTextAreaElement>('#preferences-import')!.value); notice = '已导入'; applyPreferences();close(); }
    catch { notice='配置格式不正确';render(); }
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
}
modal.addEventListener('change',async event=>{const input=event.target as HTMLInputElement;if(input.id==='preferences-file'&&input.files?.[0]){const value=await input.files[0].text();const area=modal.querySelector<HTMLTextAreaElement>('#preferences-import');if(area)area.value=value;}});
modal.addEventListener('submit',handleSubmit);content.addEventListener('submit',handleSubmit);

applyPreferences(false); render();
const updateTextSize = () => { document.documentElement.dataset.largeText = String(parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24); };
new MutationObserver(updateTextSize).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
window.addEventListener('resize', updateTextSize); updateTextSize();
void loadAccounts().then(async book => {
  accountBook = book; const saved = accountSession(book); session = saved;
  await synchronizeAccounts();
  if (saved&&!hadRoute) router.navigate('/'+preferences.startPage,true);
  if (saved) notice = navigator.onLine ? '正在加载' : '网络不可用';
}).catch(() => { notice = '登录已过期'; }).finally(() => {
  booting = false; render();
  if (pendingNativeShortcut) presentNativeShortcut();
  else if (session && navigator.onLine) void refresh();
});
setInterval(updateCooldown, 1000);
function foreground() {
  if (document.visibilityState !== 'visible') return;
  render(); // Re-evaluate report age even when foreground refresh is disabled.
  if (navigator.onLine && Date.now() - lastUpdateCheck > 60000) { lastUpdateCheck = Date.now(); void updates?.check(); }
  if (preferences.foregroundRefresh && !busy && !booting && !modal.open && navigator.onLine && Date.now() - lastReadAttempt > 60000) void refresh();
}
window.addEventListener('offline', render);
window.addEventListener('online', () => { render(); foreground(); });
document.addEventListener('visibilitychange', foreground);
window.addEventListener('pageshow', event => { if (event.persisted) foreground(); });
window.addEventListener('geometry:native-shortcut', ((event: CustomEvent<unknown>) => {
  const data = event.detail as Record<string, unknown> | null;
  if (!native.available || !data || typeof data.vehicleId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(data.vehicleId)
    || !['refresh', 'unlock', 'lock', 'horn', 'seat'].includes(String(data.action))) return;
  pendingNativeShortcut = { vehicleId: data.vehicleId, action: data.action as NonNullable<typeof pendingNativeShortcut>['action'] };
  if (!booting && !busy && !committing && !updating) presentNativeShortcut();
}) as EventListener);
(window as unknown as { __geometryNativeShortcutReady: boolean }).__geometryNativeShortcutReady = true;
function presentNativeShortcut() {
  const target = pendingNativeShortcut; if (!target) return;
  const candidate = accountSession(accountBook, target.vehicleId);
  if (!candidate) { pendingNativeShortcut = null; notice = '车辆不可用'; render(); return; }
  const name = { refresh: '刷新车况', unlock: '上电开锁', lock: '关机锁车', horn: '鸣笛寻车', seat: '打开座桶' }[target.action];
  show('系统快捷指令',ConfirmSheet('继续',candidate.vehicle.name,candidate.vehicle.vin.slice(-6),'data-action="native-shortcut-continue"',name));
}
async function continueNativeShortcut() {
  const target = pendingNativeShortcut; pendingNativeShortcut = null;
  if (!target || busy || !navigator.onLine) return;
  try { await activateSavedVehicle(target.vehicleId); }
  catch { notice = '保存失败，请重试'; render(); return; }
  if (busy || expired || !session || accountBook.selectedVehicleId !== target.vehicleId) return;
  if (target.action === 'refresh') return;
  const mode = target.action === 'unlock' ? 'powerOn' : target.action === 'lock' ? 'powerOff' : target.action;
  if (mode === 'horn') { show('寻车',hornSheet(session.vehicle)); commandTarget = session; commandIntent = 'horn'; }
  else { show(commandNames[mode], ConfirmSheet(commandNames[mode],session.vehicle.name,session.vehicle.vin.slice(-6),`data-action="send-control" data-value="${mode}"`)); commandTarget = session; commandIntent = mode; }
}
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  updates = installUpdates(() => { updateReady = true; render(); }, () => {
    updating = false; notice = '加载失败'; render();
  });
  void navigator.serviceWorker.ready.then(() => { cacheReady = true; render(); });
}
