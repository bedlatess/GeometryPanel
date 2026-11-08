import type { Vehicle } from '../../core/model';
import { ListGroup,ListRow,html } from '../kit';
import { vehicleArt } from '../vehicle-art';
export function infoPage(car?: Vehicle,demo=false) {
 return car ? `<div class="info-photo">${vehicleArt(car,false,demo)}</div><h2>${html(car.name)}</h2>${ListGroup('',[['车型',car.type || '—'],['车牌',car.plate || '—'],['车架号尾号',car.vin.slice(-6)]].map(([k,v])=>ListRow(k,v,'',undefined,true)).join(''))}${ListGroup('',ListRow('换一张专属车图','','data-action="route" data-value="/me/art"'))}` : '';
}
