import { widgetSnapshot } from '../../app/widget-snapshot';
type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { recordLocalHistory } from '../../core/history-store';
import { type Session, type Snapshot } from '../../core/model';
import { loadAccounts, saveSession } from '../../core/vault';

import { UserMessage, type RuntimeContext } from './context';
export function registervehicle(ctx: RuntimeContext) {
  ctx.refresh = async function () {
    if (ctx.preview) {
      ctx.notice = '已更新';
      ctx.render();
      return;
    }
    if (!ctx.session || ctx.expired) return;
    const bound = ctx.session;
    ctx.lastReadAttempt = Date.now();
    await ctx.run(
      async (signal, current) => {
        const data = await ctx.api.read(bound, signal);
        if (current() && ctx.session === bound) {
          ctx.reading = data;
          ctx.notice = '已更新';
          ctx.confirmLever(data);
          ctx.syncWidget(bound, data);
        }
      },
      { bound },
    );
  };
  ctx.selectVehicle = async function (index: number) {
    if (!ctx.pending?.vehicles[index]) return;
    const candidate: Session = {
      token: ctx.pending.token,
      uid: ctx.pending.uid,
      vehicle: ctx.pending.vehicles[index],
    };
    const cars = ctx.pending.vehicles;
    await ctx.run(
      async (signal, current) => {
        ctx.committing = true;
        const closeButton = ctx.modal.querySelector<HTMLButtonElement>('[data-action="close"]');
        if (closeButton) closeButton.disabled = true;
        try {
          if (ctx.native.available) await ctx.native.call('forgetVehicle', {}, signal);
          await saveSession(candidate, cars);
          ctx.accountBook = await loadAccounts();
        } catch {
          throw new UserMessage('保存失败，请重试');
        } finally {
          ctx.committing = false;
        }
        if (!current()) return;
        ctx.session = candidate;
        ctx.reading = null;
        ctx.lastCommandReport = null;
        ctx.resetLever();
        ctx.preview = ctx.expired = false;
        ctx.pending = null;
        await ctx.synchronizeAccounts();
        ctx.notice = '正在加载';
        ctx.modal.close();
        ctx.router.navigate('/' + ctx.preferences.startPage);
        ctx.render();
        ctx.lastReadAttempt = Date.now();
        const data = await ctx.api.read(candidate, signal);
        if (current()) {
          ctx.reading = data;
          ctx.notice = '已更新';
          ctx.syncWidget(candidate, data);
        }
      },
      { bound: candidate },
    );
  };
  ctx.syncWidget = function (bound: Session, data: Snapshot) {
    if (ctx.native.available && ctx.session === bound && !ctx.expired && !ctx.preview)
      void ctx.native
        .call('widget.update', {
          ...widgetSnapshot(bound, data),
          vehicleId: ctx.accountBook.selectedVehicleId,
        })
        .catch(() => {});
    if (ctx.session === bound && !ctx.expired && !ctx.preview && ctx.accountBook.selectedVehicleId)
      void recordLocalHistory(ctx.accountBook.selectedVehicleId, data).catch(() => {
        ctx.notice = '保存失败，请重试';
        ctx.render();
      });
  };
  ctx.confirmLever = function (data: Snapshot) {
    if (
      (ctx.leverPhase === 'pending' || ctx.leverPhase === 'error') &&
      data.daily.reportState === 'fresh' &&
      (data.daily.reportedAt ?? 0) > ctx.leverStarted &&
      data.daily.vehicleLocked === (ctx.leverTarget === 'powerOff')
    ) {
      clearTimeout(ctx.leverTimer);
      ctx.leverPhase = 'success';
      ctx.leverTimer = setTimeout(() => {
        ctx.leverPhase = 'idle';
        ctx.render();
      }, 1200);
    }
  };
  ctx.resetLever = function () {
    clearTimeout(ctx.leverTimer);
    ctx.leverPhase = 'idle';
    ctx.leverStarted = 0;
  };
}
