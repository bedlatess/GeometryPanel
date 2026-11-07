import type { Snapshot } from './model';

/** Draw only explicit public-facing readings. No DOM capture or account data. */
export function panelImage(reading: Snapshot, demo: boolean): { data: string; fileName: string } {
  const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 640;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('image');
  const metric = (value: number | null, unit: string) => value === null || !Number.isFinite(value) ? '—' : `${Number(value.toFixed(1))}${unit}`;
  ctx.fillStyle = '#f5f5f1'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1e2c25'; ctx.font = 'bold 42px sans-serif'; ctx.fillText('几何面板 · 车况', 64, 92);
  ctx.font = '24px sans-serif'; ctx.fillText(demo ? '演示数据 · 仅供体验' : '车辆上报读数 · 以实际状态为准', 64, 140);
  const rows = [ ['剩余电量', metric(reading.soc, '%')], ['预计续航', metric(reading.range, ' km')],
    ['电池电压', metric(reading.voltage, ' V')], ['在线状态', reading.online === true ? '在线' : reading.online === false ? '离线' : '未知'],
    ['充电状态', ['充电中', '未充电', '已充满'].includes(reading.charging) ? reading.charging : '未知'] ];
  ctx.font = '30px sans-serif';
  rows.forEach(([label, value], i) => { const y = 222 + i * 62; ctx.fillText(label, 64, y); ctx.fillText(value, 490, y); });
  ctx.font = '22px sans-serif'; ctx.fillText(reading.receivedAt > 0 ? `读取时间：${new Date(reading.receivedAt).toLocaleString('zh-CN')}` : '演示读数', 64, 580);
  const data = canvas.toDataURL('image/png').split(',')[1];
  if (!data || data.length > 1398104) throw new Error('image');
  return { data, fileName: 'geometry-status.png' };
}

export function downloadPanelImage(image: { data: string; fileName: string }) {
  const link = document.createElement('a'); link.href = `data:image/png;base64,${image.data}`;
  link.download = image.fileName; link.click();
}
