import { createRouter, createWebHashHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';

const pages: [string, string, string][] = [
  ['/vehicle/status/firmware', '固件', '车况'],
  ['/vehicle/location', '车辆位置', '车辆'],
  ['/vehicle/location/coordinates', '坐标', '车辆位置'],
  ['/vehicle/location/fences', '电子围栏', '车辆位置'],
  ['/vehicle/location/fences/:id', '电子围栏', '电子围栏'],
  ['/vehicle/settings/phone-keys', '手机钥匙', '车辆设置'],
  ['/vehicle/settings/card-keys', '卡钥匙', '车辆设置'],
  ['/vehicle/settings/sharing', '家人用车', '车辆设置'],
  ['/vehicle/settings/charge-plan', '充电计划', '车辆设置'],
  ['/vehicle/settings/low-phone', '电话提醒', '车辆设置'],
  ['/vehicle/settings/unsupported', '此车型不支持的功能', '车辆设置'],
  ['/vehicle/messages', '消息', '车辆'],
  ['/vehicle/messages/:id', '消息', '消息'],
  ['/vehicle/health', '体检', '车况'],
  ['/records/ride/:id', '单次行程', '记录'],
  ['/records/battery/score', '电池评分', '记录'],
  ['/records/battery/info', '电池与充电', '记录'],
  ['/tools/tasks', '签到与积分', '工具'],
  ['/tools/picture', '车况图片', '工具'],
  ['/tools/diagnostics', '诊断', '工具'],
  ['/tools/bluetooth', '蓝牙钥匙', '工具'],
  ['/tools/bluetooth/more', '更多操作', '蓝牙钥匙'],
  ['/tools/meter', '仪表与投屏', '工具'],
  ['/tools/meter/:section', '仪表工具', '仪表与投屏'],
  ['/tools/monitor', '后台提醒', '工具'],
  ['/tools/widgets', '桌面组件', '工具'],
  ['/tools/scan', '扫码', '工具'],
  ['/tools/android', 'Android', '工具'],
  ['/me/accounts', '账号与车辆', '我的'],
  ['/me/accounts/:id', '账号', '账号与车辆'],
  ['/me/appearance', '外观', '我的'],
  ['/me/home', '首页按钮', '我的'],
  ['/me/backup', '备份与恢复', '我的'],
  ['/me/install', '添加到主屏幕', '我的'],
  ['/me/about', '关于几何面板', '我的'],
  ['/me/about/privacy', '隐私说明', '关于'],
  ['/me/about/disclaimer', '免责声明', '关于'],
  ['/me/about/licenses', '开源许可', '关于'],
  ['/me/about/licenses/:name', '开源许可', '开源许可'],
  ['/me/developer', '开发者选项', '关于'],
  ['/me/lab', '状态模拟器', '开发者选项'],
  ['/me/components', '组件一览', '开发者选项'],
];
function pageComponent(path: string) {
  if (/^\/tools\/(bluetooth|meter)/.test(path))
    return () => import('../views/tools/NativeView.vue');
  if (path === '/tools/tasks') return () => import('../views/tools/TasksView.vue');
  if (path === '/tools/picture') return () => import('../views/tools/PictureView.vue');
  if (path.startsWith('/tools/')) return () => import('../views/tools/BackgroundView.vue');
  if (path.startsWith('/vehicle/messages'))
    return () => import('../views/vehicle/MessagesView.vue');
  if (path === '/vehicle/settings/unsupported')
    return () => import('../views/vehicle/UnsupportedView.vue');
  if (path === '/vehicle/location' || path === '/vehicle/location/coordinates')
    return () => import('../views/vehicle/LocationView.vue');
  if (path.startsWith('/records/ride/')) return () => import('../views/records/TripView.vue');
  if (path === '/records/battery/info') return () => import('../views/vehicle/StatusView.vue');
  if (path.startsWith('/vehicle/') || path === '/records/battery/score')
    return () => import('../views/vehicle/OwnerView.vue');
  if (path.startsWith('/me/accounts')) return () => import('../views/me/AccountsView.vue');
  if (path === '/me/appearance') return () => import('../views/me/AppearanceView.vue');
  if (path === '/me/home') return () => import('../views/me/HomeButtonsView.vue');
  if (path === '/me/backup') return () => import('../views/me/BackupView.vue');
  if (path === '/me/install') return () => import('../views/me/InstallView.vue');
  if (path === '/me/developer') return () => import('../views/me/DeveloperView.vue');
  if (path === '/me/lab') return () => import('../views/me/LabView.vue');
  if (path === '/me/components') return () => import('../views/me/ComponentsView.vue');
  return () => import('../views/me/AboutView.vue');
}
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/vehicle' },
  {
    path: '/vehicle',
    component: () => import('../views/vehicle/VehicleView.vue'),
    meta: { title: '车辆', root: true },
  },
  {
    path: '/vehicle/status',
    component: () => import('../views/vehicle/StatusView.vue'),
    meta: { title: '车况', back: '车辆' },
  },
  {
    path: '/vehicle/settings',
    component: () => import('../views/vehicle/SettingsView.vue'),
    meta: { title: '车辆设置', back: '车辆' },
  },
  {
    path: '/records',
    component: () => import('../views/records/RecordsView.vue'),
    meta: { title: '记录', root: true },
  },
  {
    path: '/tools',
    component: () => import('../views/tools/ToolsView.vue'),
    meta: { title: '工具', root: true },
  },
  {
    path: '/me',
    component: () => import('../views/me/MeView.vue'),
    meta: { title: '我的', root: true },
  },
  ...pages.map(([path, title, back]) => ({
    path,
    component: pageComponent(path),
    meta: { title, back, parent: path.split('/').slice(0, -1).join('/') || '/vehicle' },
  })),
  { path: '/vehicle/info', redirect: '/vehicle/status?tab=device' },
  { path: '/vehicle/firmware', redirect: '/vehicle/status/firmware' },
  { path: '/records/rides', redirect: '/records?tab=ride' },
  { path: '/records/rides/:id', redirect: (to) => `/records/ride/${to.params.id}` },
  { path: '/records/battery', redirect: '/records?tab=battery' },
  { path: '/records/battery/official', redirect: '/records?tab=battery&source=official' },
  { path: '/records/tires', redirect: '/records?tab=tire' },
  { path: '/:pathMatch(.*)*', redirect: '/vehicle' },
];
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [{ path: '/', component: () => import('./TabsLayout.vue'), children: routes }],
});
