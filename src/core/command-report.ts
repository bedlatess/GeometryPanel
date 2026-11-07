import type { ApiErrorKind } from '../api/client';

export type HornMode = 'normal' | 'high';
export interface CommandStep {
  stage: 'prepare' | 'control';
  state: 'sending' | 'accepted' | 'failed' | 'cancelled';
  failure?: ApiErrorKind;
  httpStatus?: number;
  businessCode?: string;
}
export interface HornReport { mode: HornMode; startedAt: number; steps: CommandStep[] }

export function commandSummary(report: HornReport, version: string): string {
  const states = { sending: '等待结果', accepted: '服务已受理', failed: '未完成', cancelled: '已停止等待，执行结果未确认' };
  const failures = { expired: '登录失效', network: '网络中断或超时', rejected: '服务返回否定结果', format: '响应格式无法识别', limit: '响应超出限制' };
  return [
    `几何面板 ${version}`,
    `操作：${report.mode === 'high' ? '高声寻车' : '普通寻车'}`,
    `时间：${new Date(report.startedAt).toLocaleString('zh-CN')}`,
    ...report.steps.map(step => `${step.stage === 'prepare' ? '寻车准备' : '鸣笛下发'}：${states[step.state]}`
      + (step.failure ? ` · ${failures[step.failure]}` : '')
      + (step.httpStatus ? ` · HTTP ${step.httpStatus}` : '')
      + (step.businessCode ? ` · 业务码 ${step.businessCode}` : '')),
    '实际鸣响需现场确认。摘要不含账号、车辆编号或登录凭据。',
  ].join('\n');
}
