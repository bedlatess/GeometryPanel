import { type BackgroundNotifications } from '../../../core/background';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.change = function (event: Event) {
    const input = event.target as HTMLInputElement;
    if (ctx.demo) return;
    if (input.dataset.historyKind) {
      ctx.kind = input.dataset.historyKind as typeof ctx.kind;
      void ctx.task(ctx.loadHistory);
      return;
    }
    if (
      input.dataset.backgroundNotification &&
      input.dataset.backgroundNotification in ctx.preferences.notifications
    )
      ctx.preferences.notifications[
        input.dataset.backgroundNotification as keyof BackgroundNotifications
      ] = input.checked;
    if ('backgroundThreshold' in input.dataset)
      ctx.preferences.lowBatteryThreshold = Math.max(
        5,
        Math.min(80, Math.round(Number(input.value)) || 20),
      );
    if ('backgroundVehicle' in input.dataset) {
      ctx.selected = input.value;
      ctx.loadDesktop();
      ctx.render();
      if (ctx.section === 'history') void ctx.task(ctx.loadHistory);
    }
    if ('backgroundStyle' in input.dataset) {
      ctx.style = input.value;
      ctx.render();
    }
    if ('backgroundControls' in input.dataset) {
      ctx.controls = input.checked;
      ctx.render();
    }
    if ('historyRange' in input.dataset) {
      ctx.range = input.value;
      ctx.startTime = ctx.endTime = '';
      ctx.render();
    }
    if ('historyFrom' in input.dataset) {
      ctx.startTime = input.value;
      ctx.render();
    }
    if ('historyUntil' in input.dataset) {
      ctx.endTime = input.value;
      ctx.render();
    }
  };
}
