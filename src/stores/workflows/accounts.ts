import { ConfirmSheet, type PageActions } from '../workflow-actions';

import { accountSession, type AccountBook } from '../../core/accounts';
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function mountAccounts(
  host: HTMLElement,
  options: {
    book: AccountBook;
    onSelect(vehicleId: string): Promise<void>;
    onRemove(accountId: string): Promise<void>;
    onChange(book: AccountBook, before: AccountBook): Promise<void>;
    onAdd(): void;
    onUpdate(id: string): void;
    actions: PageActions;
    demo?: boolean;
    publish(value: any): void;
  },
) {
  let disposed = false,
    working = false,
    confirming = '',
    message = '';
  function render() {
    if (disposed) return;
    options.publish({ book: options.book, working, message });
  }
  async function click(event: Event) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled || working || options.demo) return;
    if (button.dataset.accountUpdate) {
      options.onUpdate(button.dataset.accountUpdate);
      return;
    }
    if ('accountAdd' in button.dataset) {
      options.onAdd();
      return;
    }
    if ('accountCancel' in button.dataset) {
      confirming = '';
      render();
      return;
    }
    if (button.dataset.accountRemove) {
      confirming = button.dataset.accountRemove;
      const account = options.book.accounts.find((a) => a.id === confirming);
      options.actions.sheet(
        '移除此账号',
        ConfirmSheet(
          '移除此账号',
          account?.label ?? '—',
          '—',
          `data-account-confirm="${escape(confirming)}"`,
          '移除本机登录和后台绑定',
        ),
        (chosen) => {
          if (chosen.dataset.accountConfirm) {
            options.actions.closeSheet();
            void click({ target: chosen } as unknown as Event);
          }
        },
      );
      return;
    }
    try {
      working = true;
      message = '';
      render();
      if (
        button.dataset.accountSelect &&
        accountSession(options.book, button.dataset.accountSelect)
      )
        await options.onSelect(button.dataset.accountSelect);
      if (button.dataset.accountConfirm) {
        await options.onRemove(button.dataset.accountConfirm);
        options.book.accounts = options.book.accounts.filter(
          (item) => item.id !== button.dataset.accountConfirm,
        );
        confirming = '';
        message = '已移除此账号';
      }
    } catch {
      message = '保存失败，请重试';
    } finally {
      working = false;
      render();
    }
  }
  async function change(event: Event) {
    const input = event.target as HTMLInputElement;
    if (working || disposed || options.demo) return;
    const next = structuredClone(options.book);
    const account = next.accounts.find(
      (item) => item.id === (input.dataset.accountLabel ?? input.dataset.accountEnabled),
    );
    if (account && input.dataset.accountLabel) {
      const label = input.value.trim();
      if (!label || /[\u0000-\u001f\u007f]/.test(label)) {
        message = '名称不可用';
        render();
        return;
      }
      account.label = label.slice(0, 80);
    } else if (account && input.dataset.accountEnabled) {
      account.enabled = input.checked;
      account.epoch++;
    } else if (input.dataset.accountVehicleEnabled) {
      const car = next.accounts
        .flatMap((item) => item.vehicles)
        .find((item) => item.id === input.dataset.accountVehicleEnabled);
      if (!car) return;
      car.enabled = input.checked;
      car.epoch++;
    } else return;
    working = true;
    render();
    try {
      await options.onChange(next, options.book);
      options.book = next;
      message = '已保存';
    } catch {
      message = '保存失败，请重试';
    } finally {
      working = false;
      render();
    }
  }
  host.addEventListener('click', click);
  host.addEventListener('change', change);
  render();
  return () => {
    disposed = true;
    host.removeEventListener('click', click);
    host.removeEventListener('change', change);
  };
}
