import { nativeAccounts, type AccountBook } from '../core/accounts';
import { authorizeNativeAccounts, nativeAccountsAuthorized, readBackgroundPreferences, saveBackgroundPreferences, type BackgroundNotifications } from '../core/background';
import { clearLocalHistory, readLocalHistory } from '../core/history-store';
import { historyCsv } from '../core/history';
import { nativeMessage, type NativeCapabilities, type NativeClient, type NativeMethod } from '../core/native';
import { storagePrefix } from '../core/scope';
import { demoVehicle, type Snapshot } from '../core/model';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString('zh-CN') : '未知';
const number = (value: unknown, unit = '') => typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(2))}${unit}` : '—';
const labels: Record<keyof BackgroundNotifications, string> = { chargeStart: '充电开始', chargeProgress: '充电进度', chargeFull: '充满', chargeStop: '充电中止', message: '车辆消息', lowBattery: '低电量', offline: '车辆离线', tire: '胎压异常' };
export function mountBackground(host: HTMLElement, options: { native: NativeClient; book: AccountBook; demo: boolean; snapshot?: Snapshot | null; onUncertain?(): void; onImported?(session: unknown): Promise<void> }) {
  const { native, book, demo } = options, controller = new AbortController();
  let disposed = false, working = false, message = '', section: 'monitor' | 'history' | 'desktop' | 'tools' = 'monitor';
  let caps: NativeCapabilities | null = null, status: any = null, kind: 'battery' | 'charge' | 'events' = 'battery', items: any[] = [], total = 0, confirmingClear = false;
  let selected = book.selectedVehicleId ?? '', style = '2x2', controls = false;
  let range = '24h', startTime = '', endTime = '';
  const preferences = readBackgroundPreferences();
  const vehicles = demo ? [{ id: 'demo-vehicle', vin: demoVehicle.vin, label: demoVehicle.name, accountLabel: '演示' }]
    : book.accounts.flatMap(account => account.vehicles.map(car => ({ ...car, accountLabel: account.label })));
  if (!vehicles.some(car => car.id === selected)) selected = vehicles[0]?.id ?? '';
  const feature = (name: keyof NativeCapabilities['features']) => native.available && caps?.features[name] === true;
  const enabled = () => !demo && !working && Boolean(selected);
  const useNativeHistory = () => feature('history') && nativeAccountsAuthorized();
  const button = (action: string, label: string, allowed = enabled()) => `<button class="control-button" data-background="${action}" ${allowed ? '' : 'disabled'}>${label}</button>`;
  const desktopKey = `${storagePrefix}desktop-preferences`;
  function loadDesktop() {
    style = '2x2'; controls = false;
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
    return `<section class="settings-card" aria-label="组件内容预览"><p>${escape(car?.label ?? '未选车辆')} · ${escape(style)}</p><p>电量 ${number(snapshot?.soc, '%')} · 续航 ${number(snapshot?.range, ' km')} · 电压 ${number(snapshot?.voltage, ' V')}</p><p>读取时间：${escape(time(snapshot?.receivedAt))}</p><p>${controls ? '车控入口：刷新、开锁、关锁、鸣笛、座桶；实际可见项按尺寸与系统显示。' : '只显示车况摘要。'}</p></section>`;
  }
  function filteredItems() {
    const from = startTime ? new Date(startTime).getTime() : range === 'all' ? 0 : Date.now() - ({ '24h': 1, '7d': 7, '30d': 30, '90d': 90 }[range] ?? 1) * 86400000;
    const until = endTime ? new Date(endTime).getTime() : Number.MAX_SAFE_INTEGER;
    return items.filter(item => { const at = kind === 'charge' ? item.startedAt || item.detectedAt : item.at; return typeof at === 'number' && at >= from && at <= until; });
  }
  function rangeSummary(visible: any[]) {
    const samples = visible.filter(item => typeof item.soc === 'number' && Number.isFinite(item.soc) && item.soc >= 0 && item.soc <= 100).sort((a, b) => a.at - b.at);
    if (kind !== 'battery' || !samples.length) return '';
    const values = samples.map(item => item.soc), change = values.at(-1)! - values[0];
    return `<p>此时段已载入的电量：最低 ${number(Math.min(...values), '%')}，最高 ${number(Math.max(...values), '%')}；首末变化 ${change > 0 ? '+' : ''}${number(change, ' 个百分点')}。缺测期间不估算耗电。</p>`;
  }
  function historyBody() {
    const visible = filteredItems();
    const rows = visible.map(item => kind === 'battery' ? `<tr><td>${escape(time(item.at))}</td><td>${number(item.soc, '%')}</td><td>${number(item.voltage, 'V')}</td><td>${number(item.current, 'A')}</td><td>${number(item.power, 'W')}</td></tr>`
      : kind === 'charge' ? `<tr><td>${escape(time(item.startedAt))}</td><td>${item.endedAt ? escape(time(item.endedAt)) : '尚未记录结束'}</td><td>${number(item.startSoc, '%')} → ${number(item.endSoc, '%')}</td><td>${escape(({ charging: '充电中', full: '已充满', interrupted: '已中止', unknown: '结束状态未知' } as Record<string, string>)[item.status] ?? '未知')}</td></tr>`
        : `<tr><td>${escape(time(item.at))}</td><td>${escape(item.title || item.kind)}</td><td>${escape(item.body)}</td></tr>`).join('');
    return `<div class="module-links">${(['battery', 'charge', 'events'] as const).map((value, index) => button(`history-${value}`, ['电池变化', '充电记录', '提醒记录'][index])).join('')}</div><p>${useNativeHistory() ? '安装包本机历史' : '浏览器本机历史：仅记录本入口打开时取得的车况，不能恢复关闭期间的数据。'}</p>${kind === 'events' && !useNativeHistory() ? '<p>浏览器没有原生后台提醒记录。</p>' : `<label>历史时段<select data-history-range>${[["24h","最近24小时"],["7d","最近7天"],["30d","最近30天"],["90d","最近90天"],["all","全部本机记录"]].map(([value,label]) => `<option value="${value}" ${range === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>起始时间<input data-history-from type="datetime-local" value="${escape(startTime)}"></label><label>截止时间<input data-history-until type="datetime-local" value="${escape(endTime)}"></label><p>共存储 ${total} 条，已载入 ${items.length} 条，时段内 ${visible.length} 条。充电记录从观测时开始，缺测不等于已充满。</p>${rangeSummary(visible)}<div class="history-table"><table><thead><tr>${(kind === 'battery' ? ['读取时间', '电量', '电压', '电流', '功率'] : kind === 'charge' ? ['开始观测', '结束观测', '电量', '状态'] : ['时间', '类型', '内容']).map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${!visible.length ? '<p>所选时段暂无已载入的记录；可调整时段或载入更早记录。</p>' : ''}${kind === 'battery' ? batteryChart(visible) : ''}`}<div class="module-links">${button('history-more', '载入更早记录', enabled() && items.length < total && items.length < 5000)}${button('history-export', '导出当前时段 CSV', enabled() && visible.length > 0)}${button('history-clear', '清除此类本机记录')}</div>${confirmingClear ? `<p>只清除此车辆在当前入口的本机记录，不删除官方云端骑行数据。</p>${button('history-confirm-clear', '确认清除')}${button('history-cancel-clear', '取消')}` : ''}`;
  }
  function render() {
    if (disposed) return;
    const mode = status?.backgroundMode === 'opportunistic' ? '由 iOS 按系统机会安排，不能保证时间或持续运行。' : status?.backgroundMode === 'foreground-service' ? 'Android 前台服务与系统任务共同读取，系统限制可能造成延迟。' : '当前仅能在前台读取。';
    let body = '';
    if (section === 'monitor') body = feature('background') ? `<p>当前监控：${status?.enabled ? '已启用' : '未启用'}。${mode}</p><p>最近运行：${escape(time(status?.lastRun))}</p><p>开启后，将已保存账号的必要凭据交给本机原生加密库，用于离开网页后的读取；不会上传到我们的服务器。</p><fieldset><legend>提醒分类</legend>${(Object.keys(labels) as (keyof BackgroundNotifications)[]).map(key => `<label class="checkbox-row"><input type="checkbox" data-background-notification="${key}" ${preferences.notifications[key] ? 'checked' : ''} ${working || demo ? 'disabled' : ''}>${labels[key]}</label>`).join('')}</fieldset><label>低电量阈值（%）<input data-background-threshold type="number" min="5" max="80" value="${preferences.lowBatteryThreshold}" ${working || demo ? 'disabled' : ''}></label><div class="module-links">${button('enable', '保存并开启监控')}${button('disable', '停止后台监控', !demo && !working)}${button('run', '现在读取一次')}${button('status', '刷新运行状态', !working && !demo)}</div>`
      : '<p>持续监控需要更新后的 APK 或自签 IPA。Safari 可以使用云端功能并积累打开期间的记录，关闭后无法继续轮询。iOS 原生后台也受系统调度限制。</p>';
    if (section === 'history') body = historyBody();
    if (section === 'desktop') body = `<p>桌面入口固定绑定所选账号和车辆；账号删除或凭据变更后，旧入口需要重新配置。iOS 具体操作按系统意图与前台确认执行；多个iOS组件共用一个配置。</p>${desktopPreview()}<label>组件尺寸<select data-background-style>${['1x1', '2x2', '4x2', '4x4'].map(value => `<option ${style === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label class="checkbox-row"><input type="checkbox" data-background-controls ${controls ? 'checked' : ''}>允许组件提供车辆操作入口</label><div class="module-links">${button('widget-save', '配置组件', enabled() && feature('widget'))}${button('widget-reset', '此尺寸恢复只读配置', enabled() && feature('widget'))}${button('widget-pin', '添加到桌面', enabled() && feature('widget'))}${button('shortcuts', '创建系统快捷指令', enabled() && feature('shortcuts'))}</div>`;
    if (section === 'tools') body = `<p>敏感操作将在原生页面中选择文件、核对目标并确认。仪表升级仅面向原版已支持的 AE5I 5 寸 Gemini，不能用于其它仪表。</p><div class="module-links">${button('tool-scanner', '扫码工具', !working && !demo && feature('scanner'))}${button('tool-ota', 'Gemini 仪表升级', !working && !demo && feature('ota'))}${button('tool-wallpaperZip', '本地 ZIP 壁纸', enabled() && feature('wallpaperZip'))}${button('diagnostics', '导出本机诊断', !working && !demo && feature('diagnostics'))}${button('update-check', '检查安装包更新', !working && !demo && feature('updates'))}${button('update-install', '安装已核对的新版', !working && !demo && feature('updates'))}${button('keepalive', '导出 Android 保活模块', !working && !demo && feature('keepalive'))}${button('official-start', '从官方应用连接账号', !working && !demo && feature('officialLogin'))}${button('official-stop', '停止官方登录连接', !working && !demo && feature('officialLogin'))}${button('official-result', '查看官方登录连接结果', !working && !demo && feature('officialLogin'))}</div><p>Root 保活与 VPN 登录连接属于 Android 专项；不会自动开启 VPN、安装模块或改变手机权限。</p>`;
    host.innerHTML = `${demo ? '<p>演示模式：后台、桌面操作和系统工具均停用，不产生真实记录。</p>' : ''}<nav class="module-links" aria-label="后台与工具">${(['monitor', 'history', 'desktop', 'tools'] as const).map((value, i) => `<button class="text-button" data-background-section="${value}" aria-pressed="${section === value}" ${working ? 'disabled' : ''}>${['监控与提醒', '充电与电池历史', '桌面控制', '系统工具'][i]}</button>`).join('')}</nav><label>目标车辆<select data-background-vehicle ${working ? 'disabled' : ''}>${vehicles.map(car => `<option value="${escape(car.id)}" ${selected === car.id ? 'selected' : ''}>${escape(car.accountLabel)} · ${escape(car.label)}</option>`).join('')}</select></label>${body}<p class="form-message" role="status">${escape(message)}</p>`;
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
  async function task(work: () => Promise<void>) { if (working || disposed) return; working = true; message = ''; render(); try { await work(); } catch (error) { message = native.available ? nativeMessage(error) : '本机历史读取或保存未完成，请重试。'; } finally { working = false; render(); } }
  async function call(method: NativeMethod, params: object = {}) { return native.call<any>(method, params, controller.signal); }
  function click(event: Event) {
    const element = (event.target as Element).closest<HTMLButtonElement>('button'); if (!element || element.disabled || working) return;
    if (element.dataset.backgroundSection) { section = element.dataset.backgroundSection as typeof section; confirmingClear = false; render(); if (section === 'history') void task(loadHistory); return; }
    const action = element.dataset.background; if (!action || demo) return;
    void task(async () => {
      if (action.startsWith('history-') && ['battery', 'charge', 'events'].includes(action.slice(8))) { kind = action.slice(8) as typeof kind; await loadHistory(); }
      else if (action === 'enable') { await authorizeNativeAccounts(native, book); status = await call('background.configure', { enabled: true, ...nativeAccounts(book), ...preferences }); saveBackgroundPreferences(preferences); message = '已保存监控配置，实际运行状态以系统返回和最近读取时间为准。'; }
      else if (action === 'disable') { status = await call('background.configure', { enabled: false, ...nativeAccounts(book), ...preferences }); message = '已请求停止后台监控。'; }
      else if (action === 'status') status = await call('background.status');
      else if (action === 'run') { await authorizeNativeAccounts(native, book); status = await call('background.run', { vehicleId: selected }); message = '已请求读取一次；可稍后刷新状态查看完成时间。'; }
      else if (action === 'history-clear') confirmingClear = true;
      else if (action === 'history-cancel-clear') confirmingClear = false;
      else if (action === 'history-confirm-clear') { if (useNativeHistory()) await call('history.clear', { vehicleId: selected, kind, confirmed: true }); else await clearLocalHistory(selected, kind); confirmingClear = false; await loadHistory(); message = '本机记录已清除。'; }
      else if (action === 'history-export') download(historyCsv(filteredItems(), kind), `geometry-${kind}-history.csv`, 'text/csv;charset=utf-8');
      else if (action === 'history-more') await loadHistory(true);
      else if (action === 'widget-save') { await authorizeNativeAccounts(native, book); await call('widget.configure', { vehicleId: selected, style, controls }); saveDesktop(); message = '组件绑定已保存。'; }
      else if (action === 'widget-pin') { await call('widget.pin', { style }); message = '已打开系统添加流程或指引。'; }
      else if (action === 'shortcuts') { await authorizeNativeAccounts(native, book); await call('shortcuts.configure', { vehicleId: selected, actions: ['refresh', 'unlock', 'lock', 'horn', 'seat'] }); message = '已创建系统支持的快捷入口；车辆操作以现场执行为准。'; }
      else if (action === 'widget-reset') { controls = false; await authorizeNativeAccounts(native, book); await call('widget.configure', { vehicleId: selected, style, controls }); saveDesktop(); message = '此尺寸组件已恢复只读车况配置。'; }
      else if (action.startsWith('tool-')) await call('tools.open', { tool: action.slice(5) });
      else if (action === 'diagnostics') { await call('diagnostics.export'); message = '已打开脱敏诊断保存或分享流程。'; }
      else if (action === 'update-check') { const result = await call('updates.check'); message = result.available || result.updateAvailable ? '发现新安装包，可选择安装已核对的新版。' : '更新检查完成；如无可安装候选，请查看下载页。'; }
      else if (action === 'update-install') await call('updates.install');
      else if (action === 'keepalive') await call('keepalive.export');
      else if (action === 'official-start') await call('officialLogin.start');
      else if (action === 'official-stop') await call('officialLogin.stop');
      else if (action === 'official-result') {
        const result = await call('officialLogin.result', { importToPanel: true });
        if (result.imported && result.session && options.onImported) await options.onImported(result.session);
        else message = result.imported || result.accountId ? '账号已存入原生加密库；如需网页使用，请按原生页面确认连接。' : '尚未取得可导入的账号，请按原生页面操作。';
      }
    });
  }
  function change(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.dataset.backgroundNotification && input.dataset.backgroundNotification in preferences.notifications) preferences.notifications[input.dataset.backgroundNotification as keyof BackgroundNotifications] = input.checked;
    if ('backgroundThreshold' in input.dataset) preferences.lowBatteryThreshold = Math.max(5, Math.min(80, Math.round(Number(input.value)) || 20));
    if ('backgroundVehicle' in input.dataset) { selected = input.value; loadDesktop(); render(); if (section === 'history') void task(loadHistory); }
    if ('backgroundStyle' in input.dataset) { style = input.value; render(); }
    if ('backgroundControls' in input.dataset) { controls = input.checked; render(); }
    if ('historyRange' in input.dataset) { range = input.value; startTime = endTime = ''; render(); }
    if ('historyFrom' in input.dataset) { startTime = input.value; render(); }
    if ('historyUntil' in input.dataset) { endTime = input.value; render(); }
  }
  host.addEventListener('click', click); host.addEventListener('change', change); loadDesktop(); render();
  if (native.available) void task(async () => { caps = await call('capabilities'); if (feature('background')) status = await call('background.status'); });
  return () => { disposed = true; controller.abort(); host.removeEventListener('click', click); host.removeEventListener('change', change); };
}
function download(value: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([value], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function batteryChart(items: any[]) {
  const ordered = [...items].filter(item => typeof item.at === 'number' && typeof item.soc === 'number' && item.soc >= 0 && item.soc <= 100).sort((a, b) => a.at - b.at);
  if (ordered.length < 2) return '<p>至少积累两条有效电量记录后显示变化曲线。</p>';
  const start = ordered[0].at, end = ordered.at(-1).at;
  const path = ordered.map((item, index) => `${index === 0 || item.at - ordered[index - 1].at > 300000 ? 'M' : 'L'}${(20 + (item.at - start) / Math.max(1, end - start) * 280).toFixed(2)},${(110 - item.soc).toFixed(2)}`).join(' ');
  return `<svg class="history-chart" viewBox="0 0 320 140" role="img" aria-label="本机电量变化曲线，间隔过长处断开"><path d="M20,10V110H300" fill="none" stroke="currentColor" opacity=".25"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/><text x="0" y="12" font-size="9">100%</text><text x="4" y="110" font-size="9">0%</text></svg>`;
}
