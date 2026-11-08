import type { Context } from './context';
export function register(ctx: Context) {
  ctx.render = function () {
    if (!ctx.active()) return;
    ctx.o.publish({
      data: { ...ctx.data },
      busy: ctx.busy,
      note: ctx.note,
      failed: ctx.failed,
      month: ctx.month,
      period: ctx.period,
      shareTab: ctx.shareTab,
      pendingPlan: ctx.pendingPlan,
      ownIdentity: ctx.ownIdentity,
      identityReady: ctx.identityReady,
      editor: ctx.editor,
      mapLoaded: ctx.mapLoaded,
      mapSelected: ctx.mapSelected,
      center: ctx.center,
      radius: ctx.radius,
      mapZoom: ctx.mapZoom,
    });
  };
}
