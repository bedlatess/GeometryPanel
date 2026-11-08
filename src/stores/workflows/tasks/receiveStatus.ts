import { taskActions, taskConfig } from '../../../core/tasks-model';
import { reasons, states } from './shared';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.receiveStatus = function (value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const raw = value as Record<string, unknown>;
    if (raw.config)
      try {
        ctx.config = taskConfig(raw.config);
      } catch {
        /* retain validated local configuration */
      }
    const list = Array.isArray(raw.accounts) ? raw.accounts : [];
    const current = list.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        item.id === ctx.account?.id &&
        item.epoch === ctx.account?.epoch,
    );
    if (current && Array.isArray(current.steps))
      ctx.steps = current.steps.slice(-30).flatMap((step: any) =>
        taskActions.includes(step?.action) &&
        Object.hasOwn(states, step?.state) &&
        (!step.reason || Object.hasOwn(reasons, step.reason))
          ? [
              {
                action: step.action,
                state: step.state,
                reason: step.reason,
                at: Number.isFinite(step.at) ? step.at : 0,
              },
            ]
          : [],
      );
    ctx.note = raw.running === true ? '正在执行' : '已更新';
    return raw.running === true;
  };
}
