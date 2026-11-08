import type { Snapshot } from '../../core/model';
import { html, number } from '../kit';
import { icon, type Icon } from '../icons';
import type { ChargingSession } from '../../core/history';
import type { TireReading } from '../../core/extensions-model';
import { age } from '../kit';
export function recordsPage(data: Snapshot | null, charge?: ChargingSession, tires: TireReading[] = []) {
 const card=(label:string,path:string,glyph:Icon,value:string,detail:string)=>`<button class="record-card" data-action="route" data-value="${path}"><span class="record-icon">${icon(glyph)}</span><span><strong>${label}</strong><b class="num">${html(value)}</b><small>${html(detail)}</small></span>${icon('arrow')}</button>`;
 const front=tires.find(t=>t.position==='前轮'),rear=tires.find(t=>t.position==='后轮');
 const tireAt=Math.min(...tires.flatMap(t=>t.reportedAt==null?[]:[t.reportedAt]));
 const chargeDetail=charge?`${charge.status==='charging'?'充电中':'上次充电'} · ${age(charge.endedAt??charge.startedAt)}`:'暂无充电记录';
 return `<div class="record-cards">${card('骑行','/records/rides','vehicle',number(data?.daily.monthMileageKm,' km'),'本月 '+number(data?.daily.monthRideMinutes,' 分'))}${card('电池与充电','/records/battery','bolt',`${number(charge?.startSoc)}% → ${number(charge?.endSoc)}%`,chargeDetail)}${card('胎压','/records/tires','tire',`${number(front?.pressureBar)} / ${number(rear?.pressureBar)} bar`,`前 / 后${tires.length?' · '+age(Number.isFinite(tireAt)?tireAt:null):''}`)}</div>`;
}
