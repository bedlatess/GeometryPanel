import type { PageActions } from '../runtime-actions';
type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { VehicleControls, type VehicleAction } from '../../api/controls';
import { ZeehoApi } from '../../api/zeeho';
import { type AccountBook } from '../../core/accounts';
import { type Session, type Snapshot, type Vehicle, type VehicleList } from '../../core/model';

import { type CommandMode, type CommandReport } from '../../core/command-report';
import { installUpdates } from '../../core/updates';

import type { Router } from 'vue-router';

import { NativeClient } from '../../core/native';

import type { Preferences } from '../../core/preferences';
export interface RuntimeContext {
  content: HTMLElement;
  modal: HTMLDialogElement;
  navigation: Router;
  publish: (state: any) => void;
  currentSheet: { title: string; body: any } | null;
  api: ZeehoApi;
  controls: VehicleControls;
  native: NativeClient;
  disposePanel: (() => void) | undefined;
  modalReturnFocus: { action: string; value?: string } | null;
  session: Session | null;
  accountBook: AccountBook;
  nativeSyncPending: boolean;
  pendingNativeShortcut: {
    vehicleId: string;
    action: 'refresh' | 'unlock' | 'lock' | 'horn' | 'seat';
  } | null;
  reading: Snapshot | null;
  preview: boolean;
  busy: boolean;
  booting: boolean;
  committing: boolean;
  activeControl: boolean;
  expired: boolean;
  generation: number;
  updateReady: boolean;
  updating: boolean;
  lastReadAttempt: number;
  updates: ReturnType<typeof installUpdates> | undefined;
  disposePage: (() => void) | undefined;
  pageKey: string;
  toolbarBody: string;
  toolbarClick: ((button: HTMLElement) => void) | undefined;
  sheetListener: ((button: HTMLElement) => void) | undefined;
  mapVisible: boolean;
  versionTaps: number;
  developer: boolean;
  noNative: NativeClient;
  hadRoute: boolean;
  router: {
    readonly path: string;
    readonly root: string;
    navigate(path: string, replace?: boolean): void;
    back(): void;
  };
  notice: string;
  homeUnread: boolean;
  noticeTimer: NodeJS.Timeout | undefined;
  shownNotice: string;
  realPreferences: Preferences | null;
  leverPhase: LeverPhase;
  leverTarget: 'powerOn' | 'powerOff';
  leverTimer: NodeJS.Timeout | undefined;
  leverStarted: number;
  aborter: AbortController | null;
  pending: { token: string; uid: string; vehicles: Vehicle[] } | null;
  lastCommandReport: CommandReport | null;
  commandTarget: Session | null;
  commandIntent: 'horn' | VehicleAction | null;
  phone: string;
  updatingAccountId: string | null;
  cacheReady: boolean;
  checkingUpdate: boolean;
  lastUpdateCheck: number;
  cooldowns: Map<string, number>;
  preferences: Preferences;
  applyPreferences: (save?: boolean) => void;
  escape: (value: unknown) => string;
  vehicle: () => Vehicle | undefined;
  isHorn: (mode: CommandMode) => mode is 'normal' | 'high';
  reportButton: () => string;
  actions: PageActions;
  render: () => void;
  show: (title: string, body: any) => void;
  close: () => void;
  run: (
    task: (signal: AbortSignal, current: () => boolean) => Promise<void>,
    options?: { bound?: Session; control?: boolean },
  ) => Promise<void>;
  showPhone: () => void;
  openStorage: () => Promise<void>;
  showTokenLogin: () => void;
  showAccountBackup: (exporting: boolean) => void;
  secondsRemaining: () => number;
  startCooldown: () => void;
  updateCooldown: () => void;
  showCode: (_sent?: boolean) => void;
  fetchCaptcha: () => Promise<void>;
  listBody: (result: VehicleList | null) => any;
  retrieveCars: (signal: AbortSignal, current: () => boolean) => Promise<void>;
  refresh: () => Promise<void>;
  selectVehicle: (index: number) => Promise<void>;
  syncWidget: (bound: Session, data: Snapshot) => void;
  synchronizeAccounts: () => Promise<void>;
  activateSavedVehicle: (vehicleId: string) => Promise<void>;
  forgetSavedAccount: (accountId: string) => Promise<void>;
  panelExpired: () => void;
  disableExpiredAccount: (bound: Session) => Promise<void>;
  changeSavedAccounts: (next: AccountBook, before: AccountBook) => Promise<void>;
  importOfficialAccount: (value: unknown) => Promise<void>;
  beginCommand: (mode: CommandMode) => void;
  presentControl: (mode: VehicleAction, drag?: boolean) => void;
  confirmLever: (data: Snapshot) => void;
  resetLever: () => void;
  handleAction: (event: MouseEvent) => void;
  downloadText: (text: string, name: string) => void;
  copyPreferences: () => void;
  sheetPointer: { id: number; y: number } | null;
  handleSubmit: (event: SubmitEvent) => void;
  updateTextSize: () => void;
  foreground: () => void;
  presentNativeShortcut: () => void;
  continueNativeShortcut: () => Promise<void>;
  action: (action: string, value?: string, attributes?: Record<string, string>) => void;
}
export class UserMessage extends Error {}
