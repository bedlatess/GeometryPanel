import { ListGroup,ConfirmSheet,Empty } from './kit';
import type { PageActions } from './pages/actions';
import { accountSession, type AccountBook } from '../core/accounts';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function mountAccounts(host: HTMLElement, options: { book: AccountBook; onSelect(vehicleId: string): Promise<void>; onRemove(accountId: string): Promise<void>; onChange(book: AccountBook, before: AccountBook): Promise<void>; onAdd(): void; actions:PageActions; demo?:boolean }) {
  let disposed = false, working = false, confirming = '', message = '';
  function render() {
    if (disposed) return;
    const toggle=(label:string,attribute:string,checked:boolean)=>`<label class="switch-input"><span>${label}</span><input type="checkbox" role="switch" ${attribute} ${checked?'checked':''} ${working||options.demo?'disabled':''}></label>`;
    host.innerHTML=`${options.book.accounts.map(account=>ListGroup(account.label,`<label class="account-name">账号名称<input data-account-label="${escape(account.id)}" value="${escape(account.label)}" maxlength="80" ${working?'disabled':''}></label>${toggle('后台使用此账号',`data-account-enabled="${escape(account.id)}"`,account.enabled)}${account.vehicles.map(car=>`<button class="list-row" data-account-select="${escape(car.id)}" ${working?'disabled':''}><span><strong>${escape(car.label)}</strong><small>尾号 ${escape(car.vin.slice(-6))}</small></span><span class="row-value">${options.book.selectedVehicleId===car.id?'当前':'切换'}</span></button>${toggle('后台读取此车',`data-account-vehicle-enabled="${escape(car.id)}"`,car.enabled)}`).join('')}<button class="text-button danger" data-account-remove="${escape(account.id)}" ${working?'disabled':''}>移除此账号</button>`)).join('')||Empty('未保存账号','user')}<button class="primary" data-account-add ${working||options.demo||options.book.accounts.length>=8?'disabled':''}>添加账号</button>${options.book.accounts.length?'<button class="text-button danger" data-action="logout">退出全部账号</button>':''}<p class="form-message" role="status">${escape(message)}</p>`;
  }
  async function click(event: Event) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button || button.disabled || working || options.demo) return;
    if ('accountAdd' in button.dataset) { options.onAdd(); return; }
    if ('accountCancel' in button.dataset) { confirming = ''; render(); return; }
    if(button.dataset.accountRemove){confirming=button.dataset.accountRemove;const account=options.book.accounts.find(a=>a.id===confirming);options.actions.sheet('移除此账号',ConfirmSheet('移除此账号',account?.label??'—','—',`data-account-confirm="${escape(confirming)}"`,'移除本机登录和后台绑定'),chosen=>{if(chosen.dataset.accountConfirm){options.actions.closeSheet();void click({target:chosen} as unknown as Event);}});return;}
    try {
      working = true; message = ''; render();
      if (button.dataset.accountSelect && accountSession(options.book, button.dataset.accountSelect)) await options.onSelect(button.dataset.accountSelect);
      if (button.dataset.accountConfirm) { await options.onRemove(button.dataset.accountConfirm); options.book.accounts = options.book.accounts.filter(item => item.id !== button.dataset.accountConfirm); confirming = ''; message = '已移除此账号'; }
    } catch { message = '保存失败，请重试'; }
    finally { working = false; render(); }
  }
  async function change(event: Event) {
    const input = event.target as HTMLInputElement; if (working || disposed || options.demo) return;
    const next = structuredClone(options.book);
    const account = next.accounts.find(item => item.id === (input.dataset.accountLabel ?? input.dataset.accountEnabled));
    if (account && input.dataset.accountLabel) { const label = input.value.trim(); if (!label || /[\u0000-\u001f\u007f]/.test(label)) { message = '名称不可用'; render(); return; } account.label = label.slice(0, 80); }
    else if (account && input.dataset.accountEnabled) { account.enabled = input.checked; account.epoch++; }
    else if (input.dataset.accountVehicleEnabled) { const car = next.accounts.flatMap(item => item.vehicles).find(item => item.id === input.dataset.accountVehicleEnabled); if (!car) return; car.enabled = input.checked; car.epoch++; }
    else return;
    working = true; render();
    try { await options.onChange(next, options.book); options.book = next; message = '已保存'; }
    catch { message = '保存失败，请重试'; }
    finally { working = false; render(); }
  }
  host.addEventListener('click', click); host.addEventListener('change', change); render();
  return () => { disposed = true; host.removeEventListener('click', click); host.removeEventListener('change', change); };
}
