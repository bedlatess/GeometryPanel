import type { Vehicle, Snapshot } from '../core/model';
import type { Preferences } from '../core/preferences';
import { DAILY_STALE_AFTER_MS } from '../core/daily-model';
import { icon } from './icons';
import { vehicleArt } from './vehicle-art';
import { age, Badge, Card, CircleButton, html, MapCard, number, Stat, Tag } from './kit';
import { Lever, type LeverPhase } from './kit/lever';
import { welcomePage } from './pages/welcome';
export { html } from './kit';
export interface HomeOptions {
  car?: Vehicle; data: Snapshot | null; preferences: Preferences; enabled: boolean;
  locked: boolean; busy: boolean; control: boolean; expired: boolean; online: boolean;
  demo: boolean; lab?: boolean; phase?: 'loading' | 'sending' | 'pending' | 'error' | 'success' | 'unsupported';
  message: string; target?: 'powerOn' | 'powerOff'; multi?: boolean;
}
export function renderHome(o: HomeOptions): string {
  const { car, data: d, preferences: p } = o;
  if (!car) return welcomePage(o.locked);
  const daily = d?.daily;
  const old = !o.online || d?.online === false || !daily?.reportedAt || daily.reportState !== 'fresh' || Date.now() - daily.reportedAt > DAILY_STALE_AFTER_MS;
  const locked = old ? null : daily?.vehicleLocked ?? null;
  const loading = o.phase === 'loading' || !d;
  const phase: LeverPhase = o.phase && !['loading', 'unsupported'].includes(o.phase) ? o.phase as LeverPhase : o.control ? 'sending' : 'idle';
  const supported = daily?.capabilities.networkUnlock !== false && o.phase !== 'unsupported';
  const enabled = (o.enabled || o.demo) && !o.locked && o.online && !o.expired;
  const reason = !o.online ? '网络不可用' : o.expired ? '登录已过期' : !supported ? '此车型不支持' : phase === 'error' ? '未收到车辆响应' : d?.online === false ? '车辆离线' : o.multi ? car.name : '';
  const lockText = locked === null ? '状态未知' : locked ? '已锁车' : '未锁车';
  const charge = d?.charging === '充电中', low = d?.soc != null && d.soc <= 20;
  const shortcuts: [string, Parameters<typeof CircleButton>[1], string, string?][] = [['找车', 'pin', 'route', '/vehicle/location'], ['车况', 'gauge', 'route', '/vehicle/status'], ['车辆设置', 'settings', 'route', '/vehicle/settings'], ['更多', 'more', 'more']];
  return `<div class="home-page ${old ? 'data-old' : ''} ${charge ? 'is-charging' : ''}"><section class="studio-screen" aria-label="车辆"><div class="studio-overview"><div class="home-heading"><button class="vehicle-selector" data-action="vehicle-picker" aria-label="切换车辆"><h1>${html(car.name)}</h1><span aria-hidden="true">⌄</span></button>${o.demo ? Tag('演示') : ''}<div class="home-header-actions"><button class="icon-button ${o.busy && !o.control ? 'spinning' : ''}" data-action="refresh" aria-label="刷新车况" ${o.locked || !o.online || o.expired ? 'disabled' : ''}>${icon('refresh')}${old ? Badge(true) : ''}</button><button class="icon-button" data-action="route" data-value="/vehicle/messages" aria-label="消息">${icon('bell')}</button></div></div><div class="home-readings ${loading ? 'is-loading' : ''}"><strong class="battery-number num">${number(d?.soc)}<small>%</small></strong>${p.range ? `<div class="metric"><span>预计续航</span><strong>${number(d?.range)}<small>${d?.range == null ? '' : 'km'}</small></strong></div>` : ''}${p.voltage ? `<div class="metric voltage"><span>电压</span><strong>${number(d?.voltage)}<small>${d?.voltage == null ? '' : 'V'}</small></strong></div>` : ''}</div><div class="battery-line ${charge ? 'energy' : low ? 'low' : ''}" role="meter" aria-label="电量" aria-valuemin="0" aria-valuemax="100" ${d?.soc == null ? '' : `aria-valuenow="${d.soc}"`}><i style="--level:${d?.soc ?? 0}%"></i></div><button class="home-status" data-action="data-status">${charge ? `<strong class="energy-text">${icon('bolt')}充电中</strong>${daily?.expectedFullText ? `<span>${html(daily.expectedFullText)}</span>` : ''}` : `<strong>${icon(locked === false ? 'unlock' : 'lock')}${lockText}</strong>${d?.online == null ? '' : `<span>${d.online ? '在线' : '离线'}</span>`}<span>${age(daily?.reportedAt)}</span>${low ? '<span class="attention-text">电量低</span>' : ''}`}</button><div class="studio-photo ${old ? 'faded' : ''}">${vehicleArt(car, false, o.demo)}${charge ? '<span class="charge-light"></span>' : ''}${old ? Tag(age(daily?.reportedAt), true) : ''}</div></div><div class="home-actions"><div class="main-controls">${CircleButton('寻车', 'horn', 'horn', undefined, !enabled || daily?.capabilities.search === false)}${Lever(locked, phase, !enabled || !supported || loading, reason, o.target)}${CircleButton('座桶', 'seat', 'vehicle-action', 'seat', !enabled || daily?.capabilities.seatOpen === false)}</div><div class="quick-controls">${shortcuts.map(([label, glyph, action, value]) => CircleButton(label, glyph, action, value, false, true)).join('')}</div></div></section><button class="folded-header" data-action="top"><span><strong>${html(car.name)}</strong><span><b class="num">${number(d?.soc)}%</b> ${lockText}　${age(daily?.reportedAt)}</span></span>${vehicleArt(car, true, o.demo)}</button><section class="home-cards">${MapCard(daily?.location?.address || '查看位置', age(daily?.location?.reportedAt))}<div class="home-card-grid">${Card(`<button class="card-link" data-action="route" data-value="/records/rides"><h2>本月骑行</h2>${Stat(daily?.monthMileageKm, 'km', '')}<span class="muted">${number(daily?.monthRideMinutes, ' 分')}</span></button>`)}${Card(`<button class="card-link" data-action="route" data-value="/records/battery"><h2>电池</h2>${Stat(daily?.healthPercent, '%', '健康度')}<dl class="compact-readings"><div><dt>温度</dt><dd class="num">${number(daily?.temperatureC, ' °C')}</dd></div><div><dt>累计充电</dt><dd class="num">${number(daily?.chargeCount, ' 次')}</dd></div></dl></button>`)}</div>${daily?.totalMileageKm == null ? '' : `<footer class="home-mileage">已骑行 <span class="num">${number(daily.totalMileageKm)} km</span></footer>`}</section></div>`;
}
