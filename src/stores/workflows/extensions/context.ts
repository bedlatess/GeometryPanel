import { ExtensionsApi } from '../../../api/extensions';
import { NativeMaterialsApi } from '../../../api/native-materials';
import {
  type RideMonth,
  type RideTrack,
  type TireReading,
  type VehicleAlert,
  type VehicleSetting,
} from '../../../core/extensions-model';
import type { Session } from '../../../core/model';
import { type PageActions } from '../../workflow-actions';
import { Tab } from './shared';

export interface Context {
  host: HTMLElement;
  options: {
    session: Session | null;
    demo: boolean;
    onExpired: () => void;
    onUncertain?: () => void;
    initial?: Tab;
    day?: string;
    view?: string;
    actions: PageActions;
    publish(value: any): void;
  };
  session: {
    vehicle: {
      vin: string;
      name: string;
      type: string;
      plate: string;
      vehiclePicUrl?: string;
      vehiclePic3dUrl?: string;
      vehicleScalePicUrl?: string;
    };
    token: string;
    uid: string;
  } | null;
  api: ExtensionsApi;
  materials: NativeMaterialsApi;
  alive: boolean;
  expired: boolean;
  writing: boolean;
  tab: Tab;
  busy: boolean;
  error: string;
  note: string;
  month: string;
  day: string;
  trackPage: number;
  alertPage: number;
  generation: number;
  request: AbortController | null;
  monthly: RideMonth | null;
  tracks: { tracks: RideTrack[]; receivedCount: number } | null;
  tires: { wheels: TireReading[]; updatedAt: number | null } | null;
  alerts: { alerts: VehicleAlert[]; accountUnread: number | null; receivedCount: number } | null;
  settings: VehicleSetting[] | null;
  confirmation: { setting: VehicleSetting; value: string; label: string } | null;
  messageConfirmation: 'read' | 'delete' | null;
  roadMaps: Set<number>;
  disabled: () => '' | 'disabled';
  expire: () => void;
  messageTab: string;
  settingName: (key: string, title: string) => string;
  settingsAt: number | null;
  render: () => void;
  confirmSetting: (setting: VehicleSetting, value: string, label: string) => void;
  simulated: () => void;
  load: () => Promise<void>;
  updateMessages: () => Promise<void>;
  write: () => Promise<void>;
  clicked: (event: Event) => void;
  submitted: (event: Event) => void;
}
