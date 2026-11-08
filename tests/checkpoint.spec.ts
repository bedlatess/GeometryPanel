import { test, expect, open, login, navigate, auditData, ownerData, cars } from './fixtures';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
test.use({ deviceScaleFactor: 2, reducedMotion: 'reduce' });
const out = process.env.CHECKPOINT_OUT || '../docs/audit/0.9.0/截图';
async function state(page: Page, values: Record<string, unknown>) {
  await page.evaluate((data) => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const session = app.config.globalProperties.$pinia._s.get('session');
    session.state = { ...session.state, ...data };
  }, values);
}
async function stable(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(600);
}
for (const theme of ['light', 'dark'])
  test(`R2 core screens and states ${theme}`, async ({ page, mocks }, info) => {
    test.setTimeout(240000);
    // Ionic rejects ghost clicks by elapsed wall time; its clock must keep ticking.
    await page.clock.install({ time: new Date(1794110400000) });
    Object.assign(mocks, auditData());
    mocks.owner = { data: structuredClone(ownerData) };
    (mocks.owner.data.caps as unknown[]).push({
      functionCode: 'AUTOMATIC_PARKING_GO',
      isSupport: false,
      functionName: '自动驻车',
    });
    mocks.home!.refreshTime = 1794110400000 - 180000;
    mocks.owner.data.home = { ...(mocks.owner.data.home as object), ...mocks.home };
    mocks.owner.data.tires = mocks.extensions!.tires;
    mocks.owner.data.examination = { heteroconstant: 0 };
    mocks.extensions!.month = {
      rideMileageTotal: 8818.9,
      rideRecordList: [
        { date: '2026.11.06', rideMileage: 12.4, ridingTimeDayUnitMinute: 28, maxSpeed: 39 },
        ...[38.6, 42, 28, 35, 30].map((value, i) => ({
          date: `2026.11.0${i + 1}`,
          rideMileage: value,
          ridingTimeDayUnitMinute: [90, 97, 65, 81, 71][i],
          maxSpeed: 39,
        })),
      ],
    };
    mocks.extensions!.tires = {
      updateTime: 1794110400000 - 180000,
      realTimeData: [
        { sensorPosition: 1, tirePressure: 1.9, tireTemp: 23, reportTime: 1794110400000 - 180000 },
        { sensorPosition: 2, tirePressure: 2.6, tireTemp: 25, reportTime: 1794110400000 - 180000 },
      ],
    };
    mocks.owner.data.tires = mocks.extensions!.tires;
    mocks.owner.data.tireHistory = {
      data: [1, 2].map((sensorPosition) => ({
        sensorPosition,
        tirePressureStat: {
          list: Array.from({ length: 8 }, (_, i) => ({
            time: Math.floor((1794110400000 - (7 - i) * 3600000) / 1000),
            value: sensorPosition === 1 ? 2.2 - i * 0.04 : 2.6,
          })),
        },
        tireTempStat: { list: [{ time: Math.floor(1794110400000 / 1000), value: 24 }] },
      })),
    };
    mocks.vehicleRows = [
      {
        ...cars[0],
        vehicleName: 'AE5i 通勤',
        vehicleType: 'AE5i',
        vehiclePicUrl: 'https://assets.example.invalid/neutral-vehicle.png',
      },
      cars[1],
    ];
    // Visual scenes keep their explicit input stable; business regressions keep all timers running.
    await page.addInitScript(() => {
      const interval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
        delay === 1000 ? 0 : interval(handler, delay, ...args)) as typeof window.setInterval;
    });
    const recorded: { file: string; route: string }[] = [];
    const dir = `${out}/${info.project.name}`;
    await mkdir(dir, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      document.documentElement.style.setProperty('--ion-safe-area-top', '54px');
      document.documentElement.style.setProperty('--ion-safe-area-bottom', '34px');
    }, theme);
    async function shot(name: string) {
      await stable(page);
      const file = `${name}-${theme}.png`;
      await expect(page).toHaveScreenshot(file, { animations: 'allow', maxDiffPixelRatio: 0.001 });
      await page.screenshot({ path: `${dir}/${file}` });
      recorded.push({ file, route: page.url() });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await shot('14-欢迎');
    await login(page, 'AE5i 通勤');
    await expect(page.locator('.notice')).not.toBeVisible();
    const tabBar = await page.locator('ion-tab-bar').boundingBox();
    expect(tabBar!.height).toBeCloseTo(83, 0);
    expect(tabBar!.y).toBeCloseTo(761, 0);
    for (const button of await page.locator('ion-tab-button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await state(page, {
      preferences: {
        ...(await page.evaluate(
          () =>
            (
              document.querySelector('#app') as any
            ).__vue_app__.config.globalProperties.$pinia._s.get('session').state.preferences,
        )),
        theme,
      },
    });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const original = await page.evaluate(() => {
      const s = (
        document.querySelector('#app') as any
      ).__vue_app__.config.globalProperties.$pinia._s.get('session').state;
      return JSON.parse(JSON.stringify({ session: s.session, reading: s.reading }));
    });
    original.session.vehicle.name = 'AE5i 通勤';
    original.session.vehicle.type = 'AE5i';
    original.reading.daily.reportedAt = 1794110400000 - 180000;
    original.reading.daily.reportState = 'fresh';
    original.reading.daily.vehicleLocked = true;
    await state(page, original);
    await page.evaluate(() => {
      const store = (
        document.querySelector('#app') as any
      ).__vue_app__.config.globalProperties.$pinia._s.get('session');
      store.state.accountBook.accounts[0].vehicles[0].label = 'AE5i 通勤';
    });
    await shot('01-首页');
    await state(page, { reading: { ...original.reading, soc: 100, charging: '已充满' } });
    await shot('01-首页-已充满');
    await state(page, { reading: { ...original.reading, soc: 17 } });
    await shot('01-首页-低电量');
    await state(page, {
      reading: {
        ...original.reading,
        daily: {
          ...original.reading.daily,
          reportState: 'future',
          reportedAt: 1794110400000 + 600000,
          vehicleLocked: null,
        },
      },
    });
    await shot('01-首页-时间异常');
    await state(page, {
      reading: {
        ...original.reading,
        daily: {
          ...original.reading.daily,
          reportState: 'unknown',
          reportedAt: null,
          vehicleLocked: null,
        },
      },
    });
    await shot('01-首页-更新时间未知');
    await state(page, {
      reading: {
        ...original.reading,
        charging: '充电中',
        soc: 62,
        range: 74,
        daily: { ...original.reading.daily, expectedFullText: '1 小时 20 分' },
      },
    });
    await shot('02-首页-充电');
    await state(page, {
      reading: {
        ...original.reading,
        soc: 17,
        daily: {
          ...original.reading.daily,
          reportState: 'stale',
          reportedAt: 1794110400000 - 7200000,
        },
      },
    });
    await shot('03-首页-数据过期');
    await state(page, {
      session: {
        ...original.session,
        vehicle: {
          ...original.session.vehicle,
          name: '家里那台',
          type: 'AE8',
          vin: 'LCCCCCCCCCCCCCCC3',
          vehiclePicUrl: undefined,
        },
      },
      reading: {
        ...original.reading,
        soc: 96,
        daily: { ...original.reading.daily, vehicleLocked: false },
      },
    });
    await shot('04-首页-无车图');
    await state(page, original);
    await page.evaluate(() => {
      const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties
        .$pinia;
      pinia._s.get('owner').data.examination = {
        heteroconstant: 1,
        systemList: [{ inspectionName: '电气系统', abnormalState: 1 }],
      };
    });
    await page
      .locator('.home-lower h2')
      .first()
      .evaluate(async (heading) => {
        const content = heading.closest('ion-content') as HTMLIonContentElement;
        const scroll = await content.getScrollElement();
        await content.scrollToPoint(
          0,
          scroll.scrollTop + heading.getBoundingClientRect().top - 114,
          0,
        );
      });
    await shot('05-首页-下滑');
    await page.getByRole('button', { name: /^1 项需要留意/ }).click();
    await expect(page.getByRole('heading', { name: '车辆提醒', exact: true })).toBeVisible();
    await shot('05-首页-车辆提醒');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('ion-modal:not(.overlay-hidden)')).toHaveCount(0);
    await page.evaluate(() => {
      const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties
        .$pinia;
      pinia._s.get('owner').data.examination = { heteroconstant: 0 };
    });
    for (const [name, path] of [
      ['06-车况-状态', '/vehicle/status'],
      ['06-车况-电池', '/vehicle/status?tab=battery'],
      ['06-车况-设备', '/vehicle/status?tab=device'],
      ['07-车辆设置', '/vehicle/settings'],
      ['08-车辆位置', '/vehicle/location'],
      ['09-记录-骑行', '/records?tab=ride'],
      ['10-记录-电池', '/records?tab=battery'],
      ['11-记录-胎压', '/records?tab=tire'],
      ['12-工具-网页版', '/tools'],
      ['13-我的', '/me'],
    ]) {
      await navigate(page, path);
      if (name === '10-记录-电池')
        await page.evaluate(() => {
          const history = (
            document.querySelector('#app') as any
          ).__vue_app__.config.globalProperties.$pinia._s.get('history');
          history.samples = [82, 75, 61, 45, 31, null, null, 66, 93, 100, 100, 97].map(
            (soc, i) => ({
              at: 1794110400000 - (11 - i) * 4 * 60000,
              soc,
            }),
          );
          history.charges = [
            {
              id: 'visual-charge-1',
              startedAt: 1794110400000 - 10 * 3600000,
              endedAt: 1794110400000 - 7 * 3600000,
              startSoc: 31,
              endSoc: 100,
              status: 'full',
              sampleCount: 8,
            },
            {
              id: 'visual-charge-2',
              startedAt: 1794110400000 - 18 * 3600000,
              endedAt: 1794110400000 - 17 * 3600000,
              startSoc: 44,
              endSoc: 82,
              status: 'interrupted',
              sampleCount: 4,
            },
          ];
        });
      await shot(name);
      if (['06-车况-状态', '06-车况-电池', '06-车况-设备', '07-车辆设置'].includes(name)) {
        await page
          .locator('ion-content:visible')
          .evaluate(async (el: HTMLIonContentElement) => el.scrollToBottom(0));
        await shot(`${name}-下滑`);
        await page
          .locator('ion-content:visible')
          .evaluate(async (el: HTMLIonContentElement) => el.scrollToTop(0));
      }
    }
    await state(page, { nativeAvailable: true, android: false });
    await navigate(page, '/tools');
    await shot('12-工具-App版');
    await state(page, { android: true });
    await shot('12-工具-Android版');
    await state(page, { nativeAvailable: false, android: false });
    await navigate(page, '/vehicle');
    await page.locator('ion-content:visible').evaluate(async (el: any) => el.scrollToTop(0));
    await page.getByRole('button', { name: '寻车', exact: true }).click();
    await shot('15-寻车');
    await page.keyboard.press('Escape');
    await expect(page.locator('#runtime-modal')).not.toBeVisible();
    await page.getByRole('button', { name: '座桶', exact: true }).click();
    await shot('16-确认');
    await page.keyboard.press('Escape');
    await expect(page.locator('#runtime-modal')).not.toBeVisible();
    await page.getByRole('button', { name: '切换车辆', exact: true }).click();
    await shot('17-切换车辆');
    await page.keyboard.press('Escape');
    await expect(page.locator('#runtime-modal')).not.toBeVisible();
    const lever = page.locator('.vehicle-home:visible .lever');
    for (const phase of ['idle', 'sending', 'pending', 'success', 'error']) {
      await state(page, { leverPhase: phase, leverTarget: 'powerOn' });
      await stable(page);
      await expect(lever).toHaveScreenshot(`18-滑动条-${phase}-${theme}.png`);
      await lever.screenshot({ path: `${dir}/18-滑动条-${phase}-${theme}.png` });
    }
    for (const [name, values] of [
      [
        '未锁车',
        {
          reading: {
            ...original.reading,
            daily: {
              ...original.reading.daily,
              vehicleLocked: false,
            },
          },
        },
      ],
      [
        '状态未知',
        {
          reading: {
            ...original.reading,
            daily: {
              ...original.reading.daily,
              vehicleLocked: null,
            },
          },
        },
      ],
      ['不可用-登录过期', { expired: true }],
      [
        '不可用-车型不支持',
        {
          expired: false,
          reading: {
            ...original.reading,
            daily: {
              ...original.reading.daily,
              capabilities: { ...original.reading.daily.capabilities, networkUnlock: false },
            },
          },
        },
      ],
    ] as const) {
      await state(page, { ...original, leverPhase: 'idle', ...values });
      await stable(page);
      await expect(lever).toHaveScreenshot(`18-滑动条-${name}-${theme}.png`);
      await lever.screenshot({ path: `${dir}/18-滑动条-${name}-${theme}.png` });
    }
    await state(page, { ...original, expired: false });
    await state(page, { leverPhase: 'idle', expired: true });
    await shot('01-首页-登录过期');
    await state(page, { expired: false, reading: null, busy: true });
    await shot('01-首页-首次加载');
    await state(page, {
      ...original,
      busy: false,
      reading: { ...original.reading, soc: null, range: null },
    });
    await shot('01-首页-缺少数据');
    await state(page, { reading: { ...original.reading, online: false } });
    await shot('01-首页-车辆离线');
    await page.context().setOffline(true);
    await shot('01-首页-网络不可用');
    await page.context().setOffline(false);
    await state(page, original);
    await state(page, { preview: true });
    // Only this static scene fixes Date; timers and animation frames keep ticking.
    const resumeTime = await page.evaluate(() => Date.now());
    await page.clock.setFixedTime(new Date(1794110400000));
    await page.evaluate(async () => {
      const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties
        .$pinia;
      const session = pinia._s.get('session');
      const demo = pinia._s.get('vehicle-presentation').reading;
      const time = Date.now() - 181000;
      demo.daily.reportedAt = time;
      demo.daily.batteryReportedAt = time;
      if (demo.daily.location) demo.daily.location.reportedAt = time;
      // Demo data is a module constant. Re-enter its presentation after fixing synthetic dates.
      session.state = { ...session.state, preview: false };
      await new Promise(requestAnimationFrame);
      session.state = { ...session.state, preview: true };
    });
    await expect(page.locator('.home-heading')).toContainText('3 分钟前更新');
    await shot('01-首页-演示');
    await lever.screenshot({ path: `${dir}/18-滑动条-演示-${theme}.png` });
    await page.clock.setSystemTime(resumeTime);
    await state(page, { ...original, preview: false });
    for (const [name, path, storeName, empty] of [
      ['09-记录-骑行', '/records?tab=ride', 'extensions', { monthly: null, tracks: null }],
      ['10-记录-电池', '/records?tab=battery', 'history', { samples: [], charges: [] }],
      ['11-记录-胎压', '/records?tab=tire', 'extensions', { tires: null }],
    ] as const) {
      await navigate(page, path);
      await stable(page);
      await page.evaluate(
        ({ storeName, empty }) => {
          const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties
            .$pinia;
          Object.assign(pinia._s.get(storeName), empty, { busy: false, error: '' });
        },
        { storeName, empty },
      );
      await shot(`${name}-空`);
      await page.evaluate((storeName) => {
        const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties
          .$pinia;
        pinia._s.get(storeName).error = '加载失败';
      }, storeName);
      await shot(`${name}-加载失败`);
    }
    await navigate(page, '/vehicle/settings');
    await stable(page);
    await page.getByText('此车型不支持的功能', { exact: true }).click();
    await shot('07-车辆设置-此车型不支持');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('ion-modal:not(.overlay-hidden)')).toHaveCount(0);
    for (const [name, path] of [
      ['R3-固件', '/vehicle/status/firmware'],
      ['R3-坐标', '/vehicle/location/coordinates'],
      ['R3-电子围栏', '/vehicle/location/fences'],
      ['R3-电子围栏编辑', '/vehicle/location/fences/test-fence'],
      ['R3-手机钥匙', '/vehicle/settings/phone-keys'],
      ['R3-卡钥匙', '/vehicle/settings/card-keys'],
      ['R3-家人用车', '/vehicle/settings/sharing'],
      ['R3-充电计划', '/vehicle/settings/charge-plan'],
      ['R3-电话提醒', '/vehicle/settings/low-phone'],
      ['R3-消息', '/vehicle/messages'],
      ['R3-单次行程', '/records/ride/2026-11-06'],
      ['R3-电池评分', '/records/battery/score'],
      ['R3-蓝牙', '/tools/bluetooth'],
      ['R3-蓝牙更多', '/tools/bluetooth/more'],
      ['R3-仪表', '/tools/meter'],
      ['R3-壁纸', '/tools/meter/wallpaper'],
      ['R3-投屏', '/tools/meter/cast'],
      ['R3-后台提醒', '/tools/monitor'],
      ['R3-桌面组件', '/tools/widgets'],
      ['R3-扫码', '/tools/scan'],
      ['R3-Android', '/tools/android'],
      ['R3-签到积分', '/tools/tasks'],
      ['R3-车况图片', '/tools/picture'],
      ['R3-诊断', '/tools/diagnostics'],
      ['R3-账号', '/me/accounts'],
      ['R3-外观', '/me/appearance'],
      ['R3-首页按钮', '/me/home'],
      ['R3-备份', '/me/backup'],
      ['R3-关于', '/me/about'],
      ['R3-隐私', '/me/about/privacy'],
      ['R3-声明', '/me/about/disclaimer'],
      ['R3-许可', '/me/about/licenses'],
      ['R3-安装', '/me/install'],
      ['R3-开发者', '/me/developer'],
      ['R3-模拟器', '/me/lab'],
      ['R3-组件', '/me/components'],
    ]) {
      await navigate(page, path);
      if (path === '/tools/widgets') {
        // Keep the preview's synthetic receive time stable while Ionic's clock keeps ticking.
        await page.evaluate(() => {
          const app = (document.querySelector('#app') as any).__vue_app__;
          const session = app.config.globalProperties.$pinia._s.get('session');
          session.state = {
            ...session.state,
            reading: { ...session.state.reading, receivedAt: Date.now() - 180000 },
          };
        });
      }
      await shot(name);
    }
    await navigate(page, '/vehicle');
    await page.locator('ion-content:visible').evaluate(async (el: any) => el.scrollToTop(0));
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await shot(`01-首页-${width}`);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await shot('01-首页-横屏');
    await writeFile(
      `${dir}/manifest-${theme}.json`,
      JSON.stringify(
        { synthetic: true, realDevice: false, baselineApproved: true, screenshots: recorded },
        null,
        2,
      ),
    );
    expect(mocks.external).toEqual([]);
  });
