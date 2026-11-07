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
const reasons: Record<TaskReason, string> = { already_done: '服务端显示已完成', not_eligible: '尚未满足领取条件', state_unknown: '状态不明确，已跳过', no_target: '没有可用的广场文章', daily_gate: '今天已有执行尝试，避免重复', evidence_unsafe: '未取得唯一文章证据，已停止清理', accepted_not_verified: '请求已发出，服务端状态尚未核实', network: '网络结果未确认', rejected: '服务端未接受请求', expired: '登录已失效', cancelled: '后续操作已停止，已发送请求不能撤回' };
const states: Record<TaskStep['state'], string> = { confirmed: '已核实', skipped: '已跳过', uncertain: '待确认', failed: '未完成' };
type Options = { session: Session | null; demo: boolean; native: NativeClient; accounts: AccountBook; onExpired(): void; onUncertain?(): void; onNativeConsent?: () => Promise<unknown> };

export function mountTasks(host: HTMLElement, options: Options): () => void {
  const api = new TasksApi(), aborter = new AbortController();
  const accounts = options.accounts.accounts.filter(account => account.enabled);
  let account: SavedAccount | undefined = accounts.find(row => row.uid === options.session?.uid) ?? accounts[0];
  let config = account ? loadTaskConfig(account.id) : defaultTaskConfig();
  let alive = true, busy = false, writing = false, loading = true, nativeTasks = false, error = '', note = '', mode = '', generation = 0;
  let summary: TaskSummary | null = null, sign: SignCount | null = null, steps: TaskStep[] = [];
  let pending: { kind: 'save' | 'run'; config: TaskConfig } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const disabled = () => busy || loading || options.demo || !account ? 'disabled' : '';
  const fail = (failure: unknown) => {
    if (failure instanceof ApiError && failure.kind === 'expired') {
      summary = null; sign = null; steps = []; error = '所选账号登录已失效，请在账号管理中重新登录。';
      if (account?.uid === options.session?.uid) options.onExpired();
    }
    else error = failure instanceof ApiError ? messageFor(failure) : nativeMessage(failure);
  };
  function render() {
    if (!alive) return;
    host.innerHTML = `<p class="fine-print">${options.demo ? '演示模式 · 全部为合成积分数据，不发送任何任务。' : '所有自动动作默认关闭。积分状态由服务端确认，页面不会因收到受理结果就算任务完成。'}</p>${accounts.length > 1 ? `<label>执行账号<select data-task-account ${busy ? 'disabled' : ''}>${accounts.map(row => `<option value="${escape(row.id)}" ${row.id === account?.id ? 'selected' : ''}>${escape(row.label)}</option>`).join('')}</select></label>` : ''}<p>${loading ? '正在读取积分和签到状态…' : `总积分：${summary?.points ?? '未知'} · 今日${sign?.signed === true ? '已签到' : sign?.signed === false ? '未签到' : '签到状态未知'} · 连签 ${sign?.count ?? '未知'} 天`}</p>${summary ? `<ul>${summary.tasks.map(row => `<li>${escape(row.title)}：${row.completed === true ? '已完成' : row.completed === false ? '未完成' : '状态未知'}${row.action ? '' : '（仅显示）'}</li>`).join('')}</ul>` : ''}<button class="text-button" data-task="refresh" ${disabled()}>刷新积分状态</button><form data-task-config><h3>执行内容</h3>${taskActions.map(action => `<label><input type="checkbox" name="${action}" ${config.actions[action] ? 'checked' : ''} ${disabled()}>${labels[action]}</label>`).join('')}<label>要发布的文字<textarea name="postContent" maxlength="500" rows="3" ${disabled()}>${escape(config.postContent)}</textarea></label><p class="fine-print">发布动态需单独勾选并确认文字；清理只会删除能唯一核实属于本次发布的动态。已有动态不会拿来清理。结果不明时当天不自动补发。</p><label>请求间隔（秒）<input name="gap" type="number" min="0" max="60" step="1" value="${config.requestIntervalMs / 1000}" ${disabled()}></label>${nativeTasks ? `<label><input type="checkbox" name="enabled" ${config.enabled ? 'checked' : ''} ${disabled()}>启用原生定时任务</label><label>每天执行时间<input name="time" type="time" value="${config.time}" ${disabled()}></label><p class="fine-print">启用或手动执行时，会把已启用账号交给本机原生加密库。定时任务按账号管理页中启用的账号依次执行；系统限制可能延迟执行。${escape(mode)}</p>` : '<p class="fine-print">当前网页可在打开面板时手动执行；关闭 Safari 后不会继续定时运行。安装支持任务的 APK / IPA 后可使用系统调度。</p>'}<button class="text-button" type="submit" ${disabled()}>保存任务设置</button></form><button class="primary" data-task="run" ${disabled()}>执行当前账号已选任务</button>${busy ? '<p role="status">正在执行，请稍候。关闭面板会停止网页后续请求；原生任务请在状态页核对。</p>' : ''}${pending ? `<section class="settings-card" aria-label="确认积分任务"><h3>${pending.kind === 'save' ? '确认保存并启用定时任务' : '确认执行任务'}</h3><p>${pending.kind === 'save' && pending.config.enabled ? '适用所有已启用账号' : `账号：${escape(account?.label ?? '当前账号')}`}</p><p>${taskActions.filter(action => pending!.config.actions[action]).map(action => labels[action]).join('、') || '未选择动作'}</p>${pending.config.actions.post ? `<p>以下文字将发布到极核社区：</p><blockquote>${escape(pending.config.postContent)}</blockquote>` : ''}<button class="text-button" data-task="cancel">取消</button><button class="primary" data-task="confirm">${pending.kind === 'save' ? '确认启用并保存' : '确认执行所选任务'}</button></section>` : ''}${note ? `<p role="status">${escape(note)}</p>` : ''}${error ? `<p role="alert">${escape(error)}</p>` : ''}${steps.length ? `<h3>本次结果</h3><ul>${steps.map(step => `<li>${labels[step.action]}：${states[step.state]}${step.reason ? ` · ${reasons[step.reason]}` : ''}</li>`).join('')}</ul>` : ''}${nativeTasks ? `<button class="text-button" data-task="status" ${busy ? 'disabled' : ''}>查看原生任务状态</button>` : ''}`;
    const explanation = document.createElement('p'); explanation.className = 'fine-print';
    explanation.innerHTML = `<label><input type="checkbox" name="legacyLikeConfirmed" ${config.legacyLikeConfirmed ? 'checked' : ''} ${disabled()}>同意按旧版方式提交点赞；接口可能切换已有点赞状态。</label><span>仅选择“点赞广场动态”不会发送，需同时单独同意旧版方式。服务器仍未确认完成时不会自动重复提交。</span>`;
    host.querySelector('form')?.append(explanation);
  }
  async function load() {
    if (!alive || busy) return;
    const current = ++generation, binding = account;
    loading = true; error = ''; render();
    try {
      if (options.demo) { summary = { points: 1280, tasks: [{ code: '1023', title: '合成每日动态任务', action: 'post', completed: false }] }; sign = { signed: true, count: 12 }; }
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
    const modes: Record<string, string> = { 'foreground-service': 'Android 使用原生后台调度。', opportunistic: 'iOS 只能在系统允许的时机尝试后台刷新。', 'foreground-only': '当前仅能在应用前台执行。' };
    mode = modes[String(raw.backgroundMode)] ?? '后台模式尚未返回。';
    if (raw.config) try { config = taskConfig(raw.config); } catch { /* retain validated local configuration */ }
    const list = Array.isArray(raw.accounts) ? raw.accounts : [];
    const current = list.find(item => item && typeof item === 'object' && item.id === account?.id && item.epoch === account?.epoch);
    if (current && Array.isArray(current.steps)) steps = current.steps.slice(-30).flatMap((step: any) => taskActions.includes(step?.action)
      && Object.hasOwn(states, step?.state) && (!step.reason || Object.hasOwn(reasons, step.reason)) ? [{ action: step.action, state: step.state, reason: step.reason, at: Number.isFinite(step.at) ? step.at : 0 }] : []);
    note = raw.running === true ? '原生任务正在运行，可稍后查看结果。' : '已读取原生任务状态。';
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
      config = value; note = value.enabled ? '定时任务配置已保存，请以系统任务状态为准。' : '任务设置已保存，未启用定时执行。';
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
        note = '本次执行已结束；待确认项目不会自动重发，可在官方 App 核对。';
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
      if (value.enabled) { pending = { kind: 'save', config: value }; render(); }
      else void save(value);
    } catch { error = '请检查任务设置：发帖需填写文字，清理需同时开启发帖，请求间隔应为 0 至 60 秒。'; render(); }
  }
  function clicked(event: Event) {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-task]') : null;
    if (!button || !host.contains(button) || button.hasAttribute('disabled') || busy) return;
    const action = button.dataset.task;
    if (action === 'refresh') { void load(); return; }
    if (action === 'status') { void status(); return; }
    if (action === 'cancel') { pending = null; render(); return; }
    if (action === 'run') { pending = { kind: 'run', config }; error = ''; render(); return; }
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
