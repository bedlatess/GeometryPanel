import type { RuntimeContext } from './context';
export function registerPublish(ctx: RuntimeContext) {
  ctx.render = function () {
    ctx.publish({
      session: ctx.session,
      accountBook: ctx.accountBook,
      reading: ctx.reading,
      preview: ctx.preview,
      busy: ctx.busy,
      booting: ctx.booting,
      committing: ctx.committing,
      activeControl: ctx.activeControl,
      expired: ctx.expired,
      updateReady: ctx.updateReady,
      updating: ctx.updating,
      nativeSyncPending: ctx.nativeSyncPending,
      notice: ctx.notice,
      homeUnread: ctx.homeUnread,
      preferences: ctx.preferences,
      leverPhase: ctx.leverPhase,
      leverTarget: ctx.leverTarget,
      developer: ctx.developer,
      pending: ctx.pending,
      phone: ctx.phone,
      checkingUpdate: ctx.checkingUpdate,
      mapVisible: ctx.mapVisible,
      nativeAvailable: ctx.native.available,
      android: Boolean((window as any).GeometryNative),
      secondsRemaining: ctx.secondsRemaining(),
      lastCommandReport: ctx.lastCommandReport,
      sheet: ctx.currentSheet,
    });
    if (ctx.notice && ctx.notice !== ctx.shownNotice) {
      ctx.shownNotice = ctx.notice;
      clearTimeout(ctx.noticeTimer);
      ctx.noticeTimer = setTimeout(() => {
        ctx.notice = '';
        ctx.shownNotice = '';
        ctx.render();
      }, 2500);
    }
  };
}
