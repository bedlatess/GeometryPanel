export type Tab = 'ride' | 'tracks' | 'tires' | 'alerts' | 'settings';
export const tabs: readonly [Tab, string][] = [
  ['ride', '骑行记录'],
  ['tracks', '历史轨迹'],
  ['tires', '胎压'],
  ['alerts', '车辆告警'],
  ['settings', '车辆设置'],
];
export const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const dateLabel = (v: string) =>
  v.replace(/^20\d{2}[-.](\d{2})[-.](\d{2})/, (_, m, d) => Number(m) + '月' + Number(d) + '日');
export const number = (value: number | null, unit = '') =>
  value === null
    ? '—'
    : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
export const row = (name: string, value: string) =>
  `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`;
