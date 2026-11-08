import type { Snapshot } from '../../core/model';
import { html, number } from '../kit';
import { icon, type Icon } from '../icons';
export function recordsPage(data: Snapshot | null) {
 const card=(label:string,path:string,glyph:Icon,value:string,detail:string)=>`<button class="record-card" data-action="route" data-value="${path}"><span class="record-icon">${icon(glyph)}</span><span><strong>${label}</strong><b class="num">${html(value)}</b><small>${html(detail)}</small></span>${icon('arrow')}</button>`;
 return `<div class="record-cards">${card('骑行','/records/rides','vehicle',number(data?.daily.monthMileageKm,' km'),'本月 '+number(data?.daily.monthRideMinutes,' 分'))}${card('电池与充电','/records/battery','bolt',number(data?.soc,'%'),'电量')}${card('胎压','/records/tires','tire','— / — bar','前 / 后')}</div>`;
}
