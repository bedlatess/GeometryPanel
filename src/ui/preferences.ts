import type { Preferences } from '../core/preferences';

export function renderUsagePreferences(preferences: Preferences): string {
  return `<section class="settings-card"><h2>使用与 DIY</h2>
    <label>打开后的首页<select aria-label="打开后的首页" data-preference="startPage"><option value="vehicle" ${preferences.startPage === 'vehicle' ? 'selected' : ''}>车辆面板</option><option value="daily" ${preferences.startPage === 'daily' ? 'selected' : ''}>日常用车</option></select></label>
    <label>首页快捷操作<select aria-label="首页快捷操作" data-preference="shortcut"><option value="horn" ${preferences.shortcut === 'horn' ? 'selected' : ''}>鸣笛寻车</option><option value="seat" ${preferences.shortcut === 'seat' ? 'selected' : ''}>打开座桶</option><option value="daily" ${preferences.shortcut === 'daily' ? 'selected' : ''}>日常用车</option></select></label>
    <button class="setting-row" data-action="range" role="switch" aria-checked="${preferences.range}"><span>首页显示预估续航</span><span class="switch ${preferences.range ? 'checked' : ''}" aria-hidden="true"></span></button>
    <button class="setting-row" data-action="foreground-refresh" role="switch" aria-checked="${preferences.foregroundRefresh}"><span>回到面板时自动读取车况</span><span class="switch ${preferences.foregroundRefresh ? 'checked' : ''}" aria-hidden="true"></span></button>
    <p class="fine-print">回到前台或恢复联网时，距上次读取超过一分钟才自动读取。关闭后仍可手动刷新；不会在后台持续读取或自动发车控。</p>
    <button class="text-button" data-action="export-preferences">备份我的配置</button><button class="text-button" data-action="import-preferences">导入配置</button><button class="text-button" data-action="reset-preferences">恢复默认配置</button>
    <p class="fine-print">配置只包含本机使用偏好，不包含账号、车辆或登录信息。</p>
  </section>`;
}
