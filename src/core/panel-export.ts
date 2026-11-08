import type { Snapshot } from './model';
/** Share only explicit readings, with the supplied brand asset. Never capture the DOM or location. */
export async function panelImage(reading: Snapshot, demo: boolean, name='几何面板'): Promise<{data:string;fileName:string}> {
  await document.fonts.ready;
  const mark=new Image();mark.src=import.meta.env.BASE_URL+'brand/app-icon.svg';await mark.decode();
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=640;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('image');
  const metric=(v:number|null,u:string)=>v==null||!Number.isFinite(v)?'—':Number(v.toFixed(1))+u;
  ctx.fillStyle='#0B0D10';ctx.fillRect(0,0,960,640);ctx.drawImage(mark,64,58,64,64);
  ctx.fillStyle='#F2F4F6';ctx.font='600 34px sans-serif';ctx.fillText(name.slice(0,24),152,102,740);
  ctx.font='600 144px "GP Num",sans-serif';ctx.fillText(metric(reading.soc,'%'),64,322);
  ctx.font='600 58px "GP Num",sans-serif';ctx.fillText(metric(reading.range,' km'),64,434);
  const d=reading.daily, fresh=d.reportState==='fresh'&&d.reportedAt!=null&&Date.now()-d.reportedAt<=1800000;
  ctx.font='28px sans-serif';ctx.fillText(fresh&&d.vehicleLocked!==null?(d.vehicleLocked?'已锁车':'未锁车'):'状态未知',560,318);
  ctx.fillStyle='#9AA2AA';ctx.font='22px sans-serif';ctx.fillText('预计续航',64,478);
  ctx.fillText((demo?'演示 · ':'')+'生成于 '+new Date().toLocaleString('zh-CN'),64,578);
  const data=canvas.toDataURL('image/png').split(',')[1];if(!data||data.length>1398104)throw new Error('image');
  return {data,fileName:'geometry-status.png'};
}

export function downloadPanelImage(image: { data: string; fileName: string }) {
  const link = document.createElement('a'); link.href = `data:image/png;base64,${image.data}`;
  link.download = image.fileName; link.click();
}
