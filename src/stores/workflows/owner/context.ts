import { OwnerApi, type OwnerRead } from '../../../api/owner';
import type { Session, Snapshot } from '../../../core/model';
import type { NativeClient } from '../../../core/native';
import { type OwnerRow } from '../../../core/owner-model';
import { type PageActions } from '../../workflow-actions';

export interface Context {
  host: HTMLElement;
  o: {
    path: string;
    session: Session | null;
    demo: boolean;
    actions: PageActions;
    native: NativeClient;
    snapshot?: Snapshot | null;
    onExpired(): void;
    publish(value: any): void;
  };
  api: OwnerApi;
  scope: AbortController;
  s: Session | null;
  a: PageActions;
  path: string;
  alive: boolean;
  busy: boolean;
  note: string;
  failed: boolean;
  month: string;
  period: string;
  shareTab: string;
  pendingPlan: string;
  data: Partial<
    Record<
      | 'redPoint'
      | 'otaDetail'
      | 'tires'
      | 'sim'
      | 'expiry'
      | 'recharge'
      | 'examination'
      | 'maintenance'
      | 'score'
      | 'battery'
      | 'charges'
      | 'uses'
      | 'otaTasks'
      | 'otaRecords'
      | 'otaStatus'
      | 'analysis'
      | 'rideDay'
      | 'unread'
      | 'phoneKeys'
      | 'bleStatus'
      | 'nfcKeys'
      | 'fences'
      | 'plans'
      | 'shareLong'
      | 'shareTemp'
      | 'shareTimes'
      | 'settings'
      | 'caps'
      | 'home'
      | 'tireHistory',
      unknown
    >
  >;
  known: Set<
    | 'redPoint'
    | 'otaDetail'
    | 'tires'
    | 'sim'
    | 'expiry'
    | 'recharge'
    | 'examination'
    | 'maintenance'
    | 'score'
    | 'battery'
    | 'charges'
    | 'uses'
    | 'otaTasks'
    | 'otaRecords'
    | 'otaStatus'
    | 'analysis'
    | 'rideDay'
    | 'unread'
    | 'phoneKeys'
    | 'bleStatus'
    | 'nfcKeys'
    | 'fences'
    | 'plans'
    | 'shareLong'
    | 'shareTemp'
    | 'shareTimes'
    | 'settings'
    | 'caps'
    | 'home'
    | 'tireHistory'
  >;
  errors: Set<
    | 'redPoint'
    | 'otaDetail'
    | 'tires'
    | 'sim'
    | 'expiry'
    | 'recharge'
    | 'examination'
    | 'maintenance'
    | 'score'
    | 'battery'
    | 'charges'
    | 'uses'
    | 'otaTasks'
    | 'otaRecords'
    | 'otaStatus'
    | 'analysis'
    | 'rideDay'
    | 'unread'
    | 'phoneKeys'
    | 'bleStatus'
    | 'nfcKeys'
    | 'fences'
    | 'plans'
    | 'shareLong'
    | 'shareTemp'
    | 'shareTimes'
    | 'settings'
    | 'caps'
    | 'home'
    | 'tireHistory'
  >;
  ownIdentity: string;
  identityReady: boolean;
  editor: { type: 'fence' | 'plan' | 'share'; row: OwnerRow } | null;
  mapLoaded: boolean;
  mapSelected: boolean;
  center: { longitude: number; latitude: number } | null;
  radius: number;
  mapZoom: number;
  get: (k: OwnerRead) => OwnerRow;
  has: (k: OwnerRead) => boolean;
  list: (k: OwnerRead) => OwnerRow[];
  active: () => boolean;
  supported: (code: string) => boolean;
  phoneKeys: () => OwnerRow[];
  read: (k: OwnerRead, args?: Record<string, string>) => Promise<unknown>;
  load: (keys: OwnerRead[]) => Promise<void>;
  render: () => void;
  mutate: (
    title: string,
    from: string,
    to: string,
    write: () => Promise<unknown>,
    readKey: OwnerRead,
    matches: (v: unknown) => boolean | null,
    danger?: boolean,
  ) => Promise<void>;
  times: (
    title: string,
    start: string,
    end: string,
    done: (start: string, end: string) => void,
  ) => void;
  drawMap: () => void;
  readMatch: (v: unknown, key: string, target: unknown) => boolean | null;
  click: (event: Event) => Promise<void>;
  ownerKeys: (event: Event) => Promise<void>;
  ownerFences: (event: Event) => Promise<void>;
  ownerPlans: (event: Event) => Promise<void>;
  ownerSharing: (event: Event) => Promise<void>;
  savePlan: (r: OwnerRow) => Promise<void>;
  loadDetail: (id: string) => Promise<void>;
  initial: () => Promise<void>;
  monthChanged: (event: Event) => void;
  change: (event: Event) => void;
}
