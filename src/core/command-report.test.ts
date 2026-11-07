import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/client';
import { commandSummary } from './command-report';

test('command diagnostics preserve only a numeric business code and HTTP status', () => {
  const error = new ApiError('rejected', 200, '30121');
  assert.equal(error.httpStatus, 200);
  assert.equal(error.businessCode, '30121');
  for (const value of ['synthetic-token', '13800000000', 'LAAAAAAAAAAAAAAA1', {}, null]) {
    assert.equal(new ApiError('rejected', 200, value).businessCode, undefined);
  }
  const summary = commandSummary({ mode: 'normal', startedAt: 1700000000000, steps: [
    { stage: 'prepare', state: 'accepted' },
    { stage: 'control', state: 'failed', failure: error.kind, httpStatus: error.httpStatus, businessCode: error.businessCode },
  ] }, '0.1.2');
  assert.match(summary, /寻车准备：服务已受理/);
  assert.match(summary, /鸣笛下发：未完成.*HTTP 200.*业务码 30121/);
  assert.match(summary, /实际鸣响需现场确认/);
  assert.doesNotMatch(summary, /synthetic-token|13800000000|LAAAAAAAAAAAAAAA1/);
});
