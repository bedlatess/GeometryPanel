import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { emptyAccounts } from '../core/accounts';
import { authorizeNativeAccounts } from '../core/background';
import { demoSnapshot } from '../core/model';
import { NativeClient } from '../core/native';
import { useSessionStore } from './session';
import { workflowActions } from './workflow-actions';

export const useWorkflowStore = defineStore('workflows', () => {
  const data = shallowRef<Record<string, any>>({});
  const session = useSessionStore();
  async function mount(
    kind: 'native' | 'background' | 'tasks' | 'owner' | 'accounts' | 'extensions',
    host: HTMLElement,
    extra: Record<string, unknown>,
    publish: (value: any) => void,
  ) {
    const state = session.state;
    const native = state.preview ? new NativeClient(null) : session.nativeClient();
    const options = {
      native,
      book: state.preview ? emptyAccounts() : structuredClone(state.accountBook),
      accounts: state.preview ? emptyAccounts() : structuredClone(state.accountBook),
      session: state.preview || state.expired ? null : state.session,
      demo: state.preview,
      snapshot: state.preview ? demoSnapshot : state.reading,
      onExpired: session.expire,
      onUncertain: () => session.toast('已发出，结果待确认'),
      onNativeConsent: () =>
        state.preview
          ? Promise.reject()
          : authorizeNativeAccounts(native, state.accountBook).then(() => {}),
      onImported: (value: unknown) => session.importOfficial(value),
      actions: workflowActions(),
      onSelect: (id: string) => session.selectSaved(id),
      onRemove: (id: string) => session.removeSaved(id),
      onChange: session.changeSaved,
      onAdd: () => session.accountLogin(),
      onUpdate: (id: string) => session.accountLogin(id),
      publish(value: any) {
        data.value = { ...data.value, [kind]: value };
        publish(value);
      },
      ...extra,
    };
    if (kind === 'native') return (await import('./workflows/native')).mountNative(host, options);
    if (kind === 'tasks') return (await import('./workflows/tasks')).mountTasks(host, options);
    if (kind === 'accounts')
      return (await import('./workflows/accounts')).mountAccounts(host, options);
    if (kind === 'extensions')
      return (await import('./workflows/extensions')).mountExtensions(host, options);
    if (kind === 'owner')
      return (await import('./workflows/owner')).mountOwner(host, {
        ...options,
        path: String(extra.path),
      });
    return (await import('./workflows/background')).mountBackground(host, options);
  }
  return { data, mount };
});
