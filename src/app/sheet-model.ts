import type { AccountBook } from '../core/accounts';
import type { Snapshot, Vehicle, VehicleList } from '../core/model';
export { ConfirmSheet } from '../stores/workflow-actions';
export const shortcutNames: Record<string, string> = {
  location: '位置',
  status: '车况',
  settings: '车辆设置',
  tires: '胎压',
  rides: '骑行',
  battery: '电池',
  messages: '消息',
  high: '高声寻车',
  storage: '储物箱',
  more: '更多',
  horn: '寻车',
  seat: '座桶',
};
export const commandSheet = (car: Vehicle, label: string, mode: string) => ({
  kind: 'command',
  car,
  label,
  mode,
});
export const hornSheet = (car: Vehicle, selected = 'normal') => ({ kind: 'horn', car, selected });
export const dataSheet = (snapshot: Snapshot | null) => ({ kind: 'data', snapshot });
export const vehiclePicker = (_book: AccountBook) => ({ kind: 'picker' });
export const loginVehicleList = (result: VehicleList | null, vin?: string) => ({
  kind: 'vehicles',
  result,
  vin,
});
export const ActionSheet = (items: string[][]) => ({ kind: 'actions', items });
export const PickerSheet = (items: string[][], value: string, action: string) => ({
  kind: 'choice',
  items,
  value,
  action,
});
