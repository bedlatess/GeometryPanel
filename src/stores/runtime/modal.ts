type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { tokenCredentials } from '../../core/owner-model';

import { ApiError } from '../../api/client';
import { type Session } from '../../core/model';

import { importPreferences } from '../../app/home-layout';

import { UserMessage, type RuntimeContext } from './context';
export function registermodal(ctx: RuntimeContext) {
  ctx.show = function (title: string, body: any) {
    if (!ctx.modal.open) {
      const opener =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLButtonElement>('button[data-action]')
          : null;
      ctx.modalReturnFocus = opener?.dataset.action
        ? { action: opener.dataset.action, value: opener.dataset.value }
        : null;
    }
    ctx.disposePanel?.();
    ctx.disposePanel = undefined;
    ctx.sheetListener = undefined;
    ctx.commandTarget = null;
    ctx.commandIntent = null;
    ctx.currentSheet = { title, body };
    if (!ctx.modal.open) ctx.modal.showModal();
    if (ctx.busy)
      ctx.modal
        .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
          'button:not([data-action="close"]),input',
        )
        .forEach((element) => (element.disabled = true));
    ctx.render();
  };
  ctx.close = function () {
    if (ctx.committing) return;
    ctx.disposePanel?.();
    ctx.disposePanel = undefined;
    ctx.sheetListener = undefined;
    if (ctx.busy) {
      ctx.aborter?.abort();
      ctx.generation++;
      ctx.busy = false;
      if (ctx.activeControl) {
        ctx.notice = '已发出，结果待确认';
        if (ctx.leverPhase === 'sending') ctx.leverPhase = 'error';
      }
      ctx.activeControl = false;
    }
    ctx.pending = null;
    ctx.updatingAccountId = null;
    ctx.commandTarget = null;
    ctx.commandIntent = null;
    ctx.modal.close();
    ctx.modal.replaceChildren();
    ctx.render();
    const target = ctx.modalReturnFocus;
    ctx.modalReturnFocus = null;
    const restoreFocus = () => {
      if (target && !ctx.modal.open)
        Array.from(ctx.content.querySelectorAll<HTMLButtonElement>('button[data-action]'))
          .find(
            (button) =>
              button.dataset.action === target.action &&
              button.dataset.value === target.value &&
              !button.disabled,
          )
          ?.focus({ preventScroll: true });
    };
    restoreFocus();
    // WebKit may finish its native dialog focus restoration after cancel dispatch.
    requestAnimationFrame(restoreFocus);
  };
  ctx.run = async function (
    task: (signal: AbortSignal, current: () => boolean) => Promise<void>,
    options: {
      bound?: Session;
      control?: boolean;
    } = {},
  ) {
    if (ctx.busy || ctx.booting || ctx.updating) return;
    if (!navigator.onLine && !options.control && options.bound) {
      ctx.notice = '网络不可用';
      ctx.render();
      return;
    }
    ctx.busy = true;
    const epoch = ++ctx.generation;
    ctx.aborter = new AbortController();
    ctx.activeControl = Boolean(options.control);
    if (ctx.activeControl) ctx.notice = '正在发送';
    const signal = ctx.aborter.signal;
    ctx.render();
    ctx.modal
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
        'button:not([data-action="close"]),input',
      )
      .forEach((element) => (element.disabled = true));
    const progress = ctx.modal.querySelector('#modal-message');
    if (progress) progress.textContent = '正在加载';
    try {
      await task(signal, () => epoch === ctx.generation && !signal.aborted);
    } catch (error) {
      if (epoch !== ctx.generation || signal.aborted) return;
      if (
        error instanceof ApiError &&
        error.kind === 'expired' &&
        options.bound &&
        ctx.session === options.bound
      ) {
        ctx.expired = true;
        void ctx.disableExpiredAccount(options.bound);
        if (ctx.native.available) void ctx.native.call('forgetVehicle').catch(() => {});
      }
      ctx.notice =
        error instanceof ApiError && error.kind === 'expired'
          ? '登录已过期'
          : options.control
            ? '未收到车辆响应'
            : error instanceof UserMessage
              ? error.message
              : '加载失败';
      if (options.control && ctx.leverPhase === 'sending') ctx.leverPhase = 'error';
      if (error instanceof ApiError && error.kind === 'expired' && ctx.pending) {
        ctx.pending = null;
        ctx.showPhone();
      }
      const message = ctx.modal.open ? ctx.modal.querySelector('#modal-message') : null;
      if (message) message.textContent = ctx.notice;
    } finally {
      if (epoch === ctx.generation) {
        ctx.busy = false;
        ctx.activeControl = false;
        ctx.render();
        ctx.modal
          .querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')
          .forEach((element) => (element.disabled = false));
        if (ctx.expired)
          ctx.modal
            .querySelectorAll<HTMLButtonElement>(
              '[data-action="send-horn"],[data-action="send-horn-high"],[data-a' +
                'ction="send-control"]',
            )
            .forEach((element) => (element.disabled = true));
        ctx.updateCooldown();
      }
    }
  };
  ctx.handleSubmit = function (event: SubmitEvent) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (!form.reportValidity()) return;
    if (form.id === 'preferences-form') {
      try {
        ctx.preferences = importPreferences(
          ctx.modal.querySelector<HTMLTextAreaElement>('#preferences-import')!.value,
          ctx.preview,
        );
        ctx.notice = '已导入';
        ctx.applyPreferences();
        ctx.close();
      } catch {
        ctx.notice = '配置格式不正确';
        ctx.render();
      }
      return;
    }
    if (form.id === 'token-form') {
      const raw = ctx.modal.querySelector<HTMLInputElement>('#login-secret')!.value,
        uid = ctx.modal.querySelector<HTMLInputElement>('#login-uid')!.value;
      ctx.modal.querySelector<HTMLInputElement>('#login-secret')!.value = '';
      let credentials: {
        token: string;
        uid: string;
      };
      try {
        credentials = tokenCredentials(raw, uid);
      } catch (e) {
        ctx.notice =
          e instanceof Error && e.message === 'uid' ? '请填写账号 ID' : 'token 无效或已过期';
        ctx.render();
        return;
      }
      void ctx.run(async (signal, current) => {
        ctx.pending = { ...credentials, vehicles: [] };
        try {
          await ctx.retrieveCars(signal, current);
        } catch {
          throw new UserMessage('token 无效或已过期');
        }
      });
      return;
    }
    if (form.id === 'phone-form') {
      ctx.phone = ctx.modal.querySelector<HTMLInputElement>('#phone')!.value.trim();
      void ctx.fetchCaptcha();
    }
    if (form.id === 'code-form') {
      const code = ctx.modal.querySelector<HTMLInputElement>('#code')!.value.trim();
      void ctx.run(async (signal, current) => {
        const account = await ctx.api.login(ctx.phone, code, signal);
        if (!current()) return;
        ctx.pending = { ...account, vehicles: [] };
        await ctx.retrieveCars(signal, current);
      });
    }
  };
}
