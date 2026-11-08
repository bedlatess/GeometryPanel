import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { useSessionStore } from './session';
export type SheetSpec = {
  kind: 'confirm' | 'choose' | 'date' | 'times' | 'form';
  label: string;
  name?: string;
  detail?: string;
  quote?: string;
  danger?: boolean;
  data?: Record<string, string>;
  options?: readonly (readonly [string, string])[];
  value?: string;
  fields?: { label: string; name: string; value?: string; type?: string }[];
};
export interface PageActions {
  sheet(title: string, body: SheetSpec, clicked?: (button: HTMLElement) => void): void;
  toolbar(body: unknown, clicked: (button: HTMLElement) => void): void;
  closeSheet(): void;
  navigate(path: string): void;
  toast(text: string): void;
}
export function ConfirmSheet(
  label: string,
  name: string,
  vin: string,
  attributes: string,
  detail = '',
): SheetSpec {
  const data: Record<string, string> = {};
  for (const match of attributes.matchAll(/data-([\w-]+)(?:="([^"]*)")?/g)) {
    data[match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = match[2] || '';
  }
  return {
    kind: 'confirm',
    label,
    name,
    detail: `尾号 ${vin}${detail ? `\n${detail}` : ''}`,
    data,
  };
}
export const useWorkflowOverlay = defineStore('workflow-overlay', () => {
  const sheet = shallowRef<{ title: string; body: SheetSpec } | null>(null);
  let accept: ((button: HTMLElement) => void) | undefined;
  function show(title: string, body: SheetSpec, clicked?: (button: HTMLElement) => void) {
    sheet.value = { title, body };
    accept = clicked;
  }
  function close() {
    sheet.value = null;
    accept = undefined;
  }
  function submit(button: HTMLElement) {
    accept?.(button);
  }
  return { sheet, show, close, submit };
});
export function workflowActions(): PageActions {
  const overlay = useWorkflowOverlay(),
    session = useSessionStore();
  return {
    sheet: overlay.show,
    closeSheet: overlay.close,
    toolbar() {},
    navigate: (path) => session.action('route', path),
    toast: session.toast,
  };
}
export function choose(
  actions: PageActions,
  title: string,
  options: readonly (readonly [string, string])[],
  value: string,
  selected: (value: string) => void,
) {
  actions.sheet(title, { kind: 'choose', label: '确定', options, value }, (button) => {
    if (button.dataset.value !== undefined) {
      const next = button.dataset.value;
      actions.closeSheet();
      selected(next);
    }
  });
}
export function chooseDate(
  actions: PageActions,
  title: string,
  value: string,
  selected: (value: string) => void,
) {
  actions.sheet(title, { kind: 'date', label: '确定', value }, (button) => {
    actions.closeSheet();
    selected(button.dataset.value || '');
  });
}
