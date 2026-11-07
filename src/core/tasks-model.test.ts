import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleTime, createdArticle, defaultTaskConfig, integralTasks, signCount, taskArticles, taskConfig } from './tasks-model';

test('automatic actions and legacy-like confirmation default off; posting requires real user text', () => {
  const defaults = defaultTaskConfig();
  assert.equal(defaults.enabled, false); assert.equal(defaults.legacyLikeConfirmed, false);
  assert.ok(Object.values(defaults.actions).every(value => value === false));
  assert.throws(() => taskConfig({ ...defaults, actions: { ...defaults.actions, post: true } }));
  assert.throws(() => taskConfig({ ...defaults, actions: { ...defaults.actions, cleanup: true } }));
  for (const gap of [-1, 60001, NaN]) assert.throws(() => taskConfig({ ...defaults, requestIntervalMs: gap }));
  assert.equal(taskConfig({ ...defaults, actions: { ...defaults.actions, post: true }, postContent: '我的合成测试文字' }).actions.post, true);
});
test('recovered task code mapping and inverted completion flag stay explicit; unknown is not incomplete', () => {
  const result = integralTasks({ integralTotal: 123, ps0003_01_002_VOList: [
    { code: 1023, name: '发动态', completeFlag: 0 }, { code: '1026', name: '点赞', completeFlag: '1' },
    { code: '1024', name: '分享', completeFlag: null }, { code: 9999, name: '未知任务', completeFlag: true },
  ] });
  assert.deepEqual(result.tasks.map(row => [row.action, row.completed]), [['post', true], ['like', false], ['share', null], [null, null]]);
  assert.throws(() => integralTasks({}));
  assert.deepEqual(signCount({ signStatus: '01', count: '30' }), { signed: true, count: 30 });
  assert.deepEqual(signCount({ signStatus: 7, count: null }), { signed: null, count: null });
});
test('article identity and Beijing timestamps reject unsafe aliases and malformed dates', () => {
  assert.equal(articleTime('2026-02-30 12:00:00'), null);
  assert.equal(articleTime('2026-11-07 24:00:00'), null);
  assert.equal(articleTime('2026-11-07 09:00:00.123456'), Date.parse('2026-11-07T01:00:00.123Z'));
  for (const id of [true, false, 0, '0', 'null', 'id?x=1', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => taskArticles([{ tuuid: id }]));
});
test('precise cleanup requires one new ID, same author, exact content and bounded creation time', () => {
  const started = Date.parse('2026-11-07T01:00:00Z'), before = taskArticles([{ tuuid: 'old-post' }]);
  const fresh = { tuuid: 'fresh', userid: 'synthetic-user', tcontent: '测试文字', createDate: '2026-11-07 09:00:00' };
  const proof = (items: unknown[]) => createdArticle(before, taskArticles(items), 'synthetic-user', '测试文字', started, started + 1000);
  assert.deepEqual(proof([{ tuuid: 'old-post' }, fresh]), { id: 'fresh', safe: true });
  assert.deepEqual(proof([fresh, { ...fresh, tuuid: 'duplicate' }]), { id: null, safe: false });
  assert.deepEqual(proof([{ ...fresh, userid: 'another-user' }]), { id: null, safe: true });
  assert.deepEqual(proof([{ ...fresh, tcontent: '测试文字 ' }]), { id: null, safe: true });
  assert.deepEqual(proof([{ ...fresh, createDate: '2026-11-06 09:00:00' }]), { id: null, safe: true });
  assert.deepEqual(proof([{ ...fresh, createDate: null }]), { id: null, safe: false });
});
