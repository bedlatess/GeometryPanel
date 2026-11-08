import type { Preferences } from '../../core/preferences';
import { ListGroup,ListRow,Switch } from '../kit';
export const shortcutNames:Record<string,string>={location:'找车',status:'车况',settings:'车辆设置',tires:'胎压',rides:'骑行',battery:'电池',messages:'消息',high:'高声寻车',storage:'储物箱',more:'更多'};
export function homeCustomPage(p:Preferences) { return ListGroup('首页按键',p.shortcut.map((id,i)=>ListRow(`按键 ${i+1}`,shortcutNames[id],`data-action="pick-shortcut" data-value="${i}"`)).join(''))+ListGroup('',Switch('首页显示续航',p.range,'data-action="range"')+Switch('首页显示电压',p.voltage,'data-action="voltage"')+Switch('回到前台自动刷新',p.foregroundRefresh,'data-action="foreground-refresh"')+ListRow('打开后的首页',({vehicle:'车辆',records:'记录',tools:'工具',me:'我的'})[p.startPage],'data-action="pick-start"')); }
