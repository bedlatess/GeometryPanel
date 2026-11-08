import type { Context } from './context';
export function register(ctx: Context) {
  ctx.render = function () {
    if (ctx.alive)
      ctx.options.publish({
        expired: ctx.expired,
        busy: ctx.busy,
        error: ctx.error,
        note: ctx.note,
        month: ctx.month,
        day: ctx.day,
        trackPage: ctx.trackPage,
        alertPage: ctx.alertPage,
        monthly: ctx.monthly,
        tracks: ctx.tracks,
        tires: ctx.tires,
        alerts: ctx.alerts,
        settings: ctx.settings,
        messageTab: ctx.messageTab,
        roadMaps: [...ctx.roadMaps],
      });
  };
}
