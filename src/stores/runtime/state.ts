type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { VehicleControls } from '../../api/controls';
import { ZeehoApi } from '../../api/zeeho';
import { emptyAccounts } from '../../core/accounts';
import { demoVehicle } from '../../core/model';

import { type CommandMode } from '../../core/command-report';
import { storagePrefix } from '../../core/scope';

import { connectNative, NativeClient } from '../../core/native';
import { readPreferences } from '../../core/preferences';

import { type RuntimeContext } from './context';
export function initializeState(ctx: RuntimeContext) {
  ctx.currentSheet = null;
  ctx.api = new ZeehoApi();
  ctx.controls = new VehicleControls();
  ctx.native = connectNative(window);
  ctx.modalReturnFocus = null;
  ctx.session = null;
  ctx.accountBook = emptyAccounts();
  ctx.nativeSyncPending = false;
  ctx.pendingNativeShortcut = null;
  ctx.reading = null;
  ctx.preview = false;
  ctx.busy = false;
  ctx.booting = true;
  ctx.committing = false;
  ctx.activeControl = false;
  ctx.expired = false;
  ctx.generation = 0;
  ctx.updateReady = false;
  ctx.updating = false;
  ctx.lastReadAttempt = 0;
  ctx.pageKey = '';
  ctx.toolbarBody = '';
  ctx.mapVisible = false;
  ctx.versionTaps = 0;
  ctx.developer = false;
  ctx.noNative = new NativeClient(null);
  ctx.hadRoute = location.hash.startsWith('#/');
  ctx.router = {
    get path() {
      const value = ctx.navigation.currentRoute.value.path;
      if (value === '/vehicle/status/firmware') return '/vehicle/firmware';
      if (value.startsWith('/records/ride/')) return value.replace('/ride/', '/rides/');
      return value;
    },
    get root() {
      return ctx.navigation.currentRoute.value.path.split('/')[1];
    },
    navigate(path: string, replace = false) {
      if (ctx.modal.open) ctx.close();
      void ctx.navigation[replace ? 'replace' : 'push'](path);
    },
    back() {
      if (ctx.modal.open) ctx.close();
      else ctx.navigation.back();
    },
  };
  ctx.notice = '';
  ctx.homeUnread = false;
  ctx.shownNotice = '';
  ctx.realPreferences = null;
  ctx.leverPhase = 'idle';
  ctx.leverTarget = 'powerOn';
  ctx.leverStarted = 0;
  ctx.aborter = null;
  ctx.pending = null;
  ctx.lastCommandReport = null;
  ctx.commandTarget = null;
  ctx.commandIntent = null;
  ctx.phone = '';
  ctx.updatingAccountId = null;
  ctx.cacheReady = Boolean(navigator.serviceWorker?.controller);
  ctx.checkingUpdate = false;
  ctx.lastUpdateCheck = 0;
  ctx.cooldowns = new Map<string, number>();
  ctx.preferences = readPreferences(`${storagePrefix}preferences`);
  ctx.escape = (value: unknown) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
    );
  ctx.vehicle = () => (ctx.preview ? demoVehicle : ctx.session?.vehicle);
  ctx.isHorn = (mode: CommandMode) => mode === 'normal' || mode === 'high';
  ctx.actions = {
    sheet(title, body, clicked) {
      ctx.show(title, body);
      ctx.sheetListener = clicked;
    },
    toolbar() {},
    closeSheet: () => ctx.close(),
    navigate: (path) => ctx.router.navigate(path),
    toast: (text) => {
      ctx.notice = text;
      ctx.render();
    },
  };
  ctx.sheetPointer = null;
  ctx.updateTextSize = () => {
    document.documentElement.dataset.largeText = String(
      parseFloat(getComputedStyle(document.documentElement).fontSize) >= 24,
    );
  };
  ctx.foreground = function () {
    if (document.visibilityState !== 'visible') return;
    ctx.render();
    if (navigator.onLine && Date.now() - ctx.lastUpdateCheck > 60000) {
      ctx.lastUpdateCheck = Date.now();
      void ctx.updates?.check();
    }
    if (
      ctx.preferences.foregroundRefresh &&
      !ctx.busy &&
      !ctx.booting &&
      !ctx.modal.open &&
      navigator.onLine &&
      Date.now() - ctx.lastReadAttempt > 60000
    )
      void ctx.refresh();
  };
}
