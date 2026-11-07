import { ApiError, messageFor } from '../api/client';
import { ExtensionsApi } from '../api/extensions';
import { NativeMaterialsApi } from '../api/native-materials';
import type { Session } from '../core/model';
import { navigationLinks } from '../core/navigation';
import { DAILY_STALE_AFTER_MS, DAILY_FUTURE_TOLERANCE_MS } from '../core/daily-model';
import { chinaDay, rideMonth, rideTracks, tireReadings, vehicleAlerts, vehicleSettings, trackPath, settingDefinitions,
  type RideMonth, type RideTrack, type TireReading, type VehicleAlert, type VehicleSetting } from '../core/extensions-model';

type Tab = 'ride' | 'tracks' | 'tires' | 'alerts' | 'settings';
const tabs: readonly [Tab, string][] = [['ride', '骑行记录'], ['tracks', '历史轨迹'], ['tires', '胎压'], ['alerts', '车辆告警'], ['settings', '车辆设置']];
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number | null, unit = '') => value === null ? '未知' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
const stamp = (value: number | null) => value === null ? '上报时间未知' : `${new Date(value).toLocaleString('zh-CN', { hour12: false })}${Date.now() - value > DAILY_STALE_AFTER_MS ? ' · 数据较早' : value - Date.now() > DAILY_FUTURE_TOLERANCE_MS ? ' · 时间异常' : ''}`;
const row = (name: string, value: string) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`;

/** Mount inside the parent's dialog. Cleanup aborts work and erases account data. */
export function mountExtensions(host: HTMLElement, options: { session: Session | null; demo: boolean; onExpired: () => void; onUncertain?: () => void }): () => void {
  const session = options.session ? { ...options.session, vehicle: { ...options.session.vehicle } } : null;
  const api = new ExtensionsApi(), materials = new NativeMaterialsApi();
  let alive = true, expired = false, writing = false, tab: Tab = 'ride', busy = false, error = '', note = '';
  let month = chinaDay().slice(0, 7), day = chinaDay(), trackPage = 1, alertPage = 1, generation = 0;
  let request: AbortController | null = null;
  let monthly: RideMonth | null = null;
  let tracks: { tracks: RideTrack[]; receivedCount: number } | null = null;
  let tires: { wheels: TireReading[]; updatedAt: number | null } | null = null;
  let alerts: { alerts: VehicleAlert[]; accountUnread: number | null; receivedCount: number } | null = null;
  let settings: VehicleSetting[] | null = null;
  let confirmation: { setting: VehicleSetting; value: string; label: string } | null = null;
  const disabled = () => busy || expired ? 'disabled' : '';

  function expire() {
    if (expired) return;
    expired = true; busy = false; generation++; request?.abort(); confirmation = null;
    monthly = null; tracks = null; tires = null; alerts = null; settings = null;
    error = '登录信息已失效，请重新登录。'; render(); options.onExpired();
  }

  function pointMap(point: RideTrack['points'][number] | undefined, label: string): string {
    if (!point || options.demo) return '';
    const links = navigationLinks({ longitude: point.longitude, latitude: point.latitude, altitudeM: null, coordinateSystem: 'gcj02', coordinateSystemSource: 'legacy-default', address: null, reportedAt: null, reportState: 'unknown' });
    return links ? `<a class="secondary-link" href="${escape(links.map)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(label)}</a>` : '';
  }
  function content(): string {
    if (expired) return '';
    if (!session && !options.demo) return '<p>连接车辆后可查看骑行记录、轨迹、胎压、告警与车辆设置。</p>';
    if (tab === 'ride' && monthly) return `<p>账号返回的累计骑行里程：${escape(number(monthly.totalMileageKm, 'km'))}</p>${monthly.days.length ? monthly.days.map(item => `<section class="settings-card"><h3>${escape(item.date || '日期未知')}</h3><dl class="details-list">${row('里程', number(item.mileageKm, 'km'))}${row('时长', number(item.minutes, '分钟'))}${row('最高速度', number(item.maxSpeedKmh, 'km/h'))}</dl>${item.day ? `<button class="text-button" data-ext="day-tracks" data-day="${escape(item.day)}" ${disabled()}>查看当天轨迹</button>` : ''}</section>`).join('') : '<p>这个月没有返回骑行记录。</p>'}`;
    if (tab === 'tracks' && tracks) return `${tracks.tracks.length ? tracks.tracks.map(item => {
      const drawing = trackPath(item.points);
      const start = drawing?.start.split(',') ?? [], end = drawing?.end.split(',') ?? [];
      return `<details class="settings-card"><summary>${escape(item.start || item.day || '时间未知')} · ${escape(number(item.mileageKm, 'km'))}</summary><p>${escape(item.from || '起点地址未知')} → ${escape(item.to || '终点地址未知')}</p><dl class="details-list">${row('开始', item.start || '未知')}${row('结束', item.end || '未知')}${row('时长', number(item.minutes, '分钟'))}${row('最高速度', number(item.maxSpeedKmh, 'km/h'))}</dl>${drawing ? `<svg viewBox="0 0 320 200" width="100%" role="img" aria-label="本次行程轨迹示意，不含道路底图"><path d="${drawing.path}" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="${start[0]}" cy="${start[1]}" r="4" fill="currentColor"/><circle cx="${end[0]}" cy="${end[1]}" r="5" fill="none" stroke="currentColor" stroke-width="2"/></svg><p class="fine-print">实心圆为起点，空心圆为终点。${item.points.length} 个有效位置点；此图只显示轨迹形状，不含道路底图。缺失路段不补画。</p><div class="map-actions">${pointMap(item.points[0], '在地图查看起点')}${pointMap(item.points[item.points.length - 1], '在地图查看终点')}</div>` : '<p class="fine-print">本次行程没有返回有效轨迹点。</p>'}</details>`;
    }).join('') : '<p>当天没有返回行程。可选择其他日期。</p>'}<div class="map-actions"><button class="text-button" data-ext="tracks-prev" ${busy || trackPage <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${trackPage} 页</span><button class="text-button" data-ext="tracks-next" ${busy || tracks.receivedCount < 20 || trackPage >= 500 ? 'disabled' : ''}>下一页</button></div><p class="fine-print">按旧版约定读取 GCJ-02 轨迹；地图入口由你点击后打开。</p>`;
    if (tab === 'tires' && tires) return `<p class="fine-print">汇总上报：${escape(stamp(tires.updatedAt))}。当前页面读取不代表传感器刚刚上报。</p>${tires.wheels.length ? tires.wheels.map(item => `<section class="settings-card"><h3>${item.position}</h3><dl class="details-list">${row('胎压', number(item.pressureBar, 'bar'))}${row('胎温', number(item.temperatureC, '℃'))}${row('设备告警', item.warningCode === null ? '未知' : item.warningCode > 0 ? `设备报告异常（代码 ${item.warningCode}），请检查轮胎` : '未上报告警')}</dl><p class="fine-print">${escape(stamp(item.reportedAt))}</p></section>`).join('') : '<p>没有返回胎压传感器读数；可能未安装、未绑定或尚未上报。</p>'}<p class="fine-print">这里显示传感器上报，不自行设定安全胎压；请按车辆手册和现场检查判断。</p>`;
    if (tab === 'alerts' && alerts) return `<p>账号未读车辆消息：${escape(number(alerts.accountUnread))}</p><p class="fine-print">仅显示本车及未注明车辆的账号消息；其他车辆的消息不会列在这里。此页为历史消息读取，不能代替即时防盗通知。</p>${alerts.alerts.length ? alerts.alerts.map(item => `<section class="settings-card"><h3>${escape(item.title)}${item.unread === true ? ' · 未读' : ''}</h3><p class="fine-print">${escape(item.time || '时间未知')}${!item.vin ? ' · 未注明车辆的账号消息' : ''}</p>${item.detail ? `<p>${escape(item.detail)}</p>` : ''}${item.address ? `<p>位置：${escape(item.address)}</p>` : ''}</section>`).join('') : '<p>这一页没有本车或未注明车辆的消息。</p>'}<div class="map-actions"><button class="text-button" data-ext="alerts-prev" ${busy || alertPage <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${alertPage} 页</span><button class="text-button" data-ext="alerts-next" ${busy || alerts.receivedCount < 20 || alertPage >= 500 ? 'disabled' : ''}>下一页</button></div>`;
    if (tab === 'settings' && settings) return `<p class="fine-print">只在停车并确认安全后修改。服务器受理与车辆实际生效可能有延迟；网页当前读数仍采用原始接口单位。</p>${settings.length ? settings.map(item => `<form class="settings-card" data-ext-setting="${escape(item.key)}"><h3>${escape(item.title)}</h3><p>当前上报：${escape(item.display)}</p>${item.choices ? `<label>目标设置<select name="value" aria-label="${escape(item.title)}目标设置" ${busy || options.demo || !item.writable ? 'disabled' : ''}><option value="" ${item.value === null ? 'selected' : ''} disabled>请选择</option>${item.choices.map(([value, label]) => `<option value="${escape(value)}" ${value === item.value ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label><button class="text-button" type="submit" ${busy || options.demo || !item.writable ? 'disabled' : ''}>修改${escape(item.title)}</button>` : ''}${item.reason ? `<p class="fine-print">${escape(item.reason)}</p>` : ''}</form>`).join('') : '<p>车辆没有返回可识别的设置项。</p>'}`;
    return '';
  }
  function render() {
    if (!alive) return;
    host.innerHTML = `<div class="extensions"><p class="fine-print">${options.demo ? '演示模式 · 以下全部为合成数据，不能修改车辆设置。' : session ? `当前车辆：${escape(session.vehicle.name)}。数据仅在当前面板中展示。` : '尚未连接车辆。'}</p><nav class="control-grid" aria-label="扩展功能">${tabs.map(([id, name]) => `<button class="control-button" type="button" data-ext-tab="${id}" aria-pressed="${id === tab}" ${disabled()}>${name}</button>`).join('')}</nav>${tab === 'ride' || tab === 'tracks' ? `<form data-ext-filter><label>${tab === 'ride' ? '选择月份' : '选择日期'}<input name="period" type="${tab === 'ride' ? 'month' : 'date'}" required value="${tab === 'ride' ? month : day}" max="${tab === 'ride' ? chinaDay().slice(0, 7) : chinaDay()}" ${disabled()}></label><button class="text-button" ${disabled()}>读取${tab === 'ride' ? '本月记录' : '当天轨迹'}</button></form>` : ''}<button class="text-button" type="button" data-ext="refresh" ${busy || !session && !options.demo ? 'disabled' : ''}>${busy ? '正在读取…' : '刷新当前分类'}</button><div role="status" aria-live="polite">${busy ? '<p>正在处理，请稍候…</p>' : note ? `<p>${escape(note)}</p>` : ''}</div>${error ? `<p role="alert">${escape(error)}</p>` : ''}${confirmation ? `<section class="settings-card" aria-label="确认修改车辆设置"><h3>确认修改</h3><p>车辆：${escape(session?.vehicle.name)}</p><p>将“${escape(confirmation.setting.title)}”从“${escape(confirmation.setting.display)}”改为“${escape(confirmation.label)}”。</p><p>请确认车辆已停稳，修改不会影响当前骑行。保护、制动和钥匙相关设置请谨慎选择。</p><div class="map-actions"><button class="text-button" data-ext="cancel-setting">取消</button><button class="primary" data-ext="confirm-setting">确认发送修改</button></div></section>` : ''}<div aria-busy="${busy}">${content()}</div></div>`;
  }
  function simulated() {
    if (tab === 'ride') monthly = rideMonth({ rideMileageTotal: 1256, rideRecordList: [{ date: `${month.replace('-', '.')}.06`, rideMileage: 12.4, ridingTimeDayUnitMinute: 28, maxSpeed: 39 }] });
    if (tab === 'tracks') tracks = rideTracks([{ historyList: [{ rideId: 'demo-trip', dayTime: day, startTime: `${day} 08:10`, endTime: `${day} 08:38`, rideMileage: 12.4, ridingTimeUnitMinute: 28, maxSpeed: 39, startAddr: JSON.stringify({ name: '合成起点' }), endAddr: JSON.stringify({ name: '合成终点' }), trajectory: '120,30&120.002,30.003&120.006,30.003&120.009,30.008' }] }]);
    if (tab === 'tires') tires = tireReadings({ updateTime: Date.now(), realTimeData: [{ sensorPosition: 1, tirePressure: 2.2, tireTemp: 24, warningType: 0, reportTime: Date.now() }, { sensorPosition: 2, tirePressure: 2.3, tireTemp: 25, warningType: 0, reportTime: Date.now() }] });
    if (tab === 'alerts') alerts = vehicleAlerts({ noRead: 1, messageVOList: [{ messageId: 'demo-alert', content: '合成车辆提醒示例', messageTime: `${day} 09:00`, unread: '0', extra: JSON.stringify({ detail: '这是一条演示消息，不代表真实车辆告警。' }) }] }, '');
    if (tab === 'settings') settings = vehicleSettings([{ functionCode: 'PRECISION_ENDURANCE', isSupport: true }], { precisionEndurance: 1, mileageUnit: 1, temperatureUnit: 1, timeFormat: 2, soundEffectSetting: { soundSize: 60 } });
  }
  async function load() {
    if (!alive || expired) return;
    confirmation = null; error = ''; note = '';
    request?.abort(); request = new AbortController();
    const signal = request.signal, current = ++generation, activeTab = tab;
    if (!session && !options.demo) { render(); return; }
    if (options.demo) { simulated(); render(); return; }
    if (tab === 'ride') monthly = null;
    if (tab === 'tracks') tracks = null;
    if (tab === 'tires') tires = null;
    if (tab === 'alerts') alerts = null;
    if (tab === 'settings') settings = null;
    busy = true; render();
    try {
      const currentRequest = () => alive && !signal.aborted && current === generation;
      if (activeTab === 'ride') { const result = await api.month(session!, month, signal); if (currentRequest()) monthly = result; }
      else if (activeTab === 'tracks') { const result = await api.tracks(session!, day, trackPage, signal); if (currentRequest()) tracks = result; }
      else if (activeTab === 'tires') { const result = await api.tires(session!, signal); if (currentRequest()) tires = result; }
      else if (activeTab === 'alerts') {
        if (!session!.uid) { error = '当前账号没有返回消息读取标识，暂时无法读取告警。'; return; }
        const result = await api.alerts(session!, alertPage, signal); if (currentRequest()) alerts = result;
      } else { const result = await api.settings(session!, signal); if (currentRequest()) settings = result; }
    } catch (failure) {
      if (!alive || signal.aborted || current !== generation) return;
      if (failure instanceof ApiError && failure.kind === 'expired') expire();
      else error = messageFor(failure);
    } finally { if (alive && current === generation && !signal.aborted) { busy = false; render(); } }
  }
  async function write() {
    if (!alive || expired || busy || options.demo || !session || !confirmation?.setting.writable) return;
    const pending = confirmation; confirmation = null; busy = true; writing = true; error = ''; note = ''; render();
    request?.abort(); request = new AbortController(); const signal = request.signal;
    let accepted = false;
    try {
      const inductiveResult = pending.setting.key === 'cloudInductiveEnabled'
        ? await materials.configureInductive(session, pending.value === '1', signal) : null;
      if (!inductiveResult) await api.writeSetting(session, pending.setting.key, pending.value, signal);
      if (!alive || signal.aborted) return;
      accepted = true;
      // Read back instead of pretending an ACK is the new physical setting.
      settings = await api.settings(session, signal);
      note = inductiveResult ? inductiveResult.confirmed && settings.find(item => item.key === 'cloudInductiveEnabled')?.value === pending.value
        ? '云端感应钥匙开关已读后核实。手机感应仍需在原生容器中完成配对与权限设置。'
        : '服务已受理，但云端开关上报尚未确认；未自动重发，可稍后刷新。'
        : '服务已受理修改，并重新读取设置。请以车辆实际状态为准。';
    } catch (failure) {
      if (!alive || signal.aborted) return;
      if (failure instanceof ApiError && failure.kind === 'expired') expire();
      else error = accepted ? `服务已受理修改，但重新读取失败。${messageFor(failure)} 可刷新设置核对。` : `${messageFor(failure)} 结果可能未确认，未自动重发；可刷新设置核对。`;
    } finally { writing = false; if (alive && !signal.aborted) { busy = false; render(); } }
  }
  function clicked(event: Event) {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!target || !host.contains(target) || target.hasAttribute('disabled') || busy || expired) return;
    const next = target.dataset.extTab;
    if (next && tabs.some(([id]) => id === next)) { tab = next as Tab; void load(); return; }
    const action = target.dataset.ext;
    if (action === 'cancel-setting') { confirmation = null; render(); return; }
    if (action === 'confirm-setting') { void write(); return; }
    if (action === 'day-tracks') { day = target.dataset.day!; tab = 'tracks'; trackPage = 1; }
    else if (action === 'tracks-prev') trackPage--;
    else if (action === 'tracks-next') trackPage++;
    else if (action === 'alerts-prev') alertPage--;
    else if (action === 'alerts-next') alertPage++;
    else if (action !== 'refresh') return;
    void load();
  }
  function submitted(event: Event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !host.contains(form)) return;
    event.preventDefault();
    if (busy || expired) return;
    const values = new FormData(form);
    if (form.hasAttribute('data-ext-filter')) {
      const period = String(values.get('period') ?? '');
      if (tab === 'ride') month = period; else { day = period; trackPage = 1; }
      void load(); return;
    }
    if (!form.dataset.extSetting || options.demo || !session) return;
    const setting = settings?.find(item => item.key === form.dataset.extSetting), value = String(values.get('value') ?? '');
    const label = setting?.choices?.find(([id]) => id === value)?.[1];
    if (!setting?.writable || !label || setting.key !== 'cloudInductiveEnabled' && !settingDefinitions.some(item => item.key === setting.key)) return;
    if (value === setting.value) { note = '目标与当前上报相同，无需修改。'; render(); return; }
    confirmation = { setting, value, label }; error = ''; note = ''; render();
    host.querySelector<HTMLElement>('[data-ext="confirm-setting"]')?.focus();
  }
  host.addEventListener('click', clicked); host.addEventListener('submit', submitted);
  render(); void load();
  return () => {
    const uncertain = alive && writing;
    alive = false; writing = false; generation++; request?.abort();
    host.removeEventListener('click', clicked); host.removeEventListener('submit', submitted); host.replaceChildren();
    if (uncertain) options.onUncertain?.();
  };
}
