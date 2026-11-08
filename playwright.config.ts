import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: 'tests/visual-baselines/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
  timeout: 60000,
  expect: { timeout: 7000 },
  fullyParallel: true,
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? 2),
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    timezoneId: 'Asia/Shanghai',
    baseURL: 'http://127.0.0.1:4174/panel/',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'node scripts/serve-test.mjs',
    url: 'http://127.0.0.1:4174/panel/',
    reuseExistingServer: false,
  },
});
