import type { Snapshot, Vehicle, VehicleList } from '../../core/model';
import type { AccountBook } from '../../core/accounts';
import { icon } from '../icons';
import { vehicleArt } from '../vehicle-art';
import { Card, clock, html, ListGroup, ListRow, PrimaryButton, SecondaryButton, Segmented } from '../kit';
export function commandSheet(car: Vehicle, label: string, mode: string) {
  return `${Card(`<strong>${html(car.name)}</strong><span class="muted">尾号 ${html(car.vin.slice(-6))}</span>`, '目标车辆')}${PrimaryButton(label, `data-action="send-control" data-value="${mode}"`)}${SecondaryButton('取消', 'data-action="close"')}`;
}
export function hornSheet(car: Vehicle, selected = 'normal') {
  return `${Segmented([['normal', '鸣笛寻车'], ['high', '高声寻车']], selected, 'data-horn-mode')}${Card(`<strong>${html(car.name)}</strong><span class="muted">尾号 ${html(car.vin.slice(-6))}</span>`, '目标车辆')}${PrimaryButton('发送', `data-action="send-horn-choice" data-value="${selected}"`)}`;
}
export function dataSheet(data: Snapshot | null) {
  return ListGroup('', [['网络', navigator.onLine ? '已连接' : '不可用'], ['车辆状态', clock(data?.daily.reportedAt)], ['电池', clock(data?.daily.batteryReportedAt)], ['位置', clock(data?.daily.location?.reportedAt)], ['刷新于', clock(data?.receivedAt)]].map(([key, value]) => ListRow(key, value, '', undefined, true)).join(''));
}
export function vehiclePicker(book: AccountBook) {
  return book.accounts.map(account => ListGroup(account.label, account.vehicles.map(car => `<button class="list-row vehicle-choice" data-action="saved-vehicle" data-value="${html(car.id)}">${vehicleArt({ ...car, name: car.label }, true)}<span><strong>${html(car.label)}</strong><small>尾号 ${html(car.vin.slice(-6))}</small></span>${book.selectedVehicleId === car.id ? icon('check') : ''}</button>`).join(''))).join('') + ListRow('管理账号', '', 'data-action="route" data-value="/me/accounts"');
}
export function loginVehicleList(result: VehicleList | null, vin?: string) {
  const cars = result?.vehicles ?? [];
  return (!result ? '<p class="muted" role="status">正在加载</p>' : cars.length ? `<div class="vehicle-list">${cars.map((car, index) => `<button class="list-row vehicle-choice" data-action="select" data-value="${index}">${vehicleArt(car, true)}<span><strong>${html(car.name)}</strong><small>尾号 ${html(car.vin.slice(-6))}</small></span>${vin === car.vin ? icon('check') : ''}</button>`).join('')}</div>` : `<p class="muted">${result.receivedCount ? '车辆信息未识别' : '未找到车辆'}</p>`) + SecondaryButton('重新读取', 'data-action="retry-list"') + '<button class="text-button" data-action="phone">更换账号</button>';
}
