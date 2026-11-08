import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

// Only the authorized neutral design asset is rasterized; no network is used.
const source = await readFile('../docs/design/assets/generic-scooter.svg', 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 420 } });
  await page.route('**/*', route => route.abort());
  await page.setContent(`<style>html,body{margin:0;color:#777b82}svg{display:block}</style>${source}`);
  await mkdir('tests/assets', { recursive: true });
  await page.screenshot({ path: 'tests/assets/generic-scooter.png', omitBackground: true });
} finally {
  await browser.close();
}
