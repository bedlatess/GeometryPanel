import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: '**/ui-audit.audit.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  outputDir: '.tools/ui-v2/audit-traces',
  reporter: [['list'], ['json', { outputFile: '.tools/ui-v2/audit-tests.json' }]],
  projects: [{ name: 'chromium-audit', use: {
    ...devices['iPhone 13'], browserName: 'chromium', deviceScaleFactor: 1,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  } }],
});
