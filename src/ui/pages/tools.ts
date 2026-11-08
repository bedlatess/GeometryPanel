import { ListGroup, ListRow, PlatformNote } from '../kit';
export function toolsPage(app: boolean, android: boolean) {
 const row=(label:string,path:string,glyph:Parameters<typeof ListRow>[3])=>ListRow(label,label==='后台提醒'||label==='签到与积分'?'—':'',`data-action="route" data-value="${path}"`,glyph);
 return `${!app ? PlatformNote() : ''}${ListGroup('车旁使用',row('蓝牙钥匙','/tools/bluetooth','key')+row('仪表工具','/tools/meter','gauge')+row('扫码','/tools/scan','grid'))}${ListGroup('提醒与桌面',row('后台提醒','/tools/monitor','bell')+row('桌面组件','/tools/widgets','grid'))}${ListGroup('排查',row('诊断','/tools/diagnostics','info')+ListRow('导出车况图片','','data-action="status-export"','grid'))}${android ? ListGroup('Android',row('极核 App 登录','/tools/android','key')+row('后台常驻模块','/tools/android','settings')) : ''}${ListGroup('账号福利',row('签到与积分','/tools/tasks','clock'))}`;
}
