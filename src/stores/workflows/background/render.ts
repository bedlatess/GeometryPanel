import { labels } from './shared';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.render = function () {
    if (ctx.disposed) return;
    ctx.options.publish({
      working: ctx.working,
      message: ctx.message,
      section: ctx.section,
      caps: ctx.caps,
      status: ctx.status,
      kind: ctx.kind,
      items: ctx.filteredItems(),
      total: ctx.total,
      selected: ctx.selected,
      style: ctx.style,
      controls: ctx.controls,
      monitorEnabled: ctx.monitorEnabled,
      updateAvailable: ctx.updateAvailable,
      range: ctx.range,
      startTime: ctx.startTime,
      endTime: ctx.endTime,
      preferences: ctx.preferences,
      vehicles: ctx.vehicles,
      labels,
    });
  };
}
