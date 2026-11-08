import { type BackgroundNotifications } from '../../../core/background';
export const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export const time = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value)
        .toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        .replace('/', '月')
        .replace(' ', '日 ')
    : '未知';
export const number = (value: unknown, unit = '') =>
  typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(2))}${unit}` : '—';
export const labels: Record<keyof BackgroundNotifications, string> = {
  chargeStart: '充电开始',
  chargeProgress: '充电进度',
  chargeFull: '已充满',
  chargeStop: '充电中止',
  message: '车辆消息',
  lowBattery: '电量低',
  offline: '车辆离线',
  tire: '胎压异常',
};
export function download(value: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
