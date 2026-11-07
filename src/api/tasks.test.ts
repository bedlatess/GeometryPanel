import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, CloudClient } from './client';
import { TasksApi } from './tasks';
import { signH5 } from './sign';
import { defaultTaskConfig, taskActions, type TaskAction, type TaskConfig } from '../core/tasks-model';

const account = { uid: 'synthetic-user', token: 'synthetic-token' };
const at = Date.parse('2026-11-07T01:00:00Z');
const reply = (data: unknown, status = 200, code = 10000) => new Response(JSON.stringify({ code, data }), { status });
type Call = { path: string; method: string; query: Record<string, string>; body: any };
function fixture() {
  const calls: Call[] = [], done = new Set<string>(), claimed = new Set<string>();
  let signed = false, count = 29, unsafe = false, networkPost = false, expired = false;
  let own: any[] = [{ tuuid: 'existing-post', userid: account.uid, tcontent: '保留原帖', createDate: '2026-11-06 09:00:00' }];
  const api = new TasksApi(new CloudClient(async (input, init) => {
    const url = new URL(String(input)), path = url.pathname, body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body, query: Object.fromEntries(url.searchParams), method: String(init?.method) });
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${account.token}`);
    if (expired) return reply(null, 401, 401);
    if (path.endsWith('/signin/count')) return reply({ signStatus: signed ? 1 : 0, count });
    if (path === '/cfmotoservermine/H5/signin') { signed = true; count = 30; return reply({ continueDays: 30 }); }
    if (path.endsWith('/signin/info')) return reply({ signPrizeDate: '2026-11-07' });
    if (path.endsWith('/supplementPrize')) return reply({ prizesName: '合成积分奖励', integral: 20 });
    if (path.endsWith('/getByUserId')) return reply({ integralTotal: 120, ps0003_01_002_VOList: ['1023', '1026', '1024'].map(code => ({ code, name: `合成任务${code}`, completeFlag: done.has(code) ? 0 : 1 })) });
    if (path.endsWith('/totalIntegral')) return reply({ integralTotal: 120 });
    if (path.endsWith('/qbTzInfoNewV2')) return reply([{ tuuid: 'square-post', userid: 'another-user', tcontent: '广场合成动态', createDate: '2026-11-07 08:59:00' }]);
    if (path.endsWith('/likeFavoriteInfo')) { done.add('1026'); return reply(null); }
    if (path.includes('/article/share/')) return reply(null);
    if (path.endsWith('/adjustByShare')) { done.add('1024'); return reply(null); }
    if (path.endsWith('/mineArticleInfo')) return reply(own);
    if (path.endsWith('/commonArticle')) {
      own.push({ tuuid: 'created-post', userid: account.uid, tcontent: body.postcontent, createDate: unsafe ? null : '2026-11-07 09:00:00' }); done.add('1023');
      if (networkPost) throw new TypeError('Synthetic network ambiguity');
      return reply(null);
    }
    if (path.endsWith('/deleteArticle')) { assert.equal(url.searchParams.get('articleId'), 'created-post'); own = own.filter(row => row.tuuid !== 'created-post'); return reply(null); }
    throw new Error('Unexpected synthetic path');
  }));
  const options = { now: () => at, pause: async () => {}, claim: async (action: TaskAction, day: string) => { const key = `${day}:${action}`; if (claimed.has(key)) return false; claimed.add(key); return true; } };
  return { api, calls, options, done, setUnsafe: () => { unsafe = true; }, setNetworkPost: () => { networkPost = true; }, setExpired: () => { expired = true; } };
}
const selected = (...actions: TaskAction[]): TaskConfig => ({ ...defaultTaskConfig(), requestIntervalMs: 0, legacyLikeConfirmed: true, postContent: '本次合成发布内容', actions: Object.fromEntries(taskActions.map(key => [key, actions.includes(key)])) as TaskConfig['actions'] });

test('native H5 signature includes literal POST body and matches independent .NET golden vector', () => {
  const signature = signH5('{}', {}, 1700000000000, '00000000-0000-4000-8000-000000000000');
  assert.equal(signature.appId, 'AiTXmBrm'); assert.equal(signature.digest, '4ee2322857923859c3c38a6b9b025c51');
  assert.notEqual(signature.digest, signH5('', {}, signature.timestamp, signature.nonce).digest);
});
test('H5 host and path are fixed and APP DELETE preserves query signing', async () => {
  const calls: string[] = [];
  const cloud = new CloudClient(async (input, init) => {
    const url = new URL(String(input)); calls.push(url.href);
    if (url.hostname === 'h5.zeehoev.com') {
      const headers = init!.headers as Record<string, string>, parameters = new URLSearchParams(headers['cfmoto-x-param']);
      assert.equal(headers['cfmoto-x-sign'], signH5(String(init?.body ?? ''), Object.fromEntries(url.searchParams), Number(parameters.get('timestamp')), parameters.get('nonce')!).digest);
    }
    return reply(null);
  });
  await cloud.request('/cfmotoservermine/H5/signin', { service: 'h5', method: 'POST', body: {} });
  await cloud.request('/v1.0/social/cfmotoserversocial/commonArticle/deleteArticle', { method: 'DELETE', query: { postType: '1', articleId: 'synthetic-post' } });
  assert.match(calls[1], /\?articleId=synthetic-post&postType=1$/);
  await assert.rejects(cloud.request('/v1.0/test', { service: 'h5' }));
  await assert.rejects(cloud.request('/cfmotoservermine/H5/signin', { service: 'h5', appLike: true }));
});
test('defaults produce no reads or writes; a disabled legacy-like permission produces no like', async () => {
  const f = fixture(); assert.deepEqual(await f.api.run(account, defaultTaskConfig(), f.options), []); assert.equal(f.calls.length, 0);
  const steps = await f.api.run(account, { ...selected('like'), legacyLikeConfirmed: false }, f.options);
  assert.equal(steps[0].reason, 'state_unknown'); assert.equal(f.calls.some(call => call.path.endsWith('/likeFavoriteInfo')), false);
});
test('full sequential run verifies signin, prize and social writes and deletes exactly the new article', async () => {
  const f = fixture(), steps = await f.api.run(account, selected(...taskActions), f.options);
  assert.deepEqual(steps.map(row => [row.action, row.state]), taskActions.filter(action => action !== 'cleanup').map(action => [action, 'confirmed']).concat([['cleanup', 'confirmed']]));
  const like = f.calls.find(call => call.path.endsWith('/likeFavoriteInfo'))!;
  assert.deepEqual(like.body, { postId: 'square-post', kindFlag: '0' }); assert.equal(like.method, 'POST');
  const post = f.calls.find(call => call.path.endsWith('/commonArticle'))!;
  assert.deepEqual(post.body, { postSubInfo: { topicList: [] }, topicid: '', postcontent: '本次合成发布内容' });
  const deletion = f.calls.find(call => call.path.endsWith('/deleteArticle'))!;
  assert.equal(deletion.method, 'DELETE'); assert.deepEqual(deletion.query, { articleId: 'created-post', postType: '1' });
  assert.equal(JSON.stringify(steps).includes(account.uid), false); assert.equal(JSON.stringify(steps).includes(account.token), false);
  assert.equal(JSON.stringify(steps).includes('created-post'), false);
});
test('unsafe post evidence never deletes; an ambiguous publish is not repeated', async () => {
  const f = fixture(); f.setUnsafe();
  const steps = await f.api.run(account, selected('post', 'cleanup'), f.options);
  assert.equal(steps[0].reason, 'evidence_unsafe'); assert.equal(f.calls.some(call => call.path.endsWith('/deleteArticle')), false);
  await f.api.run(account, selected('post', 'cleanup'), f.options);
  assert.equal(f.calls.filter(call => call.path.endsWith('/commonArticle')).length, 1);
  const g = fixture(); g.setNetworkPost();
  const result = await g.api.run(account, selected('post', 'cleanup'), g.options);
  assert.deepEqual(result.map(row => row.state), ['confirmed', 'confirmed']);
  assert.equal(g.calls.filter(call => call.path.endsWith('/commonArticle')).length, 1);
});
test('already-complete flags and a persisted daily gate prevent duplicate actions', async () => {
  const f = fixture(); f.done.add('1023'); f.done.add('1024');
  const result = await f.api.run(account, selected('post', 'share'), f.options);
  assert.ok(result.every(row => row.reason === 'already_done'));
  const g = fixture(); const config = selected('share'); await g.api.run(account, config, g.options); g.done.delete('1024');
  const again = await g.api.run(account, config, g.options); assert.equal(again[0].reason, 'daily_gate');
  assert.equal(g.calls.filter(call => call.path.includes('/article/share/')).length, 1);
});
test('expiry and cancellation stop subsequent writes and never leak server diagnostics', async () => {
  const f = fixture(); f.setExpired();
  await assert.rejects(f.api.run(account, selected('signin', 'share', 'post'), f.options), (error: unknown) => error instanceof ApiError && error.kind === 'expired');
  assert.equal(f.calls.length, 1);
  const g = fixture(), aborter = new AbortController();
  await assert.rejects(g.api.run(account, selected('signin', 'post'), { ...g.options, signal: aborter.signal, claim: async () => { aborter.abort(); return true; } }), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(g.calls.filter(call => call.method !== 'GET').length, 0);
});
test('Beijing day rollover stops writes after the read or claim', async () => {
  const f = fixture(); let now = Date.parse('2026-11-07T15:59:59.999Z');
  await assert.rejects(f.api.run(account, selected('signin'), { ...f.options, now: () => now, pause: async () => { now += 2; } }));
  assert.equal(f.calls.some(call => call.path === '/cfmotoservermine/H5/signin'), false);
});
test('caller mutation during a daily claim cannot switch the account used by later writes', async () => {
  const f = fixture(), mutable = { ...account };
  const steps = await f.api.run(mutable, selected('share'), { ...f.options, claim: async () => { mutable.uid = 'other-synthetic'; mutable.token = 'other-token'; return true; } });
  assert.equal(steps[0].state, 'confirmed');
  assert.ok(f.calls.filter(call => call.path.endsWith('/getByUserId')).every(call => call.query.userId === account.uid));
});
