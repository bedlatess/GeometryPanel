import { Stat,ListGroup,ListRow,ConfirmSheet,html } from './kit';
import type { PageActions } from './pages/actions';
import { ApiError, messageFor } from '../api/client';
import { TasksApi } from '../api/tasks';
import type { Session } from '../core/model';
import type { AccountBook, SavedAccount } from '../core/accounts';
import { nativeMessage, type NativeCapabilities, type NativeClient } from '../core/native';
import { chinaDay } from '../core/extensions-model';
import { defaultTaskConfig, taskActions, taskConfig, type SignCount, type TaskAction, type TaskConfig, type TaskReason, type TaskStep, type TaskSummary } from '../core/tasks-model';
import { claimTaskAttempt, loadTaskConfig, saveTaskConfig } from '../core/tasks-store';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const labels: Record<TaskAction, string> = { signin: '每日签到', streakPrize: '连签奖励', like: '点赞广场动态', share: '分享并领取积分', post: '发布我的文字动态', cleanup: '清理本次发布的动态' };
const reasons:Record<TaskReason,string>={already_done:'已完成',not_eligible:'条件未满足',state_unknown:'状态未知',no_target:'无可选动态',daily_gate:'今日已尝试',evidence_unsafe:'未确认新动态，停止清理',accepted_not_verified:'结果待确认',network:'网络不可用',rejected:'未被接受',expired:'登录已过期',cancelled:'已停止等待'};
const states: Record<TaskStep['state'], string> = { confirmed: '已核实', skipped: '已跳过', uncertain: '待确认', failed: '未完成' };
type Options = { session: Session | null; demo: boolean; native: NativeClient; accounts: AccountBook; onExpired(): void; onUncertain?(): void; onNativeConsent?: () => Promise<unknown>; actions:PageActions };

