import { changeOnce } from '../core/owner-model';
import { ListGroup,ListRow,Stat,Empty,Segmented,Tag,age,html,PickerSheet,ConfirmSheet,MonthPicker,MonthBars,duration,RefreshButton,CalendarPicker } from './kit';
import type { PageActions } from './pages/actions';
import { ApiError, messageFor } from '../api/client';
import { ExtensionsApi } from '../api/extensions';
import { NativeMaterialsApi } from '../api/native-materials';
import type { Session } from '../core/model';
import { navigationLinks } from '../core/navigation';
import { roadTrack } from '../core/track-map';
import { DAILY_STALE_AFTER_MS, DAILY_FUTURE_TOLERANCE_MS } from '../core/daily-model';
import { chinaDay, rideMonth, rideTracks, tireReadings, vehicleAlerts, vehicleSettings, trackPath, settingDefinitions,
  type RideMonth, type RideTrack, type TireReading, type VehicleAlert, type VehicleSetting } from '../core/extensions-model';

export type Tab = 'ride' | 'tracks' | 'tires' | 'alerts' | 'settings';
const tabs: readonly [Tab, string][] = [['ride', '骑行记录'], ['tracks', '历史轨迹'], ['tires', '胎压'], ['alerts', '车辆告警'], ['settings', '车辆设置']];
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dateLabel=(v:string)=>v.replace(/^20\d{2}[-.](\d{2})[-.](\d{2})/,(_,m,d)=>Number(m)+'月'+Number(d)+'日');
const number = (value: number | null, unit = '') => value === null ? '—' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
const row = (name: string, value: string) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`;

/** Mount inside the parent's dialog. Cleanup aborts work and erases account data. */
export function mountExtensions(host: HTMLElement, options: { session: Session | null; demo: boolean; onExpired: () => void; onUncertain?: () => void; initial?: Tab; day?: string; view?:string; actions: PageActions }): () => void {
  const session = options.session ? { ...options.session, vehicle: { ...options.session.vehicle } } : null;
  const api = new ExtensionsApi(), materials = new NativeMaterialsApi();
  let alive = true, expired = false, writing = false, tab: Tab = options.initial ?? 'ride', busy = false, error = '', note = '';
  let month = chinaDay().slice(0, 7), day = options.day ?? chinaDay(), trackPage = 1, alertPage = 1, generation = 0;
  let request: AbortController | null = null;
  let monthly: RideMonth | null = null;
  let tracks: { tracks: RideTrack[]; receivedCount: number } | null = null;
  let tires: { wheels: TireReading[]; updatedAt: number | null } | null = null;
  let alerts: { alerts: VehicleAlert[]; accountUnread: number | null; receivedCount: number } | null = null;
  let settings: VehicleSetting[] | null = null;
  let confirmation: { setting: VehicleSetting; value: string; label: string } | null = null;
  let messageConfirmation: 'read' | 'delete' | null = null;
  const roadMaps = new Set<number>();
  const disabled = () => busy || expired ? 'disabled' : '';

  function expire() {
    if (expired) return;
    expired = true; busy = false; generation++; request?.abort(); confirmation = null;
    monthly = null; tracks = null; tires = null; alerts = null; settings = null;
    error = '登录已过期'; render(); options.onExpired();
  }

  function pointMap(point: RideTrack['points'][number] | undefined, label: string): string {
    if (!point || options.demo) return '';
    const links = navigationLinks({ longitude: point.longitude, latitude: point.latitude, altitudeM: null, coordinateSystem: 'gcj02', coordinateSystemSource: 'legacy-default', address: null, reportedAt: null, reportState: 'unknown' });
    return links ? `<a class="secondary" href="${escape(links.map)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(label)}</a>` : '';
  }
  function trackDrawing(item: RideTrack, index: number): string {
    const drawing=trackPath(item.points); if(!drawing)return Empty('轨迹不可用','chart');
    const map=roadMaps.has(index)&&!options.demo?roadTrack(item.points):null;
    const start=map?[map.start.x,map.start.y]:drawing.start.split(','),end=map?[map.end.x,map.end.y]:drawing.end.split(',');
    return `<svg class="track-drawing" viewBox="0 0 ${map?'640 360':'320 200'}" role="img" aria-label="${map?'历史轨迹与高德道路底图':'行程轨迹'}">${map?map.tiles.map(tile=>`<image data-road-tile href="${tile.url}" x="${tile.x}" y="${tile.y}" width="256" height="256"/>`).join(''):''}<path d="${map?.path??drawing.path}"/><circle cx="${start[0]}" cy="${start[1]}" r="4"/><circle class="track-end" cx="${end[0]}" cy="${end[1]}" r="5"/></svg>${!map&&!options.demo?`<button class="secondary" data-ext="track-map" data-track-index="${index}">加载道路底图</button>`:''}<p class="muted" data-road-status>${map?'© 高德地图':''}</p><div class="map-actions">${pointMap(item.points[0],'查看起点')}${pointMap(item.points.at(-1),'查看终点')}</div>`;
  }
  let messageTab='vehicle';
  const settingName=(key:string,title:string)=>key==='cloudInductiveEnabled'?'车辆感应钥匙':title.replace('eTCS 牵引力控制','牵引力控制').replace('自定义按键 · 单击','按键单击').replace('电子座垫感应 2.0','座垫感应 2.0');
  function settingRow(item:VehicleSetting) {
    const label=settingName(item.key,item.title);if(!item.writable)return ListRow(label,item.value===null?'—':item.display,'',undefined,true);const binary=item.value!==null&&item.choices?.length===2&&item.choices.every(([v])=>v==='0'||v==='1');
    return `<button class="list-row" data-ext="setting" data-key="${escape(item.key)}" ${busy||options.demo||!item.writable||item.value===null?'disabled':''} ${busy&&writing?'aria-busy="true"':''} ${binary?'role="switch" aria-checked="'+(item.value==='1')+'"':''}><span>${escape(label)}</span>${binary?`<span class="switch ${item.value==='1'?'checked':''}" aria-hidden="true"></span>`:`<span class="row-value">${escape(item.value===null?'—':item.display)}</span>`}</button>`;
  }
  function content():string {
    if(expired)return '';
    if(!session&&!options.demo)return Empty('登录已过期','key');
    if(tab==='ride'&&monthly) {
      const days=monthly.days;
      const mileage=days.some(i=>i.mileageKm!=null)?days.reduce((n,i)=>n+(i.mileageKm??0),0):null;
      const minutes=days.some(i=>i.minutes!=null)?days.reduce((n,i)=>n+(i.minutes??0),0):null;
      const speeds=days.flatMap(i=>i.maxSpeedKmh==null?[]:[i.maxSpeedKmh]);
      const bars=MonthBars(month,days);
      return `<div class="stats-grid">${Stat(mileage,'km','本月里程')}<div class="stat"><strong class="num">${duration(minutes)}</strong><span>本月时长</span></div>${Stat(mileage!=null&&minutes!=null&&minutes>0?mileage/minutes*60:null,'km/h','均速')}${Stat(speeds.length?Math.max(...speeds):null,'km/h','最高速')}</div>${bars}${ListGroup('每日骑行',days.map(item=>`<button class="list-row" data-ext="day-tracks" data-day="${escape(item.day??'')}" ${!item.day||busy?'disabled':''}><span>${escape(dateLabel(item.date)||'时间未知')}</span><span class="row-value num">${escape(number(item.mileageKm,'km'))}</span></button>`).join('')||Empty('本月暂无骑行','chart'))}${ListGroup('',ListRow('累计里程',number(monthly.totalMileageKm,'km'),'',undefined,true))}`;
    }
    if(tab==='tracks'&&tracks)return tracks.tracks.map((item,index)=>`<section class="track-item"><h2>${escape(dateLabel(item.start||item.day)||'时间未知')}</h2>${item.from||item.to?`<p>${escape(item.from||'')} ${item.from&&item.to?'→':''} ${escape(item.to||'')}</p>`:''}<div class="stats-grid">${Stat(item.mileageKm,'km','里程')}<div class="stat"><strong class="num">${duration(item.minutes)}</strong><span>时长</span></div>${Stat(item.maxSpeedKmh,'km/h','最高速')}</div><div class="track-card">${trackDrawing(item,index)}</div></section>`).join('')||Empty('本月暂无骑行','chart');
    if(tab==='tires'&&tires)return `<div class="tire-cards">${tires.wheels.map(item=>`<section class="tire-reading ${item.warningCode&&item.warningCode>0?'danger':''}"><h2>${item.position}</h2><div class="stats-grid">${Stat(item.pressureBar,'bar','胎压')}${Stat(item.temperatureC,'°C','温度')}</div><p>${age(item.reportedAt)}</p>${item.warningCode&&item.warningCode>0?'<p>胎压异常</p>':''}</section>`).join('')||Empty('暂无胎压数据','tire')}</div>`;
    if(tab==='alerts'&&alerts) { if(options.view?.startsWith('message:')){const item=alerts.alerts.find(i=>String(i.id)===options.view!.slice(8));return item?ListGroup('',ListRow('时间',item.time||'时间未知','',undefined,true))+`<p>${escape(item.detail||item.title)}</p>`:Empty('暂无消息','bell');} const visible=alerts.alerts.filter(item=>messageTab==='vehicle'?Boolean(item.vin):!item.vin);
      return `${Segmented([['vehicle','车辆消息'],['account','账号消息']],messageTab,'data-message-tab')}${visible.length?ListGroup('',visible.map((item,index)=>ListRow(item.title,item.time||'时间未知',`data-ext="message" data-message="${index}"`,item.unread?'bell':undefined)).join(''))+ListGroup('',`<button class="list-row danger" data-ext="delete-messages" ${options.demo?'disabled':disabled()}>删除全部</button>`)+(alerts.receivedCount>=20?ListGroup('',ListRow('加载更多','','data-ext="alerts-next"')):''):Empty('暂无消息','bell')}`;
    }
    if(tab==='settings'&&settings) {
      const unsupported=settings.filter(item=>!item.writable&&item.reason==='当前车型不支持'||item.display==='不支持');
      const active=settings.filter(item=>!unsupported.includes(item));
      const group=(item:VehicleSetting)=>/Unit|Format|sound|motoPlay|Button|Speed/.test(item.key)?'仪表':/inductive|Nfc|password|cloudInductive/.test(item.key)?'钥匙':/Endurance|Range|lowPower|Recovery/.test(item.key)?'电量与充电':/radar|cruise|barke|Traction|Brake/.test(item.key)?'驾驶辅助':/Vibration|Shutdown|Parking/.test(item.key)?'安全':'便捷骑行';
      if(options.view==='unsupported')return ListGroup('',unsupported.map(item=>ListRow(settingName(item.key,item.title),'此车型不支持','',undefined,true)).join(''));
      return `<p class="muted vehicle-settings-name">更新于 ${age(settingsAt)}</p>${['便捷骑行','安全','电量与充电','钥匙','驾驶辅助','仪表'].map(name=>{const items=active.filter(item=>group(item)===name);return items.length?ListGroup(name,items.map(settingRow).join('')):'';}).join('')}${unsupported.length?ListGroup('',ListRow(`不支持的功能（${unsupported.length}）`,'','data-action="route" data-value="/vehicle/settings/unsupported"')):''}`;
    }
    return busy?'<span class="skeleton" aria-label="正在加载"></span>':'';
  }
  let settingsAt:number|null=null;
  function render() {
    if(!alive)return;
    options.actions.toolbar(RefreshButton(tab==='ride'?'刷新骑行':tab==='settings'?'刷新设置':tab==='alerts'?'刷新消息':'刷新')+(tab==='alerts'&&alerts?.alerts.length?'<button class="action-row" data-action="page-toolbar" data-page-tool="read-messages">全部标为已读</button>':''),button=>{const a=button.dataset.pageTool;if(a==='refresh')void load();else if(a==='read-messages')clicked({target:button,toolbar:true} as unknown as Event);});
    host.innerHTML=`<div class="extensions">${tab==='ride'?MonthPicker(month):tab==='tracks'?ListGroup('',ListRow('日期',day.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日'),'data-ext="pick-day"')):''}<p class="form-message" role="status" aria-live="polite">${escape(note)}</p>${error?`<p role="alert">${escape(error)}</p>`:''}<div aria-busy="${busy}">${content()}</div></div>`;
    for(const tile of host.querySelectorAll('[data-road-tile]'))tile.addEventListener('error',()=>{const status=tile.closest('.track-item')?.querySelector('[data-road-status]');if(status)status.textContent='底图加载失败';},{once:true});
  }
  function confirmSetting(setting:VehicleSetting,value:string,label:string) {
    if(options.demo||!session||!setting.writable||value===setting.value)return;
    confirmation={setting,value,label};
    options.actions.sheet(settingName(setting.key,setting.title),ConfirmSheet('确认修改',session.vehicle.name,session.vehicle.vin.slice(-6),'data-ext="confirm-setting"',`从 ${setting.display} 改为 ${label}`),button=>{if(button.dataset.ext==='confirm-setting'){options.actions.closeSheet();void write();}});
  }
  function simulated() {
    if (tab === 'ride') monthly = rideMonth({ rideMileageTotal: 1256, rideRecordList: [{ date: `${month.replace('-', '.')}.06`, rideMileage: 12.4, ridingTimeDayUnitMinute: 28, maxSpeed: 39 }] });
    if (tab === 'tracks') tracks = rideTracks([{ historyList: [{ rideId: 'demo-trip', dayTime: day, startTime: `${day} 08:10`, endTime: `${day} 08:38`, rideMileage: 12.4, ridingTimeUnitMinute: 28, maxSpeed: 39, startAddr: JSON.stringify({ name: '起点' }), endAddr: JSON.stringify({ name: '终点' }), trajectory: '120,30&120.002,30.003&120.006,30.003&120.009,30.008' }] }]);
    if (tab === 'tires') tires = tireReadings({ updateTime: Date.now(), realTimeData: [{ sensorPosition: 1, tirePressure: 2.2, tireTemp: 24, warningType: 0, reportTime: Date.now() }, { sensorPosition: 2, tirePressure: 2.3, tireTemp: 25, warningType: 0, reportTime: Date.now() }] });
    if (tab === 'alerts') alerts = vehicleAlerts({ noRead: 1, messageVOList: [{ messageId: 'demo-alert', content: '车辆消息', messageTime: `${day} 09:00`, unread: '0', extra: JSON.stringify({ detail: '演示' }) }] }, '');
    if (tab === 'settings') settings = vehicleSettings([{ functionCode: 'PRECISION_ENDURANCE', isSupport: true }], { precisionEndurance: 1, mileageUnit: 1, temperatureUnit: 1, timeFormat: 2, soundEffectSetting: { soundSize: 60 } });
  }
  async function load() {
    messageConfirmation = null; roadMaps.clear();
    if (!alive || expired) return;
    confirmation = null; error = ''; note = '';
    request?.abort(); request = new AbortController();
    const signal = request.signal, current = ++generation, activeTab = tab;
    if (!session && !options.demo) { render(); return; }
    if (options.demo) { simulated(); render(); return; }





    busy = true; render();
    try {
      const currentRequest = () => alive && !signal.aborted && current === generation;
      if (activeTab === 'ride') { const result = await api.month(session!, month, signal); if (currentRequest()) monthly = result; }
      else if (activeTab === 'tracks') { const result = await api.tracks(session!, day, trackPage, signal); if (currentRequest()) tracks = result; }
      else if (activeTab === 'tires') { const result = await api.tires(session!, signal); if (currentRequest()) tires = result; }
      else if (activeTab === 'alerts') {
        if (!session!.uid) { error = '消息不可用'; return; }
        const result = await api.alerts(session!, alertPage, signal); if (currentRequest()) alerts=alertPage>1&&alerts?{...result,alerts:[...alerts.alerts,...result.alerts]}:result;
      } else { const result = await api.settings(session!, signal); if (currentRequest()) { settings = result; settingsAt = Date.now(); } }
    } catch (failure) {
      if (!alive || signal.aborted || current !== generation) return;
      if (failure instanceof ApiError && failure.kind === 'expired') expire();
      else error = '加载失败';
    } finally { if (alive && current === generation && !signal.aborted) { busy = false; render(); } }
  }
  async function updateMessages() {
    if (!alive || expired || busy || options.demo || !session || !messageConfirmation) return;
    const action = messageConfirmation; messageConfirmation = null; busy = true; writing = true; error = ''; note = ''; render();
    request?.abort(); request = new AbortController(); const signal = request.signal;
    let accepted = false;
    try {
      await api.updateAlerts(session, action, signal); accepted = true;
      if (!alive || signal.aborted) return;
      alertPage = 1; alerts = await api.alerts(session, 1, signal);
      if (!alive || signal.aborted) return;
      note = '已更新';
    } catch (failure) {
      if (!alive || signal.aborted) return;
      if (failure instanceof ApiError && failure.kind === 'expired') expire();
      else error = accepted?'已发送，车辆尚未确认':'修改未生效';
    } finally { writing = false; if (alive && !signal.aborted) { busy = false; render(); } }
  }
  async function write() {
    if (!alive || expired || busy || options.demo || !session || !confirmation?.setting.writable) return;
    const pending = confirmation; confirmation = null; busy = true; writing = true; error = ''; note = ''; render();
    request?.abort(); request = new AbortController(); const signal = request.signal;
    try {
      let confirmed=true;
      note=await changeOnce(async()=>{
        if(pending.setting.key==='cloudInductiveEnabled'){const result=await materials.configureInductive(session,pending.value==='1',signal);confirmed=result.confirmed;}
        else try{await api.writeSetting(session,pending.setting.key,pending.value,signal);}catch(e){if(e instanceof ApiError&&e.kind==='expired')expire();throw e;}
      },async()=>{settings=await api.settings(session,signal);settingsAt=Date.now();return settings;},()=>{
        const actual=settings?.find(item=>item.key===pending.setting.key)?.value;
        return actual==null||!confirmed?null:actual===pending.value;
      },signal);
    } catch (failure) {
      if(!alive||signal.aborted)return;
      if(failure instanceof ApiError&&failure.kind==='expired')expire();else error='已发送，车辆尚未确认';
    } finally {writing=false;if(alive&&!signal.aborted){busy=false;render();}}
  }
  function clicked(event: Event) {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!target || !(event as any).toolbar&&!host.contains(target) || target.hasAttribute('disabled') || busy || expired) return;
    if(target.dataset.messageTab){messageTab=target.dataset.messageTab;render();return;}
    if(target.dataset.monthStep){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(target.dataset.monthStep));month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;void load();return;}
    const action=target.dataset.ext||target.dataset.pageTool;
    if(action==='pick-day'){let chosen=day;const picker=()=>options.actions.sheet('日期',CalendarPicker(chosen),button=>{if(button.dataset.dateValue){day=button.dataset.dateValue;options.actions.closeSheet();options.actions.navigate('/records/rides/'+day);}if(button.dataset.calendarMonth){const d=new Date(chosen+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+Number(button.dataset.calendarMonth));chosen=d.toISOString().slice(0,10);picker();}});picker();return;}
    if(action==='message'){const visible=alerts?.alerts.filter(item=>messageTab==='vehicle'?Boolean(item.vin):!item.vin)||[],item=visible[Number(target.dataset.message)];if(item)options.actions.navigate('/vehicle/messages/'+encodeURIComponent(item.id));return;}

    if(action==='setting') {
      const item=settings?.find(i=>i.key===target.dataset.key);if(!item?.writable||!item.choices||item.value===null||options.demo)return;
      const binary=item.choices.length===2&&item.choices.every(([v])=>v==='0'||v==='1');
      if(binary){const choice=item.choices.find(([v])=>v!==item.value)!;confirmSetting(item,choice[0],choice[1]);}
      else options.actions.sheet(settingName(item.key,item.title),PickerSheet(item.choices.map(([v,l])=>[v,l]),item.value,'setting-value'),button=>{const choice=item.choices?.find(([v])=>v===button.dataset.value);if(button.dataset.action==='setting-value'&&choice)confirmSetting(item,choice[0],choice[1]);});
      return;
    }
    if (action === 'track-map') { const index = Number(target.dataset.trackIndex); if (!options.demo && Number.isInteger(index) && tracks?.tracks[index]) { roadMaps.add(index); render(); } return; }
    if (action === 'read-messages' || action === 'delete-messages') { if (!options.demo && session) {
      const deleting=action==='delete-messages',label=deleting?'删除全部':'全部标为已读';messageConfirmation=deleting?'delete':'read';
      options.actions.sheet(label,ConfirmSheet(label,session.vehicle.name,session.vehicle.vin.slice(-6),'data-ext="confirm-message"','此账号全部车辆'),button=>{if(button.dataset.ext==='confirm-message'){options.actions.closeSheet();void updateMessages();}});
    } return; }
    if (action === 'cancel-message') { messageConfirmation = null; render(); return; }
    if (action === 'confirm-message') { void updateMessages(); return; }
    if (action === 'cancel-setting') { confirmation = null; render(); return; }
    if (action === 'confirm-setting') { void write(); return; }
    if (action === 'day-tracks') { options.actions.navigate('/records/rides/'+target.dataset.day!); return; }
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
    if (value === setting.value) { note = '已更新'; render(); return; }
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
