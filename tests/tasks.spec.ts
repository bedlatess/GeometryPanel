import { test, expect, open, login, type Call, type TaskMocks } from './fixtures';
import type { Page } from '@playwright/test';

const sample = (): TaskMocks => ({ summary: { integralTotal: 1280, ps0003_01_002_VOList: [
  { code: '1023', name: '每日发布动态', completeFlag: 1 }, { code: '1026', name: '点赞内容', completeFlag: 1 }, { code: '1024', name: '分享内容', completeFlag: 1 },
] }, sign: { signStatus: 0, count: 6 }, mine: [{ tuuid: 'old-synthetic', userid: 'synthetic-user', tcontent: '已有动态应保留', createDate: '2026-11-06 09:00:00' }] });
const panel = (page: Page) => page.locator('#tasks-panel');
async function show(page: Page) {
  await page.getByRole('button', { name: '用车', exact: true }).click();
  await page.getByRole('button', { name: '签到、积分与自动任务', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: '保存任务设置', exact: true })).toBeEnabled();
}
const mutations = (calls: Call[]) => calls.filter(call => /\/(?:H5\/signin|likeFavoriteInfo|commonArticle|deleteArticle|adjustByShare|supplementPrize)$/.test(call.path) || call.path.includes('/article/share/'));

test('task entry reads synthetic status while every automatic action stays off and content is escaped', async ({ page, mocks }) => {
  mocks.tasks = sample(); mocks.tasks.summary.ps0003_01_002_VOList[0].name = '<img src=x onerror=alert(1)>';
  await open(page); await login(page); await show(page);
  await expect(panel(page)).toContainText('总积分：1280');
  await expect(panel(page).getByLabel('每日签到', { exact: true })).not.toBeChecked();
  await expect(panel(page).getByLabel('发布我的文字动态', { exact: true })).not.toBeChecked();
  await expect(panel(page)).toContainText('<img src=x onerror=alert(1)>');
  expect(await panel(page).locator('img').count()).toBe(0);
  expect(mutations(mocks.calls)).toEqual([]);
  await expect(panel(page)).toContainText('关闭 Safari 后不会继续定时运行');
  expect(await panel(page).textContent()).not.toContain('synthetic-token');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('signin is confirmed separately, uses the fixed H5 origin and rereads actual completion', async ({ page, mocks }) => {
  mocks.tasks = sample(); await open(page); await login(page); await show(page);
  await panel(page).getByLabel('每日签到', { exact: true }).check();
  await panel(page).getByLabel('请求间隔（秒）').fill('0');
  await panel(page).getByRole('button', { name: '保存任务设置', exact: true }).click();
  await panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true }).click();
  expect(mutations(mocks.calls)).toEqual([]);
  await expect(panel(page).getByLabel('确认积分任务')).toContainText('每日签到');
  await panel(page).getByRole('button', { name: '确认执行所选任务', exact: true }).click();
  await expect(panel(page)).toContainText('每日签到：已核实');
  const signin = mocks.calls.find(call => call.path.endsWith('/H5/signin'))!;
  expect(signin.origin).toBe('https://h5.zeehoev.com'); expect(signin.body).toEqual({}); expect(signin.method).toBe('POST');
  await expect(panel(page)).toContainText('今日已签到');
  expect(mutations(mocks.calls)).toHaveLength(1);
});
test('post and cleanup require exact user text and delete only the unique new article', async ({ page, mocks }) => {
  mocks.tasks = sample(); await open(page); await login(page); await show(page);
  await panel(page).getByLabel('发布我的文字动态', { exact: true }).check();
  await panel(page).getByLabel('清理本次发布的动态', { exact: true }).check();
  await panel(page).getByLabel('要发布的文字').fill('只用于合成浏览器测试的动态');
  await panel(page).getByLabel('请求间隔（秒）').fill('0');
  await panel(page).getByRole('button', { name: '保存任务设置', exact: true }).click();
  expect(mutations(mocks.calls)).toEqual([]);
  await panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true }).click();
  await expect(panel(page).getByLabel('确认积分任务')).toContainText('只用于合成浏览器测试的动态');
  await panel(page).getByRole('button', { name: '确认执行所选任务', exact: true }).click();
  await expect(panel(page)).toContainText('清理本次发布的动态：已核实');
  const writes = mutations(mocks.calls); expect(writes).toHaveLength(2);
  expect(writes[0].body).toEqual({ postSubInfo: { topicList: [] }, topicid: '', postcontent: '只用于合成浏览器测试的动态' });
  expect(writes[1].method).toBe('DELETE'); expect(writes[1].query).toEqual({ articleId: 'created-synthetic', postType: '1' });
  expect(mocks.tasks.mine?.map(row => row.tuuid)).toEqual(['old-synthetic']);
});
test('unsafe publishing evidence and persisted daily gate prevent guessing a deletion or repeating publication', async ({ page, mocks }) => {
  mocks.tasks = sample(); mocks.tasks.unsafePost = true; mocks.tasks.noConfirm = true;
  await open(page); await login(page); await show(page);
  await panel(page).getByLabel('发布我的文字动态', { exact: true }).check();
  await panel(page).getByLabel('清理本次发布的动态', { exact: true }).check();
  await panel(page).getByLabel('要发布的文字').fill('证据不完整测试');
  await panel(page).getByLabel('请求间隔（秒）').fill('0');
  await panel(page).getByRole('button', { name: '保存任务设置', exact: true }).click();
  await panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认执行所选任务', exact: true }).click();
  await expect(panel(page)).toContainText('未取得唯一文章证据');
  await expect(panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true })).toBeEnabled();
  await panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认执行所选任务', exact: true }).click();
  await expect(panel(page)).toContainText('今天已有执行尝试');
  expect(mutations(mocks.calls).map(call => call.path.split('/').at(-1))).toEqual(['commonArticle']);
});
test('legacy like behavior needs its own saved opt-in before any request', async ({ page, mocks }) => {
  mocks.tasks = sample(); await open(page); await login(page); await show(page);
  await panel(page).getByLabel('点赞广场动态', { exact: true }).check();
  await panel(page).getByLabel('请求间隔（秒）').fill('0');
  await panel(page).getByRole('button', { name: '保存任务设置', exact: true }).click();
  await panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认执行所选任务', exact: true }).click();
  await expect(panel(page)).toContainText('状态不明确，已跳过'); expect(mutations(mocks.calls)).toEqual([]);
  await panel(page).getByLabel('同意按旧版方式提交点赞', { exact: false }).check();
  await panel(page).getByRole('button', { name: '保存任务设置', exact: true }).click();
  await panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认执行所选任务', exact: true }).click();
  await expect(panel(page)).toContainText('点赞广场动态：已核实');
  expect(mutations(mocks.calls)[0].body).toEqual({ postId: 'square-synthetic', kindFlag: '0' });
});
test('closing during a post stops later evidence and cleanup while retaining the daily attempt gate', async ({ page, mocks }) => {
  mocks.tasks = sample(); let release!: () => void;
  mocks.tasks.hold = { kind: 'post', wait: new Promise<void>(resolve => { release = resolve; }) };
  await open(page); await login(page); await show(page);
  await panel(page).getByLabel('发布我的文字动态', { exact: true }).check();
  await panel(page).getByLabel('清理本次发布的动态', { exact: true }).check();
  await panel(page).getByLabel('要发布的文字').fill('取消时的合成内容');
  await panel(page).getByLabel('请求间隔（秒）').fill('0');
  await panel(page).getByRole('button', { name: '保存任务设置', exact: true }).click();
  await panel(page).getByRole('button', { name: '执行当前账号已选任务', exact: true }).click();
  await panel(page).getByRole('button', { name: '确认执行所选任务', exact: true }).click();
  await expect.poll(() => mocks.calls.some(call => call.path.endsWith('/commonArticle'))).toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); release();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(mocks.calls.some(call => call.path.endsWith('/deleteArticle'))).toBe(false);
});
test('native task activation syncs credentials only after explicit consent and saves without running', async ({ page, mocks }) => {
  mocks.tasks = sample();
  await page.addInitScript(() => {
    const scope = window as any; scope.__taskNativeCalls = []; let config: any = null;
    scope.GeometryNative = { postMessage(raw: string) {
      const call = JSON.parse(raw); scope.__taskNativeCalls.push(call);
      if (call.method === 'tasks.configure') config = call.params;
      const result = call.method === 'capabilities' ? { platform: 'android', version: 1, features: { tasks: true }, limitations: [] }
        : call.method.startsWith('tasks.') ? { enabled: config?.enabled ?? false, running: false, backgroundMode: 'foreground-service', jobScheduled: config?.enabled ?? false, config, accounts: [] } : {};
      queueMicrotask(() => scope.GeometryNative.onmessage?.({ data: JSON.stringify({ id: call.id, ok: true, result }) }));
    } };
  });
  await open(page); await login(page); await show(page);
  expect(await page.evaluate(() => (window as any).__taskNativeCalls.filter((call: any) => call.method === 'accounts.sync').length)).toBe(0);
  await panel(page).getByLabel('每日签到', { exact: true }).check();
  await panel(page).getByLabel('启用原生定时任务', { exact: true }).check();
  await panel(page).getByRole('button', { name: '保存任务设置', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__taskNativeCalls.filter((call: any) => call.method === 'accounts.sync').length)).toBe(0);
  await panel(page).getByRole('button', { name: '确认启用并保存', exact: true }).click();
  await expect(panel(page)).toContainText('定时任务配置已保存');
  const calls = await page.evaluate(() => (window as any).__taskNativeCalls.map((call: any) => call.method));
  expect(calls.indexOf('accounts.sync')).toBeLessThan(calls.indexOf('tasks.configure')); expect(calls).not.toContain('tasks.run');
  expect(mutations(mocks.calls)).toEqual([]);
});
