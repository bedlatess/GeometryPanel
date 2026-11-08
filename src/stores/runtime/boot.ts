import { writeHome } from '../../app/home-layout';
import { hornSheet } from '../../app/sheet-model';
type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { type VehicleAction } from '../../api/controls';
import { accountSession, emptyAccounts } from '../../core/accounts';
import { revokeNativeAccounts } from '../../core/background';
import { flushLocalHistory } from '../../core/history-store';
import { demoVehicle } from '../../core/model';
import { forgetSession, loadAccounts } from '../../core/vault';

import { clearTaskConfig } from '../../core/tasks-store';

import { installUpdates } from '../../core/updates';

import { defaultPreferences } from '../../core/preferences';

import { UserMessage, type RuntimeContext } from './context';
export function bootRuntime(ctx: RuntimeContext) {
  document.addEventListener('keydown', () => (document.documentElement.dataset.input = 'keyboard'));
  document.addEventListener(
    'pointerdown',
    () => (document.documentElement.dataset.input = 'pointer'),
    true,
  );
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () =>
    ctx.applyPreferences(false),
  );
  ctx.modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !ctx.modal.open) return;
    const items = Array.from(
      ctx.modal.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]'),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled,[hidden]') &&
        element.getClientRects().length > 0,
    );
    const first = items[0],
      last = items.at(-1);
    if (!first) {
      event.preventDefault();
      ctx.modal.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (
      (!event.shiftKey && document.activeElement === last) ||
      !ctx.modal.contains(document.activeElement)
    ) {
      event.preventDefault();
      first.focus();
    }
  });
  ctx.modal.addEventListener('cancel', (event) => {
    event.preventDefault();
    ctx.close();
  });
  ctx.modal.addEventListener('pointerdown', (event) => {
    if (!(event.target as Element).closest('.sheet-handle')) return;
    ctx.sheetPointer = { id: event.pointerId, y: event.clientY };
    ctx.modal.setPointerCapture(event.pointerId);
  });
  ctx.modal.addEventListener('pointermove', (event) => {
    if (!ctx.sheetPointer || ctx.sheetPointer.id !== event.pointerId) return;
    ctx.modal.style.transform = `translateY(${Math.max(0, event.clientY - ctx.sheetPointer.y)}px)`;
  });
  ctx.modal.addEventListener('pointerup', (event) => {
    if (!ctx.sheetPointer || ctx.sheetPointer.id !== event.pointerId) return;
    const distance = event.clientY - ctx.sheetPointer.y;
    ctx.sheetPointer = null;
    ctx.modal.style.removeProperty('transform');
    if (distance > 80) ctx.close();
  });
  ctx.modal.addEventListener('pointercancel', () => {
    ctx.sheetPointer = null;
    ctx.modal.style.removeProperty('transform');
  });
  ctx.modal.addEventListener('click', (event) => {
    const selected = (event.target as Element).closest<HTMLElement>('button');
    if (
      selected &&
      !selected.hasAttribute('disabled') &&
      selected.dataset.action !== 'close' &&
      ctx.sheetListener
    ) {
      ctx.sheetListener(selected);
      return;
    }
    if (event.target === ctx.modal) {
      const rect = ctx.modal.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        ctx.close();
        return;
      }
    }
    const mode = (event.target as Element).closest<HTMLButtonElement>('button[data-horn-mode]');
    if (mode) {
      const bound = ctx.commandTarget;
      ctx.show(
        '寻车',
        hornSheet(ctx.preview ? demoVehicle : bound!.vehicle, mode.dataset.hornMode),
      );
      ctx.commandTarget = bound;
      ctx.commandIntent = 'horn';
      return;
    }
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'close') ctx.close();
    if (
      ['status-export', 'command-report', 'route', 'storage'].includes(button.dataset.action ?? '')
    ) {
      ctx.handleAction(event);
      return;
    }
    if (button.dataset.action === 'saved-vehicle')
      void ctx.activateSavedVehicle(button.dataset.value!);
    if (button.dataset.action === 'send-horn-choice') {
      if (ctx.preview) {
        ctx.notice = '已发送鸣笛寻车';
        ctx.close();
      } else ctx.beginCommand(button.dataset.value === 'high' ? 'high' : 'normal');
    }
    if (button.dataset.action === 'demo-control') {
      ctx.close();
      ctx.leverPhase = 'sending';
      ctx.render();
      clearTimeout(ctx.leverTimer);
      ctx.leverTimer = setTimeout(() => {
        ctx.leverPhase = 'pending';
        ctx.render();
        ctx.leverTimer = setTimeout(() => {
          ctx.leverPhase = 'error';
          ctx.render();
        }, 15000);
      }, 700);
    }
    if (ctx.busy) return;
    if (button.dataset.action === 'start-value') {
      ctx.preferences.startPage = button.dataset.value as typeof ctx.preferences.startPage;
      ctx.applyPreferences();
      ctx.close();
    }
    if (button.dataset.action?.startsWith('shortcut-')) {
      ctx.preferences.shortcut = [...ctx.preferences.shortcut];
      ctx.preferences.shortcut[Number(button.dataset.action.slice(9))] = button.dataset
        .value as (typeof ctx.preferences.shortcut)[number];
      ctx.applyPreferences();
      ctx.close();
    }
    if (button.dataset.action === 'confirm-reset-preferences') {
      if (!ctx.preview) writeHome(null);
      ctx.preferences = structuredClone(defaultPreferences);
      ctx.notice = '已恢复默认';
      ctx.applyPreferences();
      ctx.close();
    }
    if (button.dataset.action === 'new-captcha') void ctx.fetchCaptcha();
    if (button.dataset.action === 'resend' && !ctx.secondsRemaining()) void ctx.fetchCaptcha();
    if (button.dataset.action === 'code') ctx.showCode(false);
    if (button.dataset.action === 'token-login') ctx.showTokenLogin();
    if (button.dataset.action === 'token-eye') {
      const i = ctx.modal.querySelector<HTMLInputElement>('#login-secret');
      if (i) {
        i.type = i.type === 'password' ? 'text' : 'password';
        button.setAttribute('aria-label', i.type === 'password' ? '显示登录信息' : '隐藏登录信息');
      }
    }
    if (button.dataset.action === 'phone') ctx.showPhone();
    if (button.dataset.action === 'retry-list')
      void ctx.run(ctx.retrieveCars, {
        bound: ctx.pending?.token === ctx.session?.token ? ctx.session! : undefined,
      });
    if (button.dataset.action === 'select') void ctx.selectVehicle(Number(button.dataset.value));
    if (button.dataset.action === 'send-horn') ctx.beginCommand('normal');
    if (button.dataset.action === 'send-horn-high') ctx.beginCommand('high');
    if (
      button.dataset.action === 'send-control' &&
      ['powerOn', 'powerOff', 'seat'].includes(button.dataset.value ?? '')
    )
      ctx.beginCommand(button.dataset.value as VehicleAction);
    if (button.dataset.action === 'native-shortcut-continue') void ctx.continueNativeShortcut();
    if (button.dataset.action === 'confirm-logout')
      void ctx.run(async (_signal, current) => {
        ctx.committing = true;
        const closeButton = ctx.modal.querySelector<HTMLButtonElement>('[data-action="close"]');
        if (closeButton) closeButton.disabled = true;
        try {
          await revokeNativeAccounts(ctx.native);
          if (ctx.native.available) await ctx.native.call('forgetVehicle');
          for (const account of ctx.accountBook.accounts) await clearTaskConfig(account.id);
          await flushLocalHistory();
          await forgetSession();
          ctx.accountBook = emptyAccounts();
          ctx.nativeSyncPending = false;
        } catch {
          throw new UserMessage('保存失败，请重试');
        } finally {
          ctx.committing = false;
        }
        if (!current()) return;
        ctx.session = null;
        ctx.reading = null;
        ctx.pending = null;
        ctx.lastCommandReport = null;
        ctx.resetLever();
        ctx.expired = ctx.preview = false;
        ctx.notice = '已退出全部账号';
        ctx.modal.close();
        ctx.router.navigate('/vehicle');
      });
  });
  ctx.modal.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'preferences-file' && input.files?.[0]) {
      const value = await input.files[0].text();
      const area = ctx.modal.querySelector<HTMLTextAreaElement>('#preferences-import');
      if (area) area.value = value;
    }
  });
  ctx.modal.addEventListener('submit', ctx.handleSubmit);
  ctx.content.addEventListener('submit', ctx.handleSubmit);
  ctx.applyPreferences(false);
  ctx.render();
  new MutationObserver(ctx.updateTextSize).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
  });
  window.addEventListener('resize', ctx.updateTextSize);
  ctx.updateTextSize();
  void loadAccounts()
    .then(async (book) => {
      ctx.accountBook = book;
      const saved = accountSession(book);
      ctx.session = saved;
      await ctx.synchronizeAccounts();
      if (saved && !ctx.hadRoute) ctx.router.navigate('/' + ctx.preferences.startPage, true);
      if (saved) ctx.notice = navigator.onLine ? '正在加载' : '网络不可用';
    })
    .catch(() => {
      ctx.notice = '登录已过期';
    })
    .finally(() => {
      ctx.booting = false;
      ctx.render();
      if (ctx.pendingNativeShortcut) ctx.presentNativeShortcut();
      else if (ctx.session && navigator.onLine) void ctx.refresh();
    });
  setInterval(() => {
    ctx.updateCooldown();
    ctx.render();
  }, 1000);
  window.addEventListener('offline', ctx.render);
  window.addEventListener('online', () => {
    ctx.render();
    ctx.foreground();
  });
  document.addEventListener('visibilitychange', ctx.foreground);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) ctx.foreground();
  });
  window.addEventListener('geometry:native-shortcut', ((event: CustomEvent<unknown>) => {
    const data = event.detail as Record<string, unknown> | null;
    if (
      !ctx.native.available ||
      !data ||
      typeof data.vehicleId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(data.vehicleId) ||
      !['refresh', 'unlock', 'lock', 'horn', 'seat'].includes(String(data.action))
    )
      return;
    ctx.pendingNativeShortcut = {
      vehicleId: data.vehicleId,
      action: data.action as NonNullable<typeof ctx.pendingNativeShortcut>['action'],
    };
    if (!ctx.booting && !ctx.busy && !ctx.committing && !ctx.updating) ctx.presentNativeShortcut();
  }) as EventListener);
  (
    window as unknown as {
      __geometryNativeShortcutReady: boolean;
    }
  ).__geometryNativeShortcutReady = true;
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    ctx.updates = installUpdates(
      () => {
        ctx.updateReady = true;
        ctx.render();
      },
      () => {
        ctx.updating = false;
        ctx.notice = '加载失败';
        ctx.render();
      },
    );
    void navigator.serviceWorker.ready.then(() => {
      ctx.cacheReady = true;
      ctx.render();
    });
  }
}
