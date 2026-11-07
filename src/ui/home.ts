import type { Vehicle, Snapshot } from '../core/model';
import type { Preferences } from '../core/preferences';
import { DAILY_STALE_AFTER_MS } from '../core/daily-model';
import { icon } from './icons';
import { vehicleArt } from './vehicle-art';

export const html = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const number = (value: number | null | undefined) => value == null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
const time = (value?: number | null) => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '时间未知';
export interface HomeOptions {
  car?: Vehicle; data: Snapshot | null; preferences: Preferences; enabled: boolean;
  locked: boolean; busy: boolean; control: boolean; expired: boolean; online: boolean;
  demo: boolean; lab?: boolean; phase?: 'loading' | 'sending' | 'pending' | 'error' | 'success' | 'unsupported';
  message: string;
}
export function renderHome(o: HomeOptions): string {
  const { car, data: d, lab, demo, preferences: p } = o;
  const reportState = d?.daily.reportState === 'fresh' && d.daily.reportedAt != null && Date.now() - d.daily.reportedAt > DAILY_STALE_AFTER_MS ? 'stale' : d?.daily.reportState;
  const old = reportState !== 'fresh', low = d?.soc != null && d.soc <= 20;
  const net = o.online ? '手机联网' : '手机离线';
  const cloud = o.busy && !o.control ? '正在读取' : d ? `读取 ${time(d.receivedAt)}` : '等待读取';
  const online = !d ? '等待车况' : d.online == null ? '车辆状态未知' : old ? `曾报${d.online ? '在线' : '离线'}` : `车辆${d.online ? '在线' : '离线'}`;
  const lockKnown = reportState === 'fresh' ? d?.daily.vehicleLocked ?? null : null;
  const state = lockKnown == null ? '锁定状态未知' : lockKnown ? '车辆已锁定' : '车辆未锁定';
  const canLock = o.enabled && d?.daily.capabilities.networkUnlock !== false;
  const mainAction = !car ? 'connect' : 'vehicle-action';
  const action = lockKnown === false ? 'powerOff' : 'powerOn';
  const mainName = mainAction === 'connect' ? '连接我的极核' : action === 'powerOff' ? '关机锁车' : '上电开锁';
  const phase = o.phase ?? (o.control ? 'sending' : o.busy ? 'loading' : undefined);
  const isBusy = phase === 'sending';
  const actionAttrs = (real: string, value = '') => `data-action="${lab ? 'lab-action' : real}" data-value="${value}"`;
  const shortcut = p.shortcut;
  const shortcutName = shortcut === 'horn' ? '鸣笛寻车' : shortcut === 'seat' ? '打开座桶' : '日常用车';
  const secondaryName = shortcut === 'seat' ? '鸣笛寻车' : '打开座桶';
  const shortcutAllowed = shortcut === 'daily' ? !o.locked : o.enabled && (shortcut !== 'seat' || d?.daily.capabilities.seatOpen !== false);
  const secondaryAllowed = o.enabled && (shortcut === 'seat' || d?.daily.capabilities.seatOpen !== false);
  const staleLabel = !d ? '连接后读取车辆上报' : reportState === 'future' ? '车辆上报时间异常' : reportState === 'stale' ? `车辆上报较早 · ${time(d.daily.reportedAt)}` : reportState === 'unknown' ? '车辆上报时间未知' : `车辆上报 ${time(d.daily.reportedAt)}`;
  return `<div class="home-layout">
    <div class="home-overview">
      <div class="page-heading"><div class="vehicle-title"><span class="eyebrow">我的车库</span><h1 title="${html(car?.name ?? '几何面板')}">${html(car?.name ?? '几何面板')}</h1></div>
        <button class="round-button" ${actionAttrs(car && !demo ? 'refresh' : 'connect', 'refresh')} aria-label="${car && !demo ? '刷新车况' : '连接车辆'}" ${o.locked || !o.online ? 'disabled' : ''}>${icon('refresh')}</button></div>
      <div class="identity-line"><p class="subheading">${demo ? '演示车辆 · 当前显示示例数据' : car ? `${html(car.type || '极核电动车')} · 尾号 ${html(car.vin.slice(-6))}` : '你的车况与控制，尽在掌握。'}</p>
        ${car ? `<button class="text-button vehicle-details" ${actionAttrs('vehicle-info', 'identity')} aria-label="查看完整车辆信息">${icon('arrow')}</button>` : ''}</div>
      <div class="connection-strip" aria-label="连接与读取状态"><span>${icon('network')}${net}</span><span>${icon('cloud')}${cloud}</span><span class="status ${d?.online && !old ? 'online' : ''}">${online}</span></div>
      <section class="battery-card ${low ? 'is-low' : ''} ${phase === 'loading' ? 'is-loading' : ''}" aria-label="车辆电量" aria-busy="${phase === 'loading'}">
        <div class="battery-top"><span>${low ? '低电量 · 建议充电' : '剩余电量'}</span><span class="charge-label">${d?.charging === '充电中' ? icon('bolt') : ''}${html(d?.charging ?? '等待首次读取')}</span></div>
        <div class="hero-body"><div class="battery-number">${number(d?.soc)}<span>%</span></div><div class="vehicle-visual">${vehicleArt()}</div></div>
        <div class="battery-bars" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${d?.soc != null && i < Math.ceil(d.soc / 5) ? 'filled' : ''}"></i>`).join('')}</div>
        <div class="battery-bottom"><span>${html(staleLabel)}</span><span>结构示意 · 非车型渲染</span></div>
        <div class="metrics">${p.range ? `<section class="metric"><span>预计续航</span><strong>${number(d?.range)}<small>km</small></strong></section>` : ''}${p.voltage ? `<section class="metric"><span>电池电压</span><strong>${number(d?.voltage)}<small>V</small></strong></section>` : ''}</div>
      </section>
    </div>
    <div class="home-interaction">
      <section class="home-controls" aria-label="车辆控制"><div class="section-heading"><h2>${state}</h2><span>云端车控</span></div>
        <button class="primary-control" aria-label="${isBusy ? '正在发送指令' : mainName}" ${actionAttrs(mainAction, mainAction === 'connect' ? 'connect' : action)} ${mainAction === 'connect' ? o.locked || !o.online ? 'disabled' : '' : canLock ? '' : 'disabled'}>
          <span class="control-emblem">${icon(action === 'powerOn' ? 'unlock' : 'lock')}</span><span><strong>${isBusy ? '正在发送指令…' : mainName}</strong><small>${mainAction === 'connect' ? '使用极核账号安全登录' : action === 'powerOn' ? '车辆上电 · 确认后发送' : '车辆关机 · 确认后发送'}</small></span>${icon('arrow')}</button>
        ${car ? `<button class="text-button alternate-control" ${actionAttrs('vehicle-action', action === 'powerOn' ? 'powerOff' : 'powerOn')} ${canLock ? '' : 'disabled'}>${icon(action === 'powerOn' ? 'lock' : 'unlock')}${action === 'powerOn' ? '关机锁车' : '上电开锁'}</button>` : ''}
        ${d?.daily.capabilities.networkUnlock === false ? '<p class="fine-print">当前车辆未提供云开关锁能力。</p>' : ''}
        <p class="control-explanation">${demo ? '演示数据，不会向车辆发送指令。' : '提交指令后，请确认车辆实际状态。'}</p>
      </section>
      <section class="section quick-section"><div class="section-heading"><h2>快捷操作</h2><span>就手，少一步</span></div><div class="home-shortcuts">
        <button class="action-card" aria-label="${shortcutName}" ${actionAttrs(shortcut === 'horn' ? 'horn' : shortcut === 'seat' ? 'vehicle-action' : 'tab', shortcut === 'seat' ? 'seat' : shortcut === 'daily' ? 'daily' : 'horn')} ${shortcutAllowed ? '' : 'disabled'}>${icon(shortcut === 'horn' ? 'horn' : shortcut === 'seat' ? 'seat' : 'grid')}<span><strong>${shortcutName}</strong><small>${shortcut === 'horn' ? '普通 / 高声' : shortcut === 'seat' ? '确认后开启' : '车况与设置'}</small></span></button>
        <button class="action-card" aria-label="${secondaryName}" ${actionAttrs(shortcut === 'seat' ? 'horn' : 'vehicle-action', shortcut === 'seat' ? 'horn' : 'seat')} ${secondaryAllowed ? '' : 'disabled'}>${icon(shortcut === 'seat' ? 'horn' : 'seat')}<span><strong>${secondaryName}</strong><small>${shortcut === 'seat' ? '普通 / 高声' : '确认后开启'}</small></span></button>
      </div></section>
      <button class="location-entry" ${actionAttrs(!demo && d?.daily.location && o.online ? 'map' : 'tab', 'daily')} ${o.locked ? 'disabled' : ''}>${icon('pin')}<span><strong>车辆位置</strong><small>${html(d?.daily.location?.address ?? (d?.daily.location ? '已有坐标，点开查看地图' : '查看位置与导航'))}</small></span>${icon('arrow')}</button>
      <button class="text-button more-daily" ${actionAttrs('tab', 'daily')}>查看日常用车、位置与更多车控 ${icon('arrow')}</button>
      <div class="notice ${o.expired || o.phase === 'error' ? 'error' : ''} ${o.message ? 'has-message' : ''}" role="status" aria-live="polite">${o.message ? icon(o.phase === 'error' || o.expired ? 'info' : 'clock') : ''}<span>${html(o.message)}</span></div>
    </div>
  </div>`;
}
