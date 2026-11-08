import { navigate, control, report, developerLab, test, expect, open, login } from './fixtures';

const settings = (page: import('@playwright/test').Page) => navigate(page, '/me/home');
const reads = (calls: { path: string }[]) => calls.filter(call => call.path.includes('/vehicleHomePageV2/')).length;
const commands = (calls: { path: string }[]) => calls.filter(call => /dbpoint\/send|vehicleSet\/|vehicleInfo\/control/.test(call.path));

test('range uses the homepage even when a battery placeholder says zero, and preserves a real home zero', async ({ page, mocks }) => {
  mocks.home = { hmiRidableMile: 64 }; mocks.battery = { hmiRidableMile: 0 };
  await open(page); await login(page);
  await expect(page.locator('.metric').filter({ hasText: '预计续航' }).locator('strong')).toHaveText('64km');
  mocks.home.hmiRidableMile = 0;
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('.metric').filter({ hasText: '预计续航' }).locator('strong')).toHaveText('0km');
  mocks.home.hmiRidableMile = [];
  await page.getByRole('button', { name: '刷新车况' }).click();
  await expect(page.locator('.metric').filter({ hasText: '预计续航' }).locator('strong')).toHaveText('—');
});

test('map opens inside the panel only after a click, with a safe external fallback and clear find-car wording', async ({page,mocks})=>{
 mocks.home={location:{longitude:116.397,latitude:39.908}};
 await open(page);await login(page);await navigate(page,'/vehicle/location');
 expect(mocks.maps).toHaveLength(0);
 await expect(page.getByRole('link',{name:'步行找车'})).toBeVisible();
 await page.getByRole('button',{name:'查看地图',exact:true}).click();
 const iframe=page.locator('iframe[title="车辆停车位置地图"]');await expect(iframe).toBeVisible();
 await expect(iframe).toHaveAttribute('referrerpolicy','no-referrer');await expect(iframe).toHaveAttribute('allow',"geolocation 'none'");
 await expect(page.frameLocator('iframe').getByText('模拟地图 · 合成停车点')).toBeVisible();expect(mocks.maps).toHaveLength(1);
 await navigate(page,'/vehicle/location/coordinates');await expect(page.getByRole('link',{name:'在地图中打开'})).toHaveAttribute('rel','noopener noreferrer');expect(commands(mocks.calls)).toHaveLength(0);
 await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page.locator('iframe')).toHaveCount(0);
});

