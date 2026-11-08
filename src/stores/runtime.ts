import type { Router } from 'vue-router';

import { registeraccounts } from './runtime/accounts';
import { registeractions } from './runtime/actions';
import { bootRuntime } from './runtime/boot';
import { registercommand } from './runtime/command';
import type { RuntimeContext } from './runtime/context';
import { registerlogin } from './runtime/login';
import { registermodal } from './runtime/modal';
import { registerpreferences } from './runtime/preferences';
import { registerPublish } from './runtime/publish';
import { initializeState } from './runtime/state';
import { registervehicle } from './runtime/vehicle';
export function createRuntime(
  content: HTMLElement,
  modal: HTMLDialogElement,
  navigation: Router,
  publish: (state: any) => void,
) {
  const ctx = { content, modal, navigation, publish } as RuntimeContext;
  registervehicle(ctx);
  registeraccounts(ctx);
  registerlogin(ctx);
  registercommand(ctx);
  registerpreferences(ctx);
  registeractions(ctx);
  registermodal(ctx);
  registerPublish(ctx);
  initializeState(ctx);
  bootRuntime(ctx);
  return {
    importOfficial: ctx.importOfficialAccount,
    selectSaved: ctx.activateSavedVehicle,
    removeSaved: ctx.forgetSavedAccount,
    changeSaved: ctx.changeSavedAccounts,
    accountLogin(id?: string) {
      ctx.updatingAccountId = id || null;
      ctx.showPhone();
    },
    action: ctx.action,
    refresh: ctx.refresh,
    close: ctx.close,
    presentControl: ctx.presentControl,
    render: ctx.render,

    native: ctx.native,
    toolbar(button: HTMLElement) {
      ctx.toolbarClick?.(button);
    },
    navigationChanged() {
      if (ctx.modal.open) ctx.close();
      ctx.mapVisible = false;
      ctx.render();
    },
    toast(text: string) {
      ctx.notice = text;
      ctx.render();
    },
    handleSubmit: ctx.handleSubmit,
    activateSavedVehicle: ctx.activateSavedVehicle,
    panelExpired: ctx.panelExpired,
  };
}