export function mountTasks(host: HTMLElement, options: Options): () => void {
  const api = new TasksApi(), aborter = new AbortController();
  const accounts = options.accounts.accounts.filter(account => account.enabled);
  let account: SavedAccount | undefined = accounts.find(row => row.uid === options.session?.uid) ?? accounts[0];
  let config = !options.demo && account ? loadTaskConfig(account.id) : defaultTaskConfig();
  let alive = true, busy = false, writing = false, loading = true, nativeTasks = false, error = '', note = '', mode = '', generation = 0;
  let summary: TaskSummary | null = null, sign: SignCount | null = null, steps: TaskStep[] = [];
  let pending: { kind: 'save' | 'run'; config: TaskConfig } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const disabled = () => busy || loading || options.demo || !account ? 'disabled' : '';
  const fail = (failure: unknown) => {
    if (failure instanceof ApiError && failure.kind === 'expired') {
      summary = null; sign = null; steps = []; error = '登录已过期';
      if (account?.uid === options.session?.uid) options.onExpired();
    }
    else error = '执行结果待确认';
  };
  function render() {
    if(!alive)return;
    const inputSwitch=(label:string,name:string,checked:boolean)=>`<label class="switch-input"><span>${escape(label)}</span><input type="checkbox" role="switch" name="${name}" ${checked?'checked':''} ${disabled()}></label>`;
    host.innerHTML=`${accounts.length>1?`<label>执行账号<select data-task-account ${busy?'disabled':''}>${accounts.map(row=>`<option value="${escape(row.id)}" ${row.id===account?.id?'selected':''}>${escape(row.label)}</option>`).join('')}</select></label>`:''}<div class="stats-grid">${Stat(summary?.points,'','积分')}${Stat(sign?.count,'天','连签')}</div><p>${loading?'正在加载':sign?.signed===true?'今日已签到':sign?.signed===false?'今日未签到':'状态未知'}</p>${summary?ListGroup('',summary.tasks.map(row=>ListRow(row.title,row.completed===true?'已完成':row.completed===false?'未完成':'状态未知','',undefined,true)).join('')):''}<button class="text-button" data-task="refresh" ${disabled()}>刷新积分</button><form data-task-config>${ListGroup('执行内容',taskActions.map(action=>inputSwitch(labels[action],action,config.actions[action])).join(''))}<label>要发布的文字<textarea name="postContent" maxlength="500" rows="3" ${disabled()}>${escape(config.postContent)}</textarea></label><label>执行间隔（秒）<input name="gap" type="number" min="0" max="60" step="1" value="${config.requestIntervalMs/1000}" ${disabled()}></label>${inputSwitch('同意切换点赞状态','legacyLikeConfirmed',config.legacyLikeConfirmed)}${nativeTasks?`${inputSwitch('定时执行','enabled',config.enabled)}<label>每天执行时间<input name="time" type="time" value="${config.time}" ${disabled()}></label>`:''}<button class="text-button" type="submit" ${disabled()}>保存任务设置</button></form><button class="primary" data-task="run" ${disabled()}>立即执行</button>${busy?'<p role="status">正在执行</p>':''}${note?`<p role="status">${escape(note)}</p>`:''}${error?`<p role="alert">${escape(error)}</p>`:''}${steps.length?ListGroup('上次结果',steps.map(step=>ListRow(labels[step.action],states[step.state]+(step.reason?' · '+reasons[step.reason]:''),'',undefined,true)).join('')):''}${nativeTasks?`<button class="text-button" data-task="status" ${busy?'disabled':''}>执行状态</button>`:''}`;
  }
  function prompt() {
    if(!pending||options.demo)return;
    const chosen=pending,label=chosen.kind==='save'?'启用并保存':'执行所选任务';
    const body=`<p>${escape(chosen.kind==='save'&&chosen.config.enabled?'全部已启用账号':account?.label??'当前账号')}</p><p>${taskActions.filter(a=>chosen.config.actions[a]).map(a=>labels[a]).join('、')||'未选择动作'}</p>${chosen.config.actions.post?`<blockquote>${html(chosen.config.postContent)}</blockquote>`:''}<button class="primary" data-task="confirm">${label}</button><button class="secondary" data-action="close">取消</button>`;
    options.actions.sheet(label,body,button=>{if(button.dataset.task==='confirm'&&pending===chosen){pending=null;options.actions.closeSheet();if(chosen.kind==='save')void save(chosen.config);else void run(chosen.config);}});
  }
  async function load() {
    if (!alive || busy) return;
    const current = ++generation, binding = account;
    loading = true; error = ''; render();
    try {
      if (options.demo) { summary = { points: 1280, tasks: [{ code: '1023', title: '每日动态', action: 'post', completed: false }] }; sign = { signed: true, count: 12 }; }
      else if (binding) {
        const result = await Promise.all([api.summary(binding, aborter.signal), api.count(binding, aborter.signal)]);
        if (!alive || current !== generation) return; [summary, sign] = result;
      }
    } catch (failure) { if (alive && current === generation && !aborter.signal.aborted) fail(failure); }
    finally { if (alive && current === generation) { loading = false; render(); } }
  }
  function receiveStatus(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const raw = value as Record<string, unknown>;
    if (raw.config) try { config = taskConfig(raw.config); } catch { /* retain validated local configuration */ }
    const list = Array.isArray(raw.accounts) ? raw.accounts : [];
    const current = list.find(item => item && typeof item === 'object' && item.id === account?.id && item.epoch === account?.epoch);
    if (current && Array.isArray(current.steps)) steps = current.steps.slice(-30).flatMap((step: any) => taskActions.includes(step?.action)
      && Object.hasOwn(states, step?.state) && (!step.reason || Object.hasOwn(reasons, step.reason)) ? [{ action: step.action, state: step.state, reason: step.reason, at: Number.isFinite(step.at) ? step.at : 0 }] : []);
    note = raw.running === true ? '正在执行' : '已更新';
    return raw.running === true;
  }
  async function status(poll = false) {
    try {
      const raw = await options.native.call('tasks.status', {}, aborter.signal);
      if (!alive) return;
      const running = receiveStatus(raw); render();
      if (poll && running) timer = setTimeout(() => { timer = null; void status(true); }, 3000);
      else if (poll) void load();
    } catch (failure) { if (alive && !aborter.signal.aborted) { fail(failure); render(); } }
  }
  async function save(value: TaskConfig) {
    if (!account) return;
    busy = true; error = ''; render();
    try {
      if (nativeTasks) {
        if (value.enabled) {
          if (!options.onNativeConsent) throw new ApiError('rejected');
          await options.onNativeConsent();
        }
        const raw = await options.native.call('tasks.configure', value, aborter.signal);
        if (!alive) return; receiveStatus(raw);
      }
      if (!saveTaskConfig(account.id, value)) throw new ApiError('rejected');
      config = value; note = value.enabled ? '定时执行已保存' : '已保存';
    } catch (failure) { if (alive && !aborter.signal.aborted) fail(failure); }
    finally { if (alive) { busy = false; render(); } }
  }
  async function run(value: TaskConfig) {
    if (!account) return;
    busy = true; writing = true; steps = []; error = ''; note = ''; render();
    try {
      if (nativeTasks) {
        if (!options.onNativeConsent) throw new ApiError('rejected');
        await options.onNativeConsent();
        await options.native.call('tasks.configure', value, aborter.signal);
        const raw = await options.native.call('tasks.run', { accountId: account.id, confirmed: true }, aborter.signal);
        if (!alive) return; receiveStatus(raw); void status(true);
      } else {
        await api.run(account, value, { signal: aborter.signal, claim: (action, day) => claimTaskAttempt(account!.id, action, day),
          onStep: step => { if (alive) { steps.push(step); render(); } } });
        note = '执行结束';
      }
    } catch (failure) { if (alive && !aborter.signal.aborted) fail(failure); }
    finally { writing = false; if (alive) { busy = false; render(); if (!nativeTasks) void load(); } }
  }
  function submitted(event: Event) {
    const form = event.target; if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-task-config')) return;
    event.preventDefault(); if (busy || loading || options.demo || !account) return;
    const data = new FormData(form);
    try {
      const value = taskConfig({ enabled: nativeTasks && data.has('enabled'), time: String(data.get('time') ?? config.time), requestIntervalMs: Number(data.get('gap')) * 1000,
        actions: Object.fromEntries(taskActions.map(action => [action, data.has(action)])), postContent: String(data.get('postContent') ?? ''), legacyLikeConfirmed: data.has('legacyLikeConfirmed') });
      if (value.enabled) { pending = { kind: 'save', config: value }; render();prompt(); }
      else void save(value);
    } catch { error = '任务设置不完整'; render(); }
  }
  function clicked(event: Event) {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-task]') : null;
    if (!button || !host.contains(button) || button.hasAttribute('disabled') || busy) return;
    const action = button.dataset.task;
    if (action === 'refresh') { void load(); return; }
    if (action === 'status') { void status(); return; }
    if (action === 'cancel') { pending = null; render(); return; }
    if (action === 'run') { pending = { kind: 'run', config }; error = ''; render();prompt(); return; }
    if (action === 'confirm' && pending) { const chosen = pending; pending = null; if (chosen.kind === 'save') void save(chosen.config); else void run(chosen.config); }
  }
  function changed(event: Event) {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.hasAttribute('data-task-account') || busy) return;
    account = accounts.find(row => row.id === select.value); config = account ? loadTaskConfig(account.id) : defaultTaskConfig();
    summary = null; sign = null; steps = []; pending = null; void load();
  }
  host.addEventListener('submit', submitted); host.addEventListener('click', clicked); host.addEventListener('change', changed);
  render();
  void (async () => {
    if (!options.demo && options.native.available) try {
      const capabilities = await options.native.call<NativeCapabilities>('capabilities', {}, aborter.signal);
      if (!alive) return; nativeTasks = capabilities.features.tasks === true;
      if (nativeTasks) await status();
    } catch { /* foreground web tasks remain available */ }
    if (alive) void load();
  })();
  return () => {
    const uncertain = writing; alive = false; aborter.abort(); if (timer) clearTimeout(timer);
    host.removeEventListener('submit', submitted); host.removeEventListener('click', clicked); host.removeEventListener('change', changed); host.replaceChildren();
    if (uncertain) options.onUncertain?.();
  };
}