test('configuration controls survive reopen, backup never contains account data, and reset keeps login', async ({page,mocks})=>{
 await open(page);await login(page);await navigate(page,'/me/home');
 await page.getByRole('button',{name:/打开后的首页/}).click();await page.getByRole('dialog').getByRole('button',{name:'记录',exact:true}).click();
 await page.getByRole('button',{name:/第 1 个按键/}).click();await page.getByRole('dialog').getByRole('button',{name:'胎压',exact:true}).click();
 await page.getByRole('switch',{name:'首页显示续航'}).click();await page.getByRole('switch',{name:'回到前台自动刷新'}).click();
 await navigate(page,'/me/backup');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出配置',exact:true}).click();const stream=await(await downloading).createReadStream();let backup='';for await(const chunk of stream!)backup+=chunk.toString();
 expect(JSON.parse(backup).preferences.startPage).toBe('records');expect(JSON.parse(backup).preferences.shortcut[0]).toBe('tires');
 for(const value of ['synthetic-token','synthetic-user','13800000000','LAAAAAAAA','Bearer'])expect(backup).not.toContain(value);
 await navigate(page,'/records');await page.reload();await expect(page.getByRole('heading',{name:'记录',exact:true})).toBeVisible();
 await navigate(page,'/vehicle');await expect(page.locator('.metric').filter({hasText:'预计续航'})).toHaveCount(0);
 await page.getByRole('button',{name:'座桶',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('测试极核 A');expect(commands(mocks.calls)).toHaveLength(0);
 await page.getByRole('button',{name:'关闭',exact:true}).click();await navigate(page,'/me/backup');
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'恢复默认',exact:true}).click();
 await navigate(page,'/me/home');await expect(page.getByRole('button',{name:/打开后的首页/})).toContainText('车辆');await expect(page.getByRole('switch',{name:'首页显示续航'})).toBeChecked();
 await navigate(page,'/me/accounts');await expect(page.getByRole('button',{name:'退出全部账号',exact:true})).toBeVisible();
 await navigate(page,'/me/backup');await page.getByRole('button',{name:'导入配置',exact:true}).click();await page.getByRole('textbox',{name:'粘贴配置',exact:true}).fill(backup);await page.getByRole('dialog').getByRole('button',{name:'导入配置',exact:true}).click();
 await navigate(page,'/me/home');await expect(page.getByRole('button',{name:/打开后的首页/})).toContainText('记录');await expect(page.getByRole('switch',{name:'回到前台自动刷新'})).not.toBeChecked();
 await navigate(page,'/me/accounts');await expect(page.getByRole('button',{name:'退出全部账号',exact:true})).toBeVisible();
});
test('invalid configuration does not change the current preferences or account',async({page})=>{
 await open(page);await login(page);await navigate(page,'/me/backup');
 await page.getByRole('button',{name:'导入配置',exact:true}).click();await page.getByRole('textbox',{name:'粘贴配置',exact:true}).fill('{"app":"GeometryPanel","schema":1,"token":"synthetic-private-value"}');
 await page.getByRole('dialog').getByRole('button',{name:'导入配置',exact:true}).click();await expect(page.locator('.notice')).toHaveText('配置格式不正确');await expect(page.locator('.notice')).not.toContainText('synthetic-private-value');
 await navigate(page,'/me/home');await expect(page.getByRole('button',{name:/打开后的首页/})).toContainText('车辆');await navigate(page,'/me/accounts');await expect(page.getByRole('button',{name:'退出全部账号',exact:true})).toBeVisible();
});

test('back-forward restore refreshes once when old enough; disabled auto-read and confirmation prevent extra reads', async ({ page, mocks }) => {
  await page.clock.install(); await open(page); await login(page);
  const initial = reads(mocks.calls);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial);
  await page.clock.fastForward(61000);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => reads(mocks.calls)).toBe(initial + 1);
  await expect(page.getByRole('button', { name: '刷新车况' })).toBeEnabled();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial + 1);
  await page.getByRole('button', { name: '寻车' }).click();
  await page.clock.fastForward(61000);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial + 1);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await settings(page);
  await navigate(page,'/me/home');await page.getByRole('switch',{name:'回到前台自动刷新'}).click();
  await page.clock.fastForward(61000);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(reads(mocks.calls)).toBe(initial + 1);
  expect(commands(mocks.calls)).toHaveLength(0);
});

test('standalone guidance detects an installed iPhone entry without claiming browser logins transfer',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true,configurable:true});});await open(page);await login(page);await navigate(page,'/me/install');await expect(page.getByText('已添加到主屏幕',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'添加到主屏幕',exact:true})).toBeVisible();
});

test('unavailable preference storage leaves the session intact and tells the user changes are temporary', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(':preferences')) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await open(page); await login(page); await settings(page);
  await navigate(page,'/me/home');await page.getByRole('button',{name:/打开后的首页/}).click();await page.getByRole('dialog').getByRole('button',{name:'记录',exact:true}).click();
  await expect(page.locator('.notice')).toContainText('保存失败，请重试');
  await navigate(page,'/me/accounts');await expect(page.getByRole('button',{name:'退出全部账号',exact:true})).toBeVisible();
  await page.reload();
  await navigate(page,'/vehicle');await expect(page.getByRole('heading', { name: '测试极核 A', exact: true })).toBeVisible();
});
