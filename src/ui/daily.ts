import type { Snapshot, Vehicle } from '../core/model';
import { navigationLinks } from '../core/navigation';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const number = (value: number | null | undefined, unit: string) => value == null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
const state = (value: boolean | null | undefined, on: string, off: string) => value == null ? '未知' : value ? on : off;
const row = (label: string, value: string) => `<div class="detail-row"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
const date = (value: number | null | undefined) => value ? new Date(value).toLocaleString('zh-CN') : '上报时间未知';

export function renderDaily(options: { car?: Vehicle; data: Snapshot | null; demo: boolean; enabled: boolean; locked: boolean; online: boolean }): string {
  const { car, data, demo, enabled, locked, online } = options;
  const daily = data?.daily;
  const location = daily?.location;
  const links = !demo && online && !locked ? navigationLinks(location ?? null) : null;
  const capability = daily?.capabilities;
  const canLock = enabled && capability?.networkUnlock !== false;
  const canSeat = enabled && capability?.seatOpen !== false;
  return `<div class="page-heading"><div><span class="eyebrow">状态 · 充电 · 车控</span><h1>日常用车</h1></div>
    <button class="round-button" data-action="${car && !demo ? 'refresh' : 'connect'}" aria-label="${car && !demo ? '刷新车况' : '连接车辆'}" ${locked || !online || car && !demo && !enabled ? 'disabled' : ''}>${car && !demo ? '刷新' : '连接'}</button></div>
    <p class="subheading">${demo ? '演示数据 · 不会连接或控制车辆' : car ? `${escape(car.name)} · 尾号 ${escape(car.vin.slice(-6))}` : '连接车辆后查看完整用车信息。'}</p>
    <section class="settings-card daily-card"><h2>车辆状态</h2><dl class="details-list">
      ${row('车辆连接', state(data?.online, '在线', '离线'))}
      ${row('车头锁', state(daily?.headLocked, '已锁', '未锁'))}
      ${row('座桶锁', state(daily?.seatLocked, '已锁', '未锁'))}
      ${row('车辆锁状态', state(daily?.vehicleLocked, '已锁', '未锁'))}
      ${row('车辆状态', daily?.rideState ?? '未知')}
      ${row('总里程', number(daily?.totalMileageKm, 'km'))}
      ${row('本月里程', number(daily?.monthMileageKm, 'km'))}
      ${row('本月骑行时长', number(daily?.monthRideMinutes, '分钟'))}
      ${row('本月平均速度', number(daily?.monthAverageSpeedKmh, 'km/h'))}
    </dl><p class="fine-print">车辆上报 ${date(daily?.reportedAt)}${daily?.reportState === 'stale' ? ' · 数据较早' : daily?.reportState === 'future' ? ' · 时间异常' : ''}。状态可能有上报延迟。</p></section>
    <section class="settings-card daily-card"><h2>电池与充电</h2><dl class="details-list">
      ${row('充电状态', data?.charging ?? '未知')}
      ${row('剩余电量', number(data?.soc, '%'))}
      ${row('电池电压', number(data?.voltage, 'V'))}
      ${row('电池电流', number(daily?.currentA, 'A'))}
      ${row('电池功率', number(daily?.powerW, 'W'))}
      ${row('电池温度', number(daily?.temperatureC, '℃'))}
      ${row('电池健康', number(daily?.healthPercent, '%'))}
      ${row('车机循环次数', number(daily?.chargeCount, '次'))}
      ${row('本次已充', daily?.chargeElapsedText ?? number(daily?.chargeElapsedMinutes, '分钟'))}
      ${row('预计充满', daily?.expectedFullText ?? '—')}
    </dl><p class="fine-print">电池上报 ${date(daily?.batteryReportedAt)}${daily?.batteryReportState === 'stale' ? ' · 数据较早' : daily?.batteryReportState === 'future' ? ' · 时间异常' : ''}。未提供的信息显示 —。</p></section>
    <section class="settings-card daily-card" aria-label="车辆位置"><h2>车辆位置与导航</h2>
      <p class="location-address">${escape(location?.address || (location ? '已有停车坐标，打开地图查看道路、小区和停车点。' : '暂未取得有效车辆位置'))}</p>
      ${location ? `<p class="fine-print">位置上报 ${date(location.reportedAt)}${location.reportState === 'stale' ? ' · 位置较早' : location.reportState === 'future' ? ' · 时间异常' : ''}，请以现场为准。</p><details><summary>查看坐标信息</summary><p class="coordinate">纬度 ${location.latitude.toFixed(6)} · 经度 ${location.longitude.toFixed(6)}</p><p class="fine-print">${location.coordinateSystemSource === 'legacy-default' ? '按旧版车辆接口的高德坐标约定显示。' : location.coordinateSystem === 'gcj02' ? '高德坐标（GCJ-02）。' : location.coordinateSystem === 'wgs84' ? 'GPS 坐标（WGS84）。' : '暂不支持此坐标类型。'}</p></details>` : ''}
      ${links ? `<button class="primary block" data-action="map">显示车辆地图</button><div class="map-actions"><a class="secondary-link" href="${escape(links.map)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">在新窗口打开地图</a>${links.walk ? `<a class="secondary-link" href="${escape(links.walk)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">带我去找车</a>` : ''}</div><p class="fine-print">“带我去找车”会在高德规划从你所在位置走到停车处的路线。</p>`
        : `<p class="fine-print">${demo ? '演示模式不打开真实导航。' : !online ? '联网后可打开地图。' : location?.coordinateSystem === 'unknown' ? '接口明确标记了暂不支持的坐标类型，暂不生成地图与导航。' : '取得有效位置后可打开地图与导航。'}</p>`}
    </section>
    <section class="settings-card daily-card"><h2>云端车控</h2><p>每项操作都会先确认目标车辆，再发送请求。</p>
      <div class="control-grid">
        <button class="control-button" data-action="vehicle-action" data-value="powerOn" ${canLock ? '' : 'disabled'}><strong>云开锁</strong><small>车辆上电</small></button>
        <button class="control-button" data-action="vehicle-action" data-value="powerOff" ${canLock ? '' : 'disabled'}><strong>云关锁</strong><small>车辆关机</small></button>
        <button class="control-button" data-action="vehicle-action" data-value="seat" ${canSeat ? '' : 'disabled'}><strong>打开座桶</strong><small>发送开启请求</small></button>
        <button class="control-button" data-action="horn" ${enabled ? '' : 'disabled'}><strong>鸣笛寻车</strong><small>普通／高声</small></button>
      </div>
      ${capability?.networkUnlock === false ? '<p class="fine-print">当前车辆未提供云开关锁能力。</p>' : ''}
      ${capability?.seatOpen === false ? '<p class="fine-print">当前车辆未提供座桶开启能力。</p>' : ''}
      ${!car && !demo ? '<button class="primary block" data-action="connect">连接我的极核</button>' : ''}
      <p class="fine-print">服务受理不代表车辆已经执行；操作后可刷新车况并确认实际状态。</p>
    </section>`;
}
