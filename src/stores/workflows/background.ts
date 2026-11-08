import { type AccountBook } from '../../core/accounts';
import {
  nativeAccountsAuthorized,
  notificationDefaults,
  readBackgroundPreferences,
} from '../../core/background';
import { demoVehicle, type Snapshot } from '../../core/model';
import { type NativeCapabilities, type NativeClient } from '../../core/native';
import { storagePrefix } from '../../core/scope';
import { type PageActions } from '../workflow-actions';
import { register as call } from './background/call';
import { register as change } from './background/change';
import { register as click } from './background/click';
import type { Context } from './background/context';
import { register as filteredItems } from './background/filteredItems';
import { register as loadDesktop } from './background/loadDesktop';
import { register as loadHistory } from './background/loadHistory';
import { register as render } from './background/render';
import { register as saveDesktop } from './background/saveDesktop';
import { register as task } from './background/task';
export function mountBackground(
  host: HTMLElement,
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
  },
) {
  const ctx = { host, options } as Context;
  loadDesktop(ctx);
  saveDesktop(ctx);
  filteredItems(ctx);
  render(ctx);
  loadHistory(ctx);
  task(ctx);
  call(ctx);
  click(ctx);
  change(ctx);
  ({ native: ctx.native, book: ctx.book, demo: ctx.demo } = ctx.options);
  ctx.controller = new AbortController();
  ctx.disposed = false;
  ctx.working = false;
  ctx.message = '';
  ctx.section = ctx.options.initial ?? 'monitor';
  ctx.caps = null;
  ctx.status = null;
  ctx.kind = 'battery';
  ctx.items = [];
  ctx.total = 0;
  ctx.confirmingClear = false;
  ctx.selected = ctx.book.selectedVehicleId ?? '';
  ctx.style = '2x2';
  ctx.controls = false;
  ctx.monitorEnabled = false;
  ctx.updateAvailable = false;
  ctx.range = '24h';
  ctx.startTime = '';
  ctx.endTime = '';
  ctx.preferences = ctx.demo
    ? { notifications: { ...notificationDefaults }, lowBatteryThreshold: 20 }
    : readBackgroundPreferences();
  ctx.vehicles = ctx.demo
    ? [{ id: 'demo-vehicle', vin: demoVehicle.vin, label: demoVehicle.name, accountLabel: '演示' }]
    : ctx.book.accounts.flatMap((account) =>
        account.vehicles.map((car) => ({ ...car, accountLabel: account.label })),
      );
  if (!ctx.vehicles.some((car) => car.id === ctx.selected))
    ctx.selected = ctx.vehicles[0]?.id ?? '';
  ctx.feature = (name: keyof NativeCapabilities['features']) =>
    ctx.native.available && ctx.caps?.features[name] === true;
  ctx.enabled = () => !ctx.demo && !ctx.working && Boolean(ctx.selected);
  ctx.useNativeHistory = () => ctx.feature('history') && nativeAccountsAuthorized();
  ctx.desktopKey = `${storagePrefix}desktop-preferences`;
  ctx.host.addEventListener('click', (event) => {
    const b = (event.target as Element).closest<HTMLElement>(
      '[data-history-period],[data-widget-size]',
    );
    if (b && !ctx.working) {
      if (b.dataset.historyPeriod) ctx.range = b.dataset.historyPeriod;
      if (b.dataset.widgetSize) ctx.style = b.dataset.widgetSize;
      ctx.render();
    }
  });
  ctx.host.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-history-kind]');
    if (button && !ctx.working) {
      ctx.kind = button.dataset.historyKind as typeof ctx.kind;
      void ctx.task(ctx.loadHistory);
    }
  });
  ctx.host.addEventListener('click', ctx.click);
  ctx.host.addEventListener('change', ctx.change);
  ctx.loadDesktop();
  ctx.render();
  if (!ctx.demo)
    void ctx.task(async () => {
      if (ctx.native.available) {
        ctx.caps = await ctx.call('capabilities');
        if (ctx.feature('background')) ctx.status = await ctx.call('background.status');
        ctx.monitorEnabled = ctx.status?.enabled === true;
      }
      if (ctx.section === 'history') await ctx.loadHistory();
    });
  return () => {
    ctx.disposed = true;
    ctx.controller.abort();
    ctx.host.removeEventListener('click', ctx.click);
    ctx.host.removeEventListener('change', ctx.change);
  };
}
