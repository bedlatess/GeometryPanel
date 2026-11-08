import { mountCaptcha } from '../../app/captcha';
import { loginVehicleList } from '../../app/sheet-model';
import { rememberVehicleArt } from '../../app/vehicle-art';
type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { accountSession } from '../../core/accounts';
import { type VehicleList } from '../../core/model';
import { updateAccounts } from '../../core/vault';

import { storagePrefix } from '../../core/scope';

import { nextTick } from 'vue';

import { UserMessage, type RuntimeContext } from './context';
export function registerlogin(ctx: RuntimeContext) {
  ctx.showPhone = function () {
    ctx.pending = null;
    ctx.show('手机号', { kind: 'phone' });
  };
  ctx.showTokenLogin = function () {
    const uid = ctx.updatingAccountId
      ? (ctx.accountBook.accounts.find((a) => a.id === ctx.updatingAccountId)?.uid ?? '')
      : '';
    ctx.show('登录', { kind: 'token', uid });
  };
  ctx.secondsRemaining = function () {
    let deadline = ctx.cooldowns.get(ctx.phone) ?? 0;
    try {
      deadline = Math.max(
        deadline,
        Number(sessionStorage.getItem(`${storagePrefix}sms:${ctx.phone}`)) || 0,
      );
    } catch {}
    return Math.max(0, Math.ceil((Math.min(deadline, Date.now() + 60000) - Date.now()) / 1000));
  };
  ctx.startCooldown = function () {
    const deadline = Date.now() + 60000;
    ctx.cooldowns.set(ctx.phone, deadline);
    try {
      sessionStorage.setItem(`${storagePrefix}sms:${ctx.phone}`, String(deadline));
    } catch {}
  };
  ctx.updateCooldown = function () {
    const button = ctx.modal.querySelector<HTMLButtonElement>('[data-action="resend"]');
    if (!button) return;
    const seconds = ctx.secondsRemaining();
    button.disabled = ctx.busy || seconds > 0;
    button.textContent = seconds ? `${seconds} 秒后重新获取` : '重新获取验证码';
  };
  ctx.showCode = function (_sent = true) {
    ctx.show('短信验证码', { kind: 'code' });
    ctx.updateCooldown();
  };
  ctx.fetchCaptcha = async function () {
    if (ctx.secondsRemaining()) {
      ctx.showCode(false);
      return;
    }
    ctx.show('图形验证码', { kind: 'captcha', ready: false });
    await ctx.run(async (signal, current) => {
      const captcha = await ctx.api.captcha(ctx.phone, signal);
      if (!current()) return;
      ctx.show('图形验证码', { kind: 'captcha', ready: true });
      await nextTick();
      await mountCaptcha(ctx.modal.querySelector('canvas')!, captcha, (track) => {
        void ctx.run(async (codeSignal, isCurrent) => {
          ctx.startCooldown();
          ctx.showCode(false);
          await ctx.api.sendCode(ctx.phone, captcha, track, codeSignal);
          if (!isCurrent()) return;
          ctx.showCode();
        });
      });
    });
  };
  ctx.listBody = function (result: VehicleList | null) {
    return loginVehicleList(result, ctx.session?.vehicle.vin);
  };
  ctx.retrieveCars = async function (signal: AbortSignal, current: () => boolean) {
    const account = ctx.pending;
    if (!account) return;
    ctx.show('选择车辆', ctx.listBody(null));
    try {
      const result = await ctx.api.list(account.token, signal);
      if (!current() || ctx.pending !== account) return;
      if (ctx.updatingAccountId) {
        const old = ctx.accountBook.accounts.find((a) => a.id === ctx.updatingAccountId);
        if (!old || old.uid !== account.uid) throw new UserMessage('账号不一致');
        ctx.accountBook = await updateAccounts((book) => {
          const a = book.accounts.find((x) => x.id === old.id);
          if (!a || a.token !== old.token) throw new Error('changed');
          a.token = account.token;
          a.epoch++;
          a.enabled = true;
          return book;
        });
        ctx.session = accountSession(ctx.accountBook);
        await ctx.synchronizeAccounts();
        ctx.pending = null;
        ctx.updatingAccountId = null;
        ctx.notice = '已更新';
        ctx.modal.close();
        ctx.pageKey = '';
        ctx.render();
        return;
      }
      ctx.pending.vehicles = result.vehicles;
      rememberVehicleArt(result.vehicles);
      ctx.show('选择车辆', ctx.listBody(result));
    } catch (error) {
      if (current()) ctx.show('选择车辆', { kind: 'vehicles', error: true });
      throw error;
    }
  };
}
