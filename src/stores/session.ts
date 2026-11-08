import { defineStore } from 'pinia';
import { markRaw, shallowRef } from 'vue';
import type { Router } from 'vue-router';
import { createRuntime } from './runtime';
import type { Session, Snapshot } from '../core/model';
import type { AccountBook } from '../core/accounts';
import { emptyAccounts } from '../core/accounts';
import { defaultPreferences } from '../core/preferences';
import type { NativeMethod } from '../core/native';

export interface RuntimeState {
  developer?: boolean;
  mapVisible?: boolean;
  checkingUpdate?: boolean;
  session: Session | null;
  accountBook: AccountBook;
  reading: Snapshot | null;
  preview: boolean;
  busy: boolean;
  booting: boolean;
  committing: boolean;
  activeControl: boolean;
  expired: boolean;
  updateReady: boolean;
  updating: boolean;
  nativeSyncPending: boolean;
  notice: string;
  homeUnread: boolean;
  preferences: typeof defaultPreferences;
  leverPhase: 'idle' | 'sending' | 'pending' | 'success' | 'error';
  leverTarget: 'powerOn' | 'powerOff';
  nativeAvailable: boolean;
  android: boolean;
  secondsRemaining: number;
  phone: string;
  pending: { token: string; uid: string; vehicles: Session['vehicle'][] } | null;
  sheet: { title: string; body: string } | null;
}

export const useSessionStore = defineStore('session', () => {
  const state = shallowRef<RuntimeState>({
    session: null,
    accountBook: emptyAccounts(),
    reading: null,
    preview: false,
    busy: false,
    booting: true,
    committing: false,
    activeControl: false,
    expired: false,
    updateReady: false,
    updating: false,
    nativeSyncPending: false,
    notice: '',
    homeUnread: false,
    preferences: structuredClone(defaultPreferences),
    leverPhase: 'idle',
    leverTarget: 'powerOn',
    nativeAvailable: false,
    android: false,
    secondsRemaining: 0,
    phone: '',
    pending: null,
    sheet: null,
  });
  const sheetOpen = shallowRef(false);
  let runtime: ReturnType<typeof createRuntime>;
  const handlers = new Map<string, EventListener[]>();

  function start(router: Router, content: HTMLElement) {
    const port = new Proxy({} as HTMLDialogElement, {
      get(_target, name) {
        if (name === 'open') return sheetOpen.value;
        if (name === 'showModal')
          return () => {
            sheetOpen.value = true;
          };
        if (name === 'close')
          return () => {
            sheetOpen.value = false;
          };
        if (name === 'replaceChildren') return () => {};
        if (name === 'addEventListener') {
          return (type: string, fn: EventListener) => {
            handlers.set(type, [...(handlers.get(type) ?? []), fn]);
          };
        }
        const element =
          document.querySelector('#runtime-modal') ?? document.createElement('dialog');
        const value = Reflect.get(element, name, element);
        return typeof value === 'function' ? value.bind(element) : value;
      },
    });
    runtime = markRaw(
      createRuntime(content, port, router, (next) => {
        state.value = next;
      }),
    );
    router.beforeEach(() => runtime.navigationChanged());
    router.afterEach(() => runtime.render());
  }

  const action = (name: string, value?: string) => runtime?.action(name, value);
  function modalEvent(event: Event) {
    for (const handle of handlers.get(event.type) ?? []) handle(event);
    runtime?.render();
  }
  function modalAction(action: string, value?: string, data: Record<string, string> = {}) {
    const button = document.createElement('button');
    Object.assign(button.dataset, { action, value, ...data });
    modalEvent({ type: 'click', target: button } as unknown as Event);
  }
  const refresh = () => runtime.refresh();
  const expire = () => runtime?.panelExpired();
  const toast = (text: string) => runtime?.toast(text);
  const nativeCall = <T>(method: NativeMethod, params: object = {}, signal?: AbortSignal) =>
    runtime.native.call<T>(method, params, signal);
  const close = () => runtime.close();
  const control = (mode: 'powerOn' | 'powerOff' | 'seat', drag = false) =>
    runtime.presentControl(mode, drag);
  const legacy = (host: HTMLElement, path: string) => runtime?.legacy(host, path);
  const toolbar = (button: HTMLElement) => runtime?.toolbar(button);
  const haptic = (type: string) => {
    if (!state.value.preview && state.value.nativeAvailable) {
      void runtime.native.call('haptic', { type }).catch(() => {});
    }
  };
  return {
    state,
    sheetOpen,
    start,
    action,
    modalAction,
    modalEvent,
    refresh,
    close,
    control,
    legacy,
    toolbar,
    haptic,
    expire,
    toast,
    nativeCall,
  };
});
