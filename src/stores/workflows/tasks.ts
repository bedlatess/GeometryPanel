import { ApiError } from '../../api/client';
import { TasksApi } from '../../api/tasks';
import { type NativeCapabilities } from '../../core/native';
import { defaultTaskConfig } from '../../core/tasks-model';
import { loadTaskConfig } from '../../core/tasks-store';
import { register as captureForm } from './tasks/captureForm';
import { register as changed } from './tasks/changed';
import { register as clicked } from './tasks/clicked';
import type { Context } from './tasks/context';
import { register as load } from './tasks/load';
import { register as prompt } from './tasks/prompt';
import { register as receiveStatus } from './tasks/receiveStatus';
import { register as render } from './tasks/render';
import { register as run } from './tasks/run';
import { register as save } from './tasks/save';
import { Options } from './tasks/shared';
import { register as status } from './tasks/status';
import { register as submitted } from './tasks/submitted';
export function mountTasks(host: HTMLElement, options: Options) {
  const ctx = { host, options } as Context;
  render(ctx);
  prompt(ctx);
  load(ctx);
  receiveStatus(ctx);
  status(ctx);
  save(ctx);
  run(ctx);
  captureForm(ctx);
  submitted(ctx);
  clicked(ctx);
  changed(ctx);
  ctx.api = new TasksApi();
  ctx.aborter = new AbortController();
  ctx.accounts = ctx.options.accounts.accounts.filter((account) => account.enabled);
  ctx.account = ctx.accounts.find((row) => row.uid === ctx.options.session?.uid) ?? ctx.accounts[0];
  ctx.config =
    !ctx.options.demo && ctx.account ? loadTaskConfig(ctx.account.id) : defaultTaskConfig();
  ctx.alive = true;
  ctx.busy = false;
  ctx.writing = false;
  ctx.loading = true;
  ctx.nativeTasks = false;
  ctx.error = '';
  ctx.note = '';
  ctx.mode = '';
  ctx.generation = 0;
  ctx.summary = null;
  ctx.sign = null;
  ctx.steps = [];
  ctx.pending = null;
  ctx.timer = null;
  ctx.disabled = () =>
    ctx.busy || ctx.loading || ctx.options.demo || !ctx.account ? 'disabled' : '';
  ctx.fail = (failure: unknown) => {
    if (failure instanceof ApiError && failure.kind === 'expired') {
      ctx.summary = null;
      ctx.sign = null;
      ctx.steps = [];
      ctx.error = '登录已过期';
      if (ctx.account?.uid === ctx.options.session?.uid) ctx.options.onExpired();
    } else ctx.error = '执行结果待确认';
  };
  ctx.host.addEventListener('submit', ctx.submitted);
  ctx.host.addEventListener('click', ctx.clicked);
  ctx.host.addEventListener('change', ctx.changed);
  ctx.render();
  void (async () => {
    if (!ctx.options.demo && ctx.options.native.available)
      try {
        const capabilities = await ctx.options.native.call<NativeCapabilities>(
          'capabilities',
          {},
          ctx.aborter.signal,
        );
        if (!ctx.alive) return;
        ctx.nativeTasks = capabilities.features.tasks === true;
        if (ctx.nativeTasks) await ctx.status();
      } catch {
        /* foreground web tasks remain available */
      }
    if (ctx.alive) void ctx.load();
  })();
  return () => {
    const uncertain = ctx.writing;
    ctx.alive = false;
    ctx.aborter.abort();
    if (ctx.timer) clearTimeout(ctx.timer);
    ctx.host.removeEventListener('submit', ctx.submitted);
    ctx.host.removeEventListener('click', ctx.clicked);
    ctx.host.removeEventListener('change', ctx.changed);
    // The Vue page owns these nodes; clearing them would blank a re-entered cached page.
    if (uncertain) ctx.options.onUncertain?.();
  };
}
