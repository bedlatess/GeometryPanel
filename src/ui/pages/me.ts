import type { Vehicle } from '../../core/model';
import type { Preferences } from '../../core/preferences';
import type { AccountBook } from '../../core/accounts';
import { vehicleArt } from '../vehicle-art';
import { icon } from '../icons';
import { html,ListGroup,ListRow } from '../kit';
export function mePage(car:Vehicle|undefined,book:AccountBook,p:Preferences,version:string,demo:boolean) {
 const glyphs:Record<string,Parameters<typeof ListRow>[3]>={appearance:'palette',home:'settings',art:'vehicle',backup:'key',install:'refresh',about:'info'};
 const row=(label:string,path:string,value='')=>ListRow(label,value,`data-action="route" data-value="${path}"`,glyphs[path.split('/').at(-1)!]);
 return `<button class="identity-card" data-action="route" data-value="/me/accounts">${car?.vehiclePicUrl?vehicleArt(car,true,demo):''}<span><strong>${html(car?.name || '账号与车辆')}</strong><span>${demo ? '演示' : `${book.accounts.length} 个账号 · ${book.accounts.reduce((n,a)=>n+a.vehicles.length,0)} 台车`}</span></span>${icon('arrow')}</button>${ListGroup('个性化',row('外观','/me/appearance',{'system':'跟随系统','light':'浅色','dark':'深色'}[p.theme])+row('首页定制','/me/home'))}${ListGroup('数据',row('备份与导入','/me/backup')+row('安装与更新','/me/install'))}${ListGroup('关于',row('关于几何面板','/me/about',version))}${demo ? '<button class="action-row" data-action="preview">退出演示</button>' : ''}`;
}
