import type { Snapshot } from '../../core/model';
import { ListGroup, ListRow, number, age } from '../kit';
const state = (v?: boolean | null) => v == null ? '状态未知' : v ? '已锁车' : '未锁车';
const rows = (label: string, data: [string, string][]) => ListGroup(label, data.map(([k,v]) => ListRow(k,v,'',undefined,true)).join(''));
export function statusPage(data: Snapshot | null, name = '') {
  const d = data?.daily;
  return (name ? `<div class="vehicle-page-identity"><h2>${name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}</h2><span>更新于 ${age(data?.receivedAt)}</span></div>` : '') + rows('锁', [['车辆',state(d?.vehicleLocked)],['车头',state(d?.headLocked)],['座桶',state(d?.seatLocked)]])
  + rows('骑行', [['骑行状态', d?.rideState || '—'],['总里程',number(d?.totalMileageKm,' km')],['本月里程',number(d?.monthMileageKm,' km')],['本月时长',number(d?.monthRideMinutes,' 分钟')],['本月均速',number(d?.monthAverageSpeedKmh,' km/h')]])
  + rows('电池', [['电量',number(data?.soc,'%')],['电压',number(data?.voltage,' V')],['电流',number(d?.currentA,' A')],['功率',number(d?.powerW,' W')],['温度',number(d?.temperatureC,' °C')],['健康度',number(d?.healthPercent,'%')],['充电次数',number(d?.chargeCount,' 次')],['充电已用时长', d?.chargeElapsedText || number(d?.chargeElapsedMinutes,' 分钟')],['预计充满',d?.expectedFullText || '—'],['充电状态',data?.charging || '—']])
  + rows('时间', [['车辆时间',age(d?.reportedAt)],['电池时间',age(d?.batteryReportedAt)],['读取时间',age(data?.receivedAt)]])
  + ListGroup('',ListRow('车辆信息','','data-action="route" data-value="/vehicle/info"'));
}
