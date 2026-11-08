import { ListGroup,ListRow,Stat,Empty,PlatformNote,Segmented,ConfirmSheet,age } from './kit';
import type { PageActions } from './pages/actions';
import { nativeAccounts, type AccountBook } from '../core/accounts';
import { authorizeNativeAccounts, nativeAccountsAuthorized, readBackgroundPreferences, saveBackgroundPreferences, notificationDefaults, type BackgroundNotifications } from '../core/background';
import { clearLocalHistory, readLocalHistory } from '../core/history-store';
import { historyCsv } from '../core/history';
import { nativeMessage, type NativeCapabilities, type NativeClient, type NativeMethod } from '../core/native';
import { storagePrefix } from '../core/scope';
import { demoVehicle, type Snapshot } from '../core/model';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString('zh-CN') : '未知';
const number = (value: unknown, unit = '') => typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(2))}${unit}` : '—';
const labels: Record<keyof BackgroundNotifications, string> = { chargeStart: '充电开始', chargeProgress: '充电进度', chargeFull: '已充满', chargeStop: '充电中止', message: '车辆消息', lowBattery: '电量低', offline: '车辆离线', tire: '胎压异常' };
export function mountBackground(host: HTMLElement, options: { native: NativeClient; book: AccountBook; demo: boolean; snapshot?: Snapshot | null; onUncertain?(): void; onImported?(session: unknown): Promise<void>; initial?: 'monitor' | 'history' | 'desktop' | 'tools'; toolGroup?: 'meter' | 'android' | 'scan' | 'diagnostics'; actions: PageActions }) {
  const { native, book, demo } = options, controller = new AbortController();
  let disposed = false, working = false, message = '', section: 'monitor' | 'history' | 'desktop' | 'tools' = options.initial ?? 'monitor';
  let caps: NativeCapabilities | null = null, status: any = null, kind: 'battery' | 'charge' | 'events' = 'battery', items: any[] = [], total = 0, confirmingClear = false;
  let selected = book.selectedVehicleId ?? '', style = '2x2', controls = false;
  let range = '24h', startTime = '', endTime = '';
  const preferences = demo ? {notifications:{...notificationDefaults},lowBatteryThreshold:20} : readBackgroundPreferences();
  const vehicles = demo ? [{ id: 'demo-vehicle', vin: demoVehicle.vin, label: demoVehicle.name, accountLabel: '演示' }]
    : book.accounts.flatMap(account => account.vehicles.map(car => ({ ...car, accountLabel: account.label })));
  if (!vehicles.some(car => car.id === selected)) selected = vehicles[0]?.id ?? '';
  const feature = (name: keyof NativeCapabilities['features']) => native.available && caps?.features[name] === true;
  const enabled = () => !demo && !working && Boolean(selected);
  const useNativeHistory = () => feature('history') && nativeAccountsAuthorized();
  const button = (action: string, label: string, allowed = enabled()) => `<button class="text-button" data-background="${action}" ${allowed ? '' : 'disabled'}>${label}</button>`;
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
    return `<section class="widget-preview" aria-label="组件内容预览"><strong>${escape(car?.label??'—')}</strong><span class="num">${escape(style)}</span><div class="stats-grid">${Stat(snapshot?.soc,'%','电量')}${Stat(snapshot?.range,'km','续航')}${Stat(snapshot?.voltage,'V','电压')}</div><time>${age(snapshot?.receivedAt)}</time></section>`;
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
    const rows = visible.map(item => kind === 'battery' ? `<tr><td>${escape(time(item.at))}</td><td>${number(item.soc, '%')}</td><td>${number(item.voltage, 'V')}</td><td>${number(item.current, 'A')}</td><td>${number(item.power, 'W')}</td></tr>`
      : kind === 'charge' ? `<tr><td>${escape(time(item.startedAt))}</td><td>${item.endedAt ? escape(time(item.endedAt)) : '尚未记录结束'}</td><td>${number(item.startSoc, '%')} → ${number(item.endSoc, '%')}</td><td>${escape(({ charging: '充电中', full: '已充满', interrupted: '已中止', unknown: '结束状态未知' } as Record<string, string>)[item.status] ?? '未知')}</td></tr>`
        : `<tr><td>${escape(time(item.at))}</td><td>${escape(item.title || item.kind)}</td><td>${escape(item.body)}</td></tr>`).join('');
    return `${Segmented([['battery','电量'],['charge','充电记录'],['events','提醒记录']],kind,'data-history-kind')}<div class="history-filter"><label>历史时段<select data-history-range>${[['24h','24 小时'],['7d','7 天'],['30d','30 天'],['90d','90 天'],['all','全部'],['custom','自定义']].map(([v,l])=>`<option value="${v}" ${range===v?'selected':''}>${l}</option>`).join('')}</select></label>${range==='custom'?`<label>起始时间<input data-history-from type="datetime-local" value="${escape(startTime)}"></label><label>截止时间<input data-history-until type="datetime-local" value="${escape(endTime)}"></label>`:''}</div>${kind==='battery'?batteryChart(visible):''}${rangeSummary(visible)}${visible.length?`<div class="history-table"><table><thead><tr>${(kind==='battery'?['读取时间','电量','电压','电流','功率']:kind==='charge'?['开始','结束','电量','状态']:['时间','类型','内容']).map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`:Empty(kind==='charge'?'暂无充电记录':'无数据','bolt')}<p class="muted num">${visible.length} / ${items.length} / ${total}</p><div class="map-actions">${button('history-more','更早记录',enabled()&&items.length<total&&items.length<5000)}${button('history-export','导出表格',enabled()&&visible.length>0)}${button('history-info','ⓘ',!working)}${button('history-clear','清除本机记录')}</div>`;
  }
  function render() {
    if(disposed)return;
    const unavailable=!native.available||demo;
    let body='';
    if(section==='monitor')body=`${unavailable?PlatformNote():''}<button class="list-row" data-background="${status?.enabled?'disable':'enable'}" role="switch" aria-checked="${status?.enabled===true}" ${!feature('background')||demo||working?'disabled':''}><span>后台提醒</span><span class="switch ${status?.enabled?'checked':''}" aria-hidden="true"></span></button><p class="muted">${age(status?.lastRun)}</p>${ListGroup('提醒分类',(Object.keys(labels) as (keyof BackgroundNotifications)[]).map(key=>`<label class="switch-input"><span>${labels[key]}</span><input type="checkbox" role="switch" data-background-notification="${key}" ${preferences.notifications[key]?'checked':''} ${working||demo?'disabled':''}></label>`).join(''))}<label>低电阈值（%）<input data-background-threshold type="number" min="5" max="80" value="${preferences.lowBatteryThreshold}" ${working||demo?'disabled':''}></label><div class="map-actions">${button('enable','保存并开启',enabled()&&feature('background'))}${button('disable','关闭提醒',!demo&&!working&&feature('background'))}${button('run','读取一次',enabled()&&feature('background'))}${button('status','刷新状态',!demo&&!working&&feature('background'))}</div>${ListGroup('',ListRow('提醒记录','','data-background="history-events"'))}`;
    if(section==='history')body=historyBody();
    if(section==='desktop')body=`${unavailable?PlatformNote():''}${desktopPreview()}<label>组件尺寸<select data-background-style>${['1x1','2x2','4x2','4x4'].map(v=>`<option ${style===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="switch-input"><span>车辆操作入口</span><input type="checkbox" role="switch" data-background-controls ${controls?'checked':''} ${demo?'disabled':''}></label><div class="map-actions">${button('widget-save','保存组件',enabled()&&feature('widget'))}${button('widget-reset','恢复只读',enabled()&&feature('widget'))}${button('widget-pin','添加到桌面',enabled()&&feature('widget'))}${button('shortcuts','创建快捷指令',enabled()&&feature('shortcuts'))}</div>`;
    if(section==='tools'){
      const group=options.toolGroup;
      const tool=(action:string,label:string,featureName:keyof NativeCapabilities['features'])=>button(action,label,!working&&!demo&&feature(featureName));
      body=`${unavailable&&group!=='meter'?PlatformNote():''}${group==='meter'?tool('tool-wallpaperZip','本地 ZIP 壁纸','wallpaperZip')+tool('tool-ota','仪表升级','ota'):group==='scan'?tool('tool-scanner','开始扫码','scanner'):group==='android'?tool('official-start','连接极核 App','officialLogin')+tool('official-stop','停止连接','officialLogin')+tool('official-result','读取连接结果','officialLogin')+tool('keepalive','导出常驻模块','keepalive'):tool('diagnostics','导出本机诊断','diagnostics')+tool('update-check','检查 App 更新','updates')+tool('update-install','安装新版','updates')+'<button class="text-button" data-action="export-command-report">导出车控结果</button>'}`;
    }
    host.innerHTML=`${section!=='tools'?`<label>目标车辆<select data-background-vehicle ${working||demo?'disabled':''}>${vehicles.map(car=>`<option value="${escape(car.id)}" ${selected===car.id?'selected':''}>${escape(car.accountLabel)} · ${escape(car.label)}</option>`).join('')}</select></label>`:''}${body}<p class="form-message" role="status">${escape(message)}</p>`;
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
    if(action==='history-info'){options.actions.sheet('记录范围','<p>网页版仅在打开时记录</p>',()=>{});return;}
    if (!action || demo) return;
    if(action==='history-clear'){
      const car=vehicles.find(v=>v.id===selected);options.actions.sheet('清除本机记录',ConfirmSheet('清除本机记录',car?.label??'—',car?.vin.slice(-6)??'—','data-background="history-confirm-clear"','清除当前分类记录'),button=>{if(button.dataset.background==='history-confirm-clear'){options.actions.closeSheet();click({target:button} as unknown as Event);}});return;
    }
    void task(async () => {
      if (action.startsWith('history-') && ['battery', 'charge', 'events'].includes(action.slice(8))) { section='history';kind = action.slice(8) as typeof kind; await loadHistory(); }
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
      else if (action === 'update-check') { const result = await call('updates.check'); message = result.available || result.updateAvailable ? '新版本已就绪' : '已是最新版本'; }
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
  host.addEventListener('click', event=>{const button=(event.target as Element).closest<HTMLElement>('[data-history-kind]');if(button&&!working){kind=button.dataset.historyKind as typeof kind;void task(loadHistory);}});
  host.addEventListener('click', click); host.addEventListener('change', change); loadDesktop(); render();
  if (!demo) void task(async () => { if(native.available){caps=await call('capabilities');if(feature('background'))status=await call('background.status');}if(section==='history')await loadHistory(); });
  return () => { disposed = true; controller.abort(); host.removeEventListener('click', click); host.removeEventListener('change', change); };
}
function download(value: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([value], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function batteryChart(items: any[]) {
  const ordered = [...items].filter(item => typeof item.at === 'number' && typeof item.soc === 'number' && item.soc >= 0 && item.soc <= 100).sort((a, b) => a.at - b.at);
  if (ordered.length < 2) return Empty('无数据','bolt');
  const start = ordered[0].at, end = ordered.at(-1).at;
  const path = ordered.map((item, index) => `${index === 0 || item.at - ordered[index - 1].at > 300000 ? 'M' : 'L'}${(20 + (item.at - start) / Math.max(1, end - start) * 280).toFixed(2)},${(110 - item.soc).toFixed(2)}`).join(' ');
  const gaps = ordered.slice(1).flatMap((item, index) => {
    const previous=ordered[index]; if(item.at-previous.at<=300000)return [];
    const left=20+(previous.at-start)/Math.max(1,end-start)*280,right=20+(item.at-start)/Math.max(1,end-start)*280;
    return [`<path d="M${left.toFixed(2)},${110-previous.soc}L${right.toFixed(2)},${110-item.soc}" fill="none" stroke="currentColor" stroke-dasharray="4 4" opacity=".5"/>${right-left>40?`<text x="${((left+right)/2).toFixed(2)}" y="130" text-anchor="middle">无数据</text>`:''}`];
  }).join('');
  return `<svg class="history-chart" viewBox="0 0 320 140" role="img" aria-label="本机电量变化曲线"><path d="M20,10V110H300" fill="none" stroke="currentColor" opacity=".25"/>${gaps}<path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/><text x="0" y="12">100%</text><text x="4" y="110">0%</text></svg>`;
}
