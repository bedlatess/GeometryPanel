import type { AccountBook } from '../../../core/accounts';
import type { Session } from '../../../core/model';
import { type NativeClient } from '../../../core/native';
import { type TaskAction, type TaskReason, type TaskStep } from '../../../core/tasks-model';
import { type PageActions } from '../../workflow-actions';
export const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const labels: Record<TaskAction, string> = {
  signin: '每日签到',
  streakPrize: '连签奖励',
  like: '点赞广场动态',
  share: '分享并领取积分',
  post: '发布我的文字动态',
  cleanup: '清理本次发布的动态',
};
export const reasons: Record<TaskReason, string> = {
  already_done: '已完成',
  not_eligible: '条件未满足',
  state_unknown: '状态未知',
  no_target: '无可选动态',
  daily_gate: '今日已尝试',
  evidence_unsafe: '未确认新动态，停止清理',
  accepted_not_verified: '结果待确认',
  network: '网络不可用',
  rejected: '未被接受',
  expired: '登录已过期',
  cancelled: '已停止等待',
};
export const states: Record<TaskStep['state'], string> = {
  confirmed: '已核实',
  skipped: '已跳过',
  uncertain: '待确认',
  failed: '未完成',
};
export type Options = {
  session: Session | null;
  demo: boolean;
  native: NativeClient;
  accounts: AccountBook;
  onExpired(): void;
  onUncertain?(): void;
  onNativeConsent?: () => Promise<unknown>;
  actions: PageActions;
  publish(value: any): void;
};
