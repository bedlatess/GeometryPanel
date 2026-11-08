import { type AccountBook } from '../../../core/accounts';
import { type Snapshot } from '../../../core/model';
import {
  type NativeCapabilities,
  type NativeClient,
  type NativeMethod,
} from '../../../core/native';
import { type PageActions } from '../../workflow-actions';

export interface Context {
  host: HTMLElement;
  options: {
    native: NativeClient;
    book: AccountBook;
    demo: boolean;
    snapshot?: Snapshot | null;
    onUncertain?(): void;
    onImported?(session: unknown): Promise<void>;
    initial?: 'monitor' | 'history' | 'desktop' | 'tools';
    toolGroup?: 'meter' | 'android' | 'scan' | 'diagnostics';
    actions: PageActions;
    publish(value: any): void;
  };
  native: NativeClient;
  book: AccountBook;
  demo: boolean;
  controller: AbortController;
  disposed: boolean;
  working: boolean;
  message: string;
  section: 'monitor' | 'history' | 'desktop' | 'tools';
  caps: NativeCapabilities | null;
  status: any;
  kind: 'battery' | 'charge' | 'events';
  items: any[];
  total: number;
  confirmingClear: boolean;
  selected: string;
  style: string;
  controls: boolean;
  monitorEnabled: boolean;
  updateAvailable: boolean;
  range: string;
  startTime: string;
  endTime: string;
  preferences: {
    notifications: {
      chargeStart: boolean;
      chargeProgress: boolean;
      chargeFull: boolean;
      chargeStop: boolean;
      message: boolean;
      lowBattery: boolean;
      offline: boolean;
      tire: boolean;
    };
    lowBatteryThreshold: number;
  };
  vehicles:
    | {
        accountLabel: string;
        id: string;
        vin: string;
        label: string;
        type: string;
        plate: string;
        epoch: number;
        enabled: boolean;
      }[]
    | { id: string; vin: string; label: string; accountLabel: string }[];
  feature: (name: keyof NativeCapabilities['features']) => boolean;
  enabled: () => boolean;
  useNativeHistory: () => boolean;
  desktopKey: string;
  loadDesktop: () => void;
  saveDesktop: () => void;
  filteredItems: () => any[];
  render: () => void;
  loadHistory: (append?: boolean) => Promise<void>;
  task: (work: () => Promise<void>) => Promise<void>;
  call: (method: NativeMethod, params?: object) => Promise<any>;
  click: (event: Event) => void;
  change: (event: Event) => void;
}
