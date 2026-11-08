import {choose,chooseDate}from './kit/pickers';
import {icon}from './icons';
import {version}from '../../package.json';
import { ListGroup,ListRow,Stat,Empty,PlatformNote,Segmented,ConfirmSheet,age,PrimaryButton,SecondaryButton,RefreshButton,html } from './kit';
import type { PageActions } from './pages/actions';
import { nativeAccounts, type AccountBook } from '../core/accounts';
import { authorizeNativeAccounts, nativeAccountsAuthorized, readBackgroundPreferences, saveBackgroundPreferences, notificationDefaults, type BackgroundNotifications } from '../core/background';
import { clearLocalHistory, readLocalHistory } from '../core/history-store';
import { historyCsv } from '../core/history';
import { nativeMessage, type NativeCapabilities, type NativeClient, type NativeMethod } from '../core/native';
import { storagePrefix } from '../core/scope';
import { demoVehicle, type Snapshot } from '../core/model';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).replace('/', '月').replace(' ', '日 ') : '未知';
const number = (value: unknown, unit = '') => typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(2))}${unit}` : '—';
const labels: Record<keyof BackgroundNotifications, string> = { chargeStart: '充电开始', chargeProgress: '充电进度', chargeFull: '已充满', chargeStop: '充电中止', message: '车辆消息', lowBattery: '电量低', offline: '车辆离线', tire: '胎压异常' };
export function mountBackground(host: HTMLElement, options: { native: NativeClient; book: AccountBook; demo: boolean; snapshot?: Snapshot | null; onUncertain?(): void; onImported?(session: unknown): Promise<void>; initial?: 'monitor' | 'history' | 'desktop' | 'tools'; toolGroup?: 'meter' | 'android' | 'scan' | 'diagnostics'; actions: PageActions }) {
  const { native, book, demo } = options, controller = new AbortController();
  let disposed = false, working = false, message = '', section: 'monitor' | 'history' | 'desktop' | 'tools' = options.initial ?? 'monitor';
  let caps: NativeCapabilities | null = null, status: any = null, kind: 'battery' | 'charge' | 'events' = 'battery', items: any[] = [], total = 0, confirmingClear = false;
  let selected = book.selectedVehicleId ?? '', style = '2x2', controls = false;
  let monitorEnabled=false,updateAvailable=false;
  let range = '24h', startTime = '', endTime = '';
  const preferences = demo ? {notifications:{...notificationDefaults},lowBatteryThreshold:20} : readBackgroundPreferences();
  const vehicles = demo ? [{ id: 'demo-vehicle', vin: demoVehicle.vin, label: demoVehicle.name, accountLabel: '演示' }]
    : book.accounts.flatMap(account => account.vehicles.map(car => ({ ...car, accountLabel: account.label })));
  if (!vehicles.some(car => car.id === selected)) selected = vehicles[0]?.id ?? '';
  const feature = (name: keyof NativeCapabilities['features']) => native.available && caps?.features[name] === true;
  const enabled = () => !demo && !working && Boolean(selected);
  const useNativeHistory = () => feature('history') && nativeAccountsAuthorized();
  const button = (action: string, label: string, allowed = enabled()) => `<button class="list-row action-row" data-background="${action}" ${allowed ? '' : 'disabled'}>${label}</button>`;
  const desktopKey = `${storagePrefix}desktop-preferences`;
  function loadDesktop() {
    style = '2x2'; controls = false; if(demo)return;
    try { const value = JSON.parse(localStorage.getItem(desktopKey) ?? '{}')?.[selected]; if (['1x1','2x2','4x2','4x4'].includes(value?.style)) style = value.style; controls = value?.controls === true; } catch { }
  }
  function saveDesktop() {
    try { const value = JSON.parse(localStorage.getItem(desktopKey) ?? '{}'); const next: Record<string, unknown> = {};
      for (const car of vehicles) if (value?.[car.id]) next[car.id] = { style: value[car.id].style, controls: value[car.id].controls === true };
      next[selected] = { style, controls }; localStorage.setItem(desktopKey, JSON.stringify(next));
    } catch { }
  }
  function desktopPreview() {
    const car = vehicles.find(item => item.id === selected), snapshot = status?.vehicles?.find((item: any) => item.id === selected)?.snapshot ?? (selected === book.selectedVehicleId ? options.snapshot : null);
    return `<section class="widget-preview" data-size="${style}" aria-label="组件内容预览"><strong>${escape(car?.label??'—')}</strong><img class="widget-mark" src="${import.meta.env.BASE_URL}brand/app-icon.svg" alt=""><div class="stats-grid">${Stat(snapshot?.soc,'%','电量')}${Stat(snapshot?.range,'km','续航')}${Stat(snapshot?.voltage,'V','电压')}</div><time>${age(snapshot?.receivedAt)}</time></section>`;
  }
  function filteredItems() {
    const from = startTime ? new Date(startTime).getTime() : range === 'all' || range === 'custom' ? 0 : Date.now() - ({ '24h': 1, '7d': 7, '30d': 30, '90d': 90 }[range] ?? 1) * 86400000;
    const until = endTime ? new Date(endTime).getTime() : Number.MAX_SAFE_INTEGER;
    return items.filter(item => { const at = kind === 'charge' ? item.startedAt || item.detectedAt : item.at; return typeof at === 'number' && at >= from && at <= until; });
  }
  function rangeSummary(visible: any[]) {
    const samples = visible.filter(item => typeof item.soc === 'number' && Number.isFinite(item.soc) && item.soc >= 0 && item.soc <= 100).sort((a, b) => a.at - b.at);
    if (kind !== 'battery' || !samples.length) return '';
    const values = samples.map(item => item.soc), change = values.at(-1)! - values[0];
    return `<div class="stats-grid">${Stat(Math.min(...values),'%','最低电量')}${Stat(Math.max(...values),'%','最高电量')}${Stat(change,'%','电量变化')}</div>`;
  }
  function historyBody() {
    const visible = filteredItems();
    const rows=visible.map(item=>kind==='battery'?ListRow(time(item.at),`${number(item.soc,'%')} · ${number(item.voltage,' V')}`,'',undefined,true):kind==='charge'?ListRow(time(item.startedAt),`${number(item.startSoc,'%')} → ${number(item.endSoc,'%')} · ${{charging:'充电中',full:'已充满',interrupted:'已中止',unknown:'结束状态未知'}[item.status as string]??'—'}`,'',undefined,true):ListRow(item.title||'提醒',time(item.at),'',undefined,true)).join('');
    return `${Segmented([['battery','电量'],['charge','充电记录'],['events','提醒记录']],kind,'data-history-kind')}${Segmented([['24h','24 小时'],['7d','7 天'],['30d','30 天'],['all','全部']],range,'data-history-period')}${ListGroup('',ListRow('自定义时段',range==='custom'?`${startTime} — ${endTime}`:'','data-background="custom-range"'))}${kind==='battery'&&visible.length?batteryChart(visible):''}${rangeSummary(visible)}${visible.length?ListGroup('',`<div data-history-items>${rows}</div>`):Empty(kind==='charge'?'暂无充电记录':'数据不足','bolt')}${items.length<total&&items.length<5000?ListGroup('',button('history-more','加载更多')):''}${visible.length?ListGroup('',button('history-export','导出表格')):''}${ListGroup('',`<button class="list-row danger" data-background="history-clear" ${enabled()?'':'disabled'}>清除本机记录</button>`)}`;
  }

  function render() {
    if(disposed)return;
    const unavailable=!native.available||demo;
    let body='';
    if(section==='monitor')body=`${unavailable?PlatformNote():''}${ListGroup('',`<button class="list-row" data-background="toggle-monitor" role="switch" aria-checked="${monitorEnabled}" ${!feature('background')||demo||working?'disabled':''}><span>后台提醒</span><span class="switch ${monitorEnabled?'checked':''}" aria-hidden="true"></span></button>`)}<p class="muted">${monitorEnabled?(status?.lastRun?'最近读取 '+new Date(status.lastRun).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'已开启'):'未开启'}</p><fieldset class="${monitorEnabled?'':'disabled-group'}" ${!monitorEnabled?'disabled':''}>${ListGroup('提醒分类',(Object.keys(labels)as(keyof BackgroundNotifications)[]).map(key=>`<label class="switch-input"><span>${labels[key]}</span><input type="checkbox" role="switch" data-background-notification="${key}" ${preferences.notifications[key]?'checked':''} ${working||demo||!monitorEnabled?'disabled':''}></label>`).join(''))}${ListGroup('',ListRow('低电提醒',preferences.lowBatteryThreshold+'%','data-background="pick-threshold"'))}</fieldset>${PrimaryButton('保存','data-background="save-monitor"',!enabled()||!feature('background'))}${ListGroup('',button('run','读取一次',enabled()&&monitorEnabled&&feature('background'))+ListRow('提醒记录','','data-background="history-events"'))}`;
    if(section==='history')body=historyBody();
    if(section==='desktop')body=`${unavailable?PlatformNote():''}${desktopPreview()}${Segmented([['1x1','小'],['2x2','中'],['4x2','宽'],['4x4','大']],style,'data-widget-size')}<label class="switch-input"><span>车辆操作入口</span><input type="checkbox" role="switch" data-background-controls ${controls?'checked':''} ${demo?'disabled':''}></label>${PrimaryButton('添加到桌面','data-background="widget-pin"',!enabled()||!feature('widget'))}${ListGroup('',button('widget-save','保存组件',enabled()&&feature('widget'))+button('widget-reset','恢复只读',enabled()&&feature('widget'))+(feature('shortcuts')?button('shortcuts','创建快捷指令'):''))}`;
    if(section==='tools'){
      const group=options.toolGroup;
      const tool=(action:string,label:string,featureName:keyof NativeCapabilities['features'])=>button(action,label,!working&&!demo&&feature(featureName));
      body=group==='scan'?`${Empty('扫描仪表上的配对码','scan')}${PrimaryButton('开始扫码','data-background="tool-scanner"',working||demo||!feature('scanner'))}`:group==='android'?ListGroup('极核 App 登录',tool('official-start','连接','officialLogin')+tool('official-result','读取结果','officialLogin')+tool('official-stop','停止','officialLogin'))+ListGroup('后台常驻模块',tool('keepalive','导出','keepalive')):group==='meter'?ListGroup('',tool('tool-wallpaperZip','导入 ZIP 壁纸','wallpaperZip')+(feature('ota')?tool('tool-ota','仪表升级','ota'):'')):ListGroup('',tool('diagnostics','导出诊断信息','diagnostics')+'<button class="list-row action-row" data-action="export-command-report">导出上次车控结果</button>'+tool('update-check',`检查 App 更新 · ${version}`,'updates'))+(updateAvailable?PrimaryButton('安装新版','data-background="update-install"',working):'');
    }
    const selectedCar=vehicles.find(c=>c.id===selected);
    if(section==='monitor'||section==='history')options.actions.toolbar(RefreshButton('刷新')+(section==='history'?'<button class="icon-button" data-action="page-toolbar" data-page-tool="history-info" aria-label="记录范围">'+icon('info')+'</button>':''),button=>{if(button.dataset.pageTool==='history-info'){options.actions.navigate('/records/battery/info');return;}if(section==='history')void task(loadHistory);else if(feature('background'))void task(async()=>{status=await call('background.status');monitorEnabled=status?.enabled===true;});});
    host.innerHTML=`${section!=='tools'?ListGroup('',ListRow('目标车辆',selectedCar?.label??'—',`data-background="pick-vehicle" data-selected-vehicle="${selected}"`)):''}${body}<p class="form-message" role="status">${escape(message)}</p>`;
  }

  async function loadHistory(append = false) {
    if (!selected || demo) { items = []; total = 0; return; }
    if (useNativeHistory()) {
      const last = append ? items.at(-1) : null, before = last ? (kind === 'charge' ? last.startedAt || last.detectedAt : last.at) : undefined;
      const result = await native.call<{ items: unknown[]; total: number }>('background.history', { vehicleId: selected, kind, limit: 500, ...(before ? { before } : {}) }, controller.signal);
      const received = Array.isArray(result.items) ? result.items.slice(0, 500) : []; items = append ? [...items, ...received].slice(0, 5000) : received; total = result.total ?? items.length;
      if (append && !received.length) total = items.length;
    } else {
      const history = await readLocalHistory(selected), count = append ? items.length + 500 : 500;
      items = kind === 'battery' ? history.samples.slice(-count).reverse() : kind === 'charge' ? history.chargingSessions.slice(-count).reverse() : [];
      total = kind === 'battery' ? history.samples.length : kind === 'charge' ? history.chargingSessions.length : 0;
    }
  }
  async function task(work: () => Promise<void>) { if (working || disposed) return; working = true; message = ''; render(); try { await work(); } catch (error) { message = '加载失败'; } finally { working = false; render(); } }
  async function call(method: NativeMethod, params: object = {}) { return native.call<any>(method, params, controller.signal); }
  function click(event: Event) {
    const element = (event.target as Element).closest<HTMLButtonElement>('button'); if (!element || element.disabled || working) return;
    if (element.dataset.backgroundSection) { section = element.dataset.backgroundSection as typeof section; confirmingClear = false; render(); if (section === 'history') void task(loadHistory); return; }
    const action = element.dataset.background;
    if(action==='history-info'){options.actions.navigate('/records/battery/info');return;}
    if(action==='pick-vehicle'){choose(options.actions,'目标车辆',vehicles.map(c=>[c.id,c.accountLabel+' · '+c.label]),selected,value=>{selected=value;loadDesktop();render();if(section==='history')void task(loadHistory);});return;}
    if(action==='custom-range'){chooseDate(options.actions,'起始日期',startTime,value=>{startTime=value;chooseDate(options.actions,'截止日期',endTime||value,end=>{endTime=end+'T23:59:59';range='custom';render();});});return;}
    if(action==='pick-threshold'){choose(options.actions,'低电提醒',Array.from({length:16},(_,i)=>[String((i+1)*5),(i+1)*5+'%']),String(preferences.lowBatteryThreshold),value=>{preferences.lowBatteryThreshold=Number(value);render();});return;}
    if (!action || demo) return;
    if(action==='toggle-monitor'){monitorEnabled=!monitorEnabled;render();return;}

    if(action==='history-clear'){
      const car=vehicles.find(v=>v.id===selected);options.actions.sheet('清除本机记录',ConfirmSheet('清除本机记录',car?.label??'—',car?.vin.slice(-6)??'—','data-background="history-confirm-clear"','清除当前分类记录'),button=>{if(button.dataset.background==='history-confirm-clear'){options.actions.closeSheet();click({target:button} as unknown as Event);}});return;
    }
    void task(async () => {
      if(action==='save-monitor'){if(monitorEnabled)await authorizeNativeAccounts(native,book);status=await call('background.configure',{enabled:monitorEnabled,...nativeAccounts(book),...preferences});saveBackgroundPreferences(preferences);message='已保存';}
      else if (action.startsWith('history-') && ['battery', 'charge', 'events'].includes(action.slice(8))) { section='history';kind = action.slice(8) as typeof kind; await loadHistory(); }
      else if (action === 'enable') { await authorizeNativeAccounts(native, book); status = await call('background.configure', { enabled: true, ...nativeAccounts(book), ...preferences }); saveBackgroundPreferences(preferences); message = '已更新'; }
      else if (action === 'disable') { status = await call('background.configure', { enabled: false, ...nativeAccounts(book), ...preferences }); message = '已更新'; }
      else if (action === 'status') status = await call('background.status');
      else if (action === 'run') { await authorizeNativeAccounts(native, book); status = await call('background.run', { vehicleId: selected }); message = '已更新'; }
      else if (action === 'history-clear') confirmingClear = true;
      else if (action === 'history-cancel-clear') confirmingClear = false;
      else if (action === 'history-confirm-clear') { if (useNativeHistory()) await call('history.clear', { vehicleId: selected, kind, confirmed: true }); else await clearLocalHistory(selected, kind); confirmingClear = false; await loadHistory(); message = '已清除'; }
      else if (action === 'history-export') download(historyCsv(filteredItems(), kind), `geometry-${kind}-history.csv`, 'text/csv;charset=utf-8');
      else if (action === 'history-more') await loadHistory(true);
      else if (action === 'widget-save') { await authorizeNativeAccounts(native, book); await call('widget.configure', { vehicleId: selected, style, controls }); saveDesktop(); message = '已更新'; }
      else if (action === 'widget-pin') { await call('widget.pin', { style }); message = '已更新'; }
      else if (action === 'shortcuts') { await authorizeNativeAccounts(native, book); await call('shortcuts.configure', { vehicleId: selected, actions: ['refresh', 'unlock', 'lock', 'horn', 'seat'] }); message = '已更新'; }
      else if (action === 'widget-reset') { controls = false; await authorizeNativeAccounts(native, book); await call('widget.configure', { vehicleId: selected, style, controls }); saveDesktop(); message = '已更新'; }
      else if (action.startsWith('tool-')) await call('tools.open', { tool: action.slice(5) });
      else if (action === 'diagnostics') { await call('diagnostics.export'); message = '已导出'; }
      else if (action === 'update-check') { const result = await call('updates.check'); updateAvailable=result.available||result.updateAvailable;message=updateAvailable?'新版本已就绪':'已是最新版本'; }
      else if (action === 'update-install') await call('updates.install');
      else if (action === 'keepalive') await call('keepalive.export');
      else if (action === 'official-start') await call('officialLogin.start');
      else if (action === 'official-stop') await call('officialLogin.stop');
      else if (action === 'official-result') {
        const result = await call('officialLogin.result', { importToPanel: true });
        if (result.imported && result.session && options.onImported) await options.onImported(result.session);
        else message = result.imported || result.accountId ? '已连接' : '未连接';
      }
    });
  }
  function change(event: Event) {
    const input = event.target as HTMLInputElement;
    if(demo)return;
    if(input.dataset.historyKind){kind=input.dataset.historyKind as typeof kind;void task(loadHistory);return;}
    if (input.dataset.backgroundNotification && input.dataset.backgroundNotification in preferences.notifications) preferences.notifications[input.dataset.backgroundNotification as keyof BackgroundNotifications] = input.checked;
    if ('backgroundThreshold' in input.dataset) preferences.lowBatteryThreshold = Math.max(5, Math.min(80, Math.round(Number(input.value)) || 20));
    if ('backgroundVehicle' in input.dataset) { selected = input.value; loadDesktop(); render(); if (section === 'history') void task(loadHistory); }
    if ('backgroundStyle' in input.dataset) { style = input.value; render(); }
    if ('backgroundControls' in input.dataset) { controls = input.checked; render(); }
    if ('historyRange' in input.dataset) { range = input.value; startTime = endTime = ''; render(); }
    if ('historyFrom' in input.dataset) { startTime = input.value; render(); }
    if ('historyUntil' in input.dataset) { endTime = input.value; render(); }
  }
  host.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLElement>('[data-history-period],[data-widget-size]');if(b&&!working){if(b.dataset.historyPeriod)range=b.dataset.historyPeriod;if(b.dataset.widgetSize)style=b.dataset.widgetSize;render();}});
  host.addEventListener('click', event=>{const button=(event.target as Element).closest<HTMLElement>('[data-history-kind]');if(button&&!working){kind=button.dataset.historyKind as typeof kind;void task(loadHistory);}});
  host.addEventListener('click', click); host.addEventListener('change', change); loadDesktop(); render();
  if (!demo) void task(async () => { if(native.available){caps=await call('capabilities');if(feature('background'))status=await call('background.status');monitorEnabled=status?.enabled===true;}if(section==='history')await loadHistory(); });
  return () => { disposed = true; controller.abort(); host.removeEventListener('click', click); host.removeEventListener('change', change); };
}
function download(value: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([value], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function batteryChart(items: any[]) {
  const ordered = [...items].filter(item => typeof item.at === 'number' && typeof item.soc === 'number' && item.soc >= 0 && item.soc <= 100).sort((a, b) => a.at - b.at);
  if (ordered.length < 2) return Empty('数据不足','bolt');
  const start = ordered[0].at, end = ordered.at(-1).at;
  const path = ordered.map((item, index) => `${index === 0 || item.at - ordered[index - 1].at > 300000 ? 'M' : 'L'}${(20 + (item.at - start) / Math.max(1, end - start) * 280).toFixed(2)},${(110 - item.soc).toFixed(2)}`).join(' ');
  const gaps = ordered.slice(1).flatMap((item, index) => {
    const previous=ordered[index]; if(item.at-previous.at<=300000)return [];
    const left=20+(previous.at-start)/Math.max(1,end-start)*280,right=20+(item.at-start)/Math.max(1,end-start)*280;
    return [`<path d="M${left.toFixed(2)},${110-previous.soc}L${right.toFixed(2)},${110-item.soc}" fill="none" stroke="currentColor" stroke-dasharray="4 4" opacity=".5"/>${right-left>40?`<text x="${((left+right)/2).toFixed(2)}" y="130" text-anchor="middle">无数据</text>`:''}`];
  }).join('');
  return `<svg class="history-chart" viewBox="0 0 320 140" role="img" aria-label="本机电量变化曲线"><path d="M20,10V110H300" fill="none" stroke="currentColor" opacity=".25"/>${gaps}<path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/><text x="0" y="12">100%</text><text x="4" y="110">0%</text></svg>`;
}
