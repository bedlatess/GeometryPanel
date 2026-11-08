import type { Snapshot, Vehicle } from '../../core/model';
import type { AccountBook } from '../../core/accounts';
import type { Preferences } from '../../core/preferences';
import { statusPage } from './status';
import { locationPage,coordinatesPage } from './location';
import { infoPage } from './info';
import { recordsPage } from './records';
import { toolsPage } from './tools';
import { mePage } from './me';
import { appearancePage } from './appearance';
import { homeCustomPage } from './home-custom';
import { backupPage } from './backup';
import { installPage } from './install';
import { aboutPage,legalPage } from './about';
import { vehicleArt } from '../vehicle-art';
import { componentsPage } from '../kit/components-page';
import { exportPreferences } from '../../core/preferences';
import { ListGroup,ListRow } from '../kit';
export const pageTitles:Record<string,string>={
 '/records':'记录','/tools':'工具','/me':'我的','/vehicle/status':'车况','/vehicle/location':'车辆位置','/vehicle/settings':'车辆设置','/vehicle/info':'车辆信息','/vehicle/messages':'消息',
 '/records/battery/info':'记录范围','/records/rides':'骑行','/records/battery':'电池与充电','/records/tires':'胎压',
 '/tools/bluetooth':'蓝牙钥匙','/tools/meter':'仪表工具','/tools/monitor':'后台提醒','/tools/widgets':'桌面组件','/tools/diagnostics':'诊断','/tools/tasks':'签到与积分','/tools/android':'极核 App 登录','/tools/scan':'扫码',
 '/tools/bluetooth/more':'更多操作','/tools/meter/wallpaper':'仪表壁纸','/tools/meter/cast':'仪表投屏','/tools/meter/upgrade':'仪表升级','/vehicle/settings/unsupported':'不支持的功能','/vehicle/location/coordinates':'坐标信息','/me/about/privacy':'隐私说明','/me/about/disclaimer':'免责声明','/me/about/licenses':'开源许可','/me/accounts':'账号与车辆','/me/appearance':'外观','/me/home':'首页定制','/me/art':'车图','/me/backup':'备份与导入','/me/install':'安装与更新','/me/about':'关于','/me/lab':'状态模拟器','/me/components':'组件一览',
};
interface PageOptions { car?:Vehicle;data:Snapshot|null;book:AccountBook;preferences:Preferences;version:string;demo:boolean;app:boolean;android:boolean;mapVisible:boolean;checking:boolean;developer:boolean;installed:boolean }
export function pageFor(path:string,o:PageOptions):string {
 if(path==='/records/battery/info')return '<p>网页版仅在打开时记录</p>';
 if(path.startsWith('/me/about/'))return legalPage(path.split('/').at(-1)!);
 switch(path){
 case '/vehicle/location/coordinates':return coordinatesPage(o.data,!o.demo&&navigator.onLine);
 case '/vehicle/status':return statusPage(o.data,o.car?.name);
 case '/vehicle/location':return locationPage(o.data,!o.demo&&navigator.onLine,o.mapVisible,o.demo);
 case '/vehicle/info':return infoPage(o.car,o.demo);
 case '/records':return `<div data-page-controller id="records-panel">${recordsPage(o.data)}</div>`;
 case '/tools':return `<div data-page-controller id="tools-home">${toolsPage(o.app,o.android)}</div>`;
 case '/me':return mePage(o.car,o.book,o.preferences,o.version,o.demo);
 case '/me/appearance':return appearancePage(o.preferences);
 case '/me/home':return homeCustomPage(o.preferences);
 case '/me/backup':return backupPage(exportPreferences(o.preferences));
 case '/me/install':return installPage(o.version,o.installed,o.checking);
 case '/me/about':return aboutPage(o.version,o.developer);
 case '/me/art':return ListGroup('',ListRow('车图','默认','',undefined,true));
 case '/me/components':return componentsPage();
 case '/tools/meter/wallpaper':case '/tools/meter/cast':case '/tools/meter/upgrade':case '/tools/meter':return '<div data-page-controller><div id="native-panel"></div></div>';
 case '/tools/bluetooth/more':case '/tools/bluetooth':return '<div data-page-controller><div id="native-panel"></div></div>';
 case '/tools/tasks':return '<div data-page-controller id="tasks-panel"></div>';
 case '/me/accounts':return '<div data-page-controller id="accounts-panel"></div>';
 case '/me/lab':return '<div data-page-controller id="design-lab"></div>';
 case '/vehicle/settings/unsupported':case '/vehicle/settings':case '/vehicle/messages':case '/records/rides':case '/records/tires':return '<div data-page-controller id="extension-panel"></div>';
 default:return path.startsWith('/records/rides/')||path.startsWith('/vehicle/messages/')?'<div data-page-controller id="extension-panel"></div>':'<div data-page-controller id="background-panel"></div>';
 }
}
