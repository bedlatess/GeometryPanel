import { taskActions } from '../../../core/tasks-model';
import { labels } from './shared';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.prompt = function () {
    if (!ctx.pending || ctx.options.demo) return;
    const chosen = ctx.pending,
      label = chosen.kind === 'save' ? '启用并保存' : '执行所选任务';
    ctx.options.actions.sheet(
      label,
      {
        kind: 'confirm',
        label,
        name:
          chosen.kind === 'save' && chosen.config.enabled
            ? '全部已启用账号'
            : (ctx.account?.label ?? '当前账号'),
        detail: taskActions
          .filter((a) => chosen.config.actions[a])
          .map((a) => labels[a])
          .join('、'),
        quote: chosen.config.actions.post ? chosen.config.postContent : '',
        data: { task: 'confirm' },
      },
      (button) => {
        if (button.dataset.task === 'confirm' && ctx.pending === chosen) {
          ctx.pending = null;
          ctx.options.actions.closeSheet();
          if (chosen.kind === 'save') void ctx.save(chosen.config);
          else void ctx.run(chosen.config);
        }
      },
    );
  };
}
