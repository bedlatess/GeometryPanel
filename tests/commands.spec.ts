import { test, expect, open, login, VIN_A } from './fixtures';

const commands = (calls: { path: string }[]) => calls.filter(call => /dbpoint\/send|vehicleInfo\/control/.test(call.path));

test('high-volume search is explicit and only sends its recovered request', async ({ page, mocks }) => {
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  expect(commands(mocks.calls)).toHaveLength(0);
  await page.getByRole('button', { name: '高声寻车', exact: true }).click();
  expect(commands(mocks.calls)).toHaveLength(0);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText('已发送鸣笛寻车');
  expect(commands(mocks.calls)).toEqual([expect.objectContaining({
    path: '/v1.0/app/cfmotoserverapp/vehicleInfo/controlV2', method: 'POST', body: { param: '4', vin: VIN_A },
  })]);
});

test('preparation alone never shows success; both buttons lock until the PUT finishes', async ({ page, mocks }) => {
  let release!: () => void;
  mocks.holdCommand = { stage: 'normal', wait: new Promise<void>(resolve => { release = resolve; }) };
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); });
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => commands(mocks.calls).length).toBe(2);
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '高声寻车', exact: true })).toBeDisabled();
  await expect(page.locator('.notice')).not.toContainText('已提交');
  release();
  await expect(page.locator('.notice')).toContainText('已发送鸣笛寻车');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '查看上次车控结果', exact: true }).click();
  const summary = page.locator('.diagnostic-summary');
  await expect(summary).toContainText('寻车准备：服务已受理');
  await expect(summary).toContainText('鸣笛下发：服务已受理');
  await expect(summary).not.toContainText(VIN_A);
  await expect(summary).not.toContainText('synthetic-token');
  await expect(summary).not.toContainText('13800000000');
  await page.getByRole('button', { name: '复制排查摘要' }).click();
  await expect(page.locator('#modal-message')).toContainText('可长按上方摘要复制');
  expect(commands(mocks.calls)).toHaveLength(2);
});

test('a negative PUT is not accepted and its summary remains private', async ({ page, mocks }) => {
  mocks.commandResults.normal = 'false';
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#modal-message')).toContainText('未收到车辆响应');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '查看上次车控结果', exact: true }).click();
  await expect(page.locator('.diagnostic-summary')).toContainText('鸣笛下发：未完成 · 服务返回否定结果');
  await expect(page.locator('.diagnostic-summary')).not.toContainText('synthetic-private-value');
  expect(commands(mocks.calls)).toHaveLength(2);
});

test('a rejected high-volume request does not run ordinary search as a fallback', async ({ page, mocks }) => {
  mocks.commandResults.high = 'rejected';
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '高声寻车', exact: true }).click();
  expect(commands(mocks.calls)).toHaveLength(0);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#modal-message')).toContainText('未收到车辆响应');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '查看上次车控结果', exact: true }).click();
  await expect(page.locator('.diagnostic-summary')).toContainText('HTTP 200 · 业务码 30121');
  expect(commands(mocks.calls)).toHaveLength(1);
});

test('a network failure at the PUT is uncertain and never retries automatically', async ({ page, mocks }) => {
  mocks.commandResults.normal = 'network';
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#modal-message')).toContainText('未收到车辆响应');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '查看上次车控结果', exact: true }).click();
  await expect(page.locator('.diagnostic-summary')).toContainText('鸣笛下发：未完成 · 网络中断或超时');
  expect(commands(mocks.calls)).toHaveLength(2);
});

test('expiry at the PUT disables controls without asking for another SMS automatically', async ({ page, mocks }) => {
  mocks.commandResults.normal = 'expired';
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#modal-message')).toHaveText('登录已过期');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: '寻车' })).toBeDisabled();
  expect(commands(mocks.calls)).toHaveLength(2);
  expect(mocks.calls.filter(call => call.path.endsWith('/authCode/V2'))).toHaveLength(1);
});

test('closing an in-flight PUT records cancellation and ignores late acceptance', async ({ page, mocks }) => {
  let release!: () => void;
  mocks.holdCommand = { stage: 'normal', wait: new Promise<void>(resolve => { release = resolve; }) };
  await open(page); await login(page);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => commands(mocks.calls).length).toBe(2);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await expect(page.locator('.notice')).toContainText('未收到车辆响应');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '查看上次车控结果', exact: true }).click();
  await expect(page.locator('.diagnostic-summary')).toContainText('鸣笛下发：已停止等待，执行结果未确认');
  await expect(page.locator('.diagnostic-summary')).not.toContainText('鸣笛下发：服务已受理');
  expect(commands(mocks.calls)).toHaveLength(2);
});
