import { accountSession, type AccountBook } from '../core/accounts';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function mountAccounts(host: HTMLElement, options: { book: AccountBook; onSelect(vehicleId: string): Promise<void>; onRemove(accountId: string): Promise<void>; onChange(book: AccountBook, before: AccountBook): Promise<void>; onAdd(): void }) {
  let disposed = false, working = false, confirming = '', message = '';
  function render() {
    if (disposed) return;
    host.innerHTML = `<p>账号保存在这台设备的加密存储中。每个账号的车辆和后台任务独立绑定。下方开关决定是否参与已开启的后台功能，不会自动开启监控或社区任务。</p>${options.book.accounts.map(account => `<section class="settings-card"><h3>${escape(account.label)}</h3><label>本机账号名称<input data-account-label="${escape(account.id)}" value="${escape(account.label)}" maxlength="80" ${working ? 'disabled' : ''}></label><label class="checkbox-row"><input type="checkbox" data-account-enabled="${escape(account.id)}" ${account.enabled ? 'checked' : ''} ${working ? 'disabled' : ''}>允许此账号参与后台功能</label>${account.vehicles.map(car => `<button class="setting-row" data-account-select="${escape(car.id)}" ${working ? 'disabled' : ''}><span>${escape(car.label)} · 尾号 ${escape(car.vin.slice(-6))}</span><span>${options.book.selectedVehicleId === car.id ? '当前' : '切换'}</span></button><label class="checkbox-row"><input type="checkbox" data-account-vehicle-enabled="${escape(car.id)}" ${car.enabled ? 'checked' : ''} ${working ? 'disabled' : ''}>后台读取此车</label>`).join('')}<button class="text-button danger" data-account-remove="${escape(account.id)}" ${working ? 'disabled' : ''}>移除此账号</button>${confirming === account.id ? `<p>将删除本机账号，并停止其后台任务与桌面控制。不会解绑官方账号中的车辆。</p><button class="primary" data-account-confirm="${escape(account.id)}">确认移除</button><button class="text-button" data-account-cancel>取消</button>` : ''}</section>`).join('') || '<p>暂无已保存账号。</p>'}<button class="primary block" data-account-add ${working || options.book.accounts.length >= 8 ? 'disabled' : ''}>添加账号</button><p class="form-message" role="status">${escape(message)}</p>`;
  }
  async function click(event: Event) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button || button.disabled || working) return;
    if ('accountAdd' in button.dataset) { options.onAdd(); return; }
    if ('accountCancel' in button.dataset) { confirming = ''; render(); return; }
    if (button.dataset.accountRemove) { confirming = button.dataset.accountRemove; render(); return; }
    try {
      working = true; message = ''; render();
      if (button.dataset.accountSelect && accountSession(options.book, button.dataset.accountSelect)) await options.onSelect(button.dataset.accountSelect);
      if (button.dataset.accountConfirm) { await options.onRemove(button.dataset.accountConfirm); options.book.accounts = options.book.accounts.filter(item => item.id !== button.dataset.accountConfirm); confirming = ''; message = '已移除此设备上的账号。'; }
    } catch { message = '本机账号切换或移除未完成，请重试。'; }
    finally { working = false; render(); }
  }
  async function change(event: Event) {
    const input = event.target as HTMLInputElement; if (working || disposed) return;
    const next = structuredClone(options.book);
    const account = next.accounts.find(item => item.id === (input.dataset.accountLabel ?? input.dataset.accountEnabled));
    if (account && input.dataset.accountLabel) { const label = input.value.trim(); if (!label || /[\u0000-\u001f\u007f]/.test(label)) { message = '名称不能为空或包含控制字符。'; render(); return; } account.label = label.slice(0, 80); }
    else if (account && input.dataset.accountEnabled) { account.enabled = input.checked; account.epoch++; }
    else if (input.dataset.accountVehicleEnabled) { const car = next.accounts.flatMap(item => item.vehicles).find(item => item.id === input.dataset.accountVehicleEnabled); if (!car) return; car.enabled = input.checked; car.epoch++; }
    else return;
    working = true; render();
    try { await options.onChange(next, options.book); options.book = next; message = '本机账号配置已保存。'; }
    catch { message = '保存未完成，原配置保留。'; }
    finally { working = false; render(); }
  }
  host.addEventListener('click', click); host.addEventListener('change', change); render();
  return () => { disposed = true; host.removeEventListener('click', click); host.removeEventListener('change', change); };
}
