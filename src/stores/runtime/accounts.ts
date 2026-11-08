type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import {
  accountSession,
  changeAccountPreferences,
  removeAccount,
  type AccountBook,
} from '../../core/accounts';
import { nativeAccountsAuthorized, syncNativeAccounts } from '../../core/background';
import { clearLocalHistory } from '../../core/history-store';
import { type Session } from '../../core/model';
import { updateAccounts } from '../../core/vault';

import { clearTaskConfig } from '../../core/tasks-store';

import { UserMessage, type RuntimeContext } from './context';
export function registeraccounts(ctx: RuntimeContext) {
  ctx.synchronizeAccounts = async function () {
    try {
      await syncNativeAccounts(ctx.native, ctx.accountBook);
      ctx.nativeSyncPending = false;
    } catch {
      ctx.nativeSyncPending = true;
    }
  };
  ctx.activateSavedVehicle = async function (vehicleId: string) {
    const candidate = accountSession(ctx.accountBook, vehicleId);
    if (!candidate) return;
    await ctx.run(
      async (signal, current) => {
        ctx.committing = true;
        try {
          if (ctx.native.available) await ctx.native.call('forgetVehicle', {}, signal);
          ctx.accountBook = await updateAccounts((book) => {
            const latest = accountSession(book, vehicleId);
            if (!latest || latest.token !== candidate.token) throw new Error('storage_changed');
            book.selectedVehicleId = vehicleId;
            return book;
          });
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
        ctx.disposePanel?.();
        ctx.disposePanel = undefined;
        ctx.modal.close();
        ctx.router.navigate('/' + ctx.preferences.startPage);
        ctx.render();
        ctx.lastReadAttempt = Date.now();
        const data = await ctx.api.read(candidate, signal);
        if (current() && ctx.session === candidate) {
          ctx.reading = data;
          ctx.notice = '已更新';
          ctx.syncWidget(candidate, data);
        }
      },
      { bound: candidate },
    );
    if (ctx.accountBook.selectedVehicleId !== vehicleId) return;
  };
  ctx.forgetSavedAccount = async function (accountId: string) {
    await ctx.run(async (_signal, current) => {
      ctx.committing = true;
      try {
        if (ctx.native.available && nativeAccountsAuthorized())
          await ctx.native.call('accounts.remove', { accountId });
        if (ctx.native.available) await ctx.native.call('forgetVehicle');
        const removedCars =
          ctx.accountBook.accounts.find((item) => item.id === accountId)?.vehicles ?? [];
        ctx.accountBook = await updateAccounts((book) => removeAccount(book, accountId));
        for (const car of removedCars) await clearLocalHistory(car.id);
        await clearTaskConfig(accountId);
      } finally {
        ctx.committing = false;
      }
      if (!current()) return;
      ctx.session = accountSession(ctx.accountBook);
      ctx.reading = null;
      ctx.lastCommandReport = null;
      ctx.resetLever();
      ctx.expired = ctx.preview = false;
      await ctx.synchronizeAccounts();
      ctx.notice = '已移除此账号';
      ctx.render();
    });
    if (ctx.accountBook.accounts.some((item) => item.id === accountId)) throw new Error('storage');
  };
  ctx.panelExpired = function () {
    ctx.expired = true;
    ctx.notice = '登录已过期';
    if (ctx.modal.open) ctx.close();
    ctx.router.navigate('/vehicle');
    ctx.render();
    if (ctx.session) void ctx.disableExpiredAccount(ctx.session);
    if (ctx.native.available) void ctx.native.call('forgetVehicle').catch(() => {});
  };
  ctx.disableExpiredAccount = async function (bound: Session) {
    try {
      ctx.accountBook = await updateAccounts((book) => {
        const account = book.accounts.find(
          (item) => item.uid === bound.uid && item.token === bound.token,
        );
        if (account?.enabled) {
          account.enabled = false;
          account.epoch++;
        }
        return book;
      });
      await ctx.synchronizeAccounts();
    } catch {
      ctx.nativeSyncPending = true;
      ctx.render();
    }
  };
  ctx.changeSavedAccounts = async function (next: AccountBook, before: AccountBook) {
    let saved = false;
    await ctx.run(async () => {
      ctx.committing = true;
      try {
        ctx.accountBook = await updateAccounts((book) =>
          changeAccountPreferences(book, before, next),
        );
        saved = true;
      } finally {
        ctx.committing = false;
      }
      await ctx.synchronizeAccounts();
    });
    if (!saved) throw new Error('storage');
  };
  ctx.importOfficialAccount = async function (value: unknown) {
    const data = value as {
      token?: unknown;
      uid?: unknown;
    } | null;
    if (
      !data ||
      typeof data.token !== 'string' ||
      !data.token ||
      data.token.length > 8192 ||
      /\s/.test(data.token) ||
      typeof data.uid !== 'string' ||
      !data.uid ||
      data.uid.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(data.uid)
    )
      throw new UserMessage('登录资料不完整');
    await ctx.run(async (signal, current) => {
      ctx.pending = { token: data.token as string, uid: data.uid as string, vehicles: [] };
      await ctx.retrieveCars(signal, current);
    });
  };
}
