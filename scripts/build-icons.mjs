// Optional asset regeneration; the generated PNGs are committed for normal builds.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = await readFile(new URL('../design/mark.svg', import.meta.url), 'utf8');
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
try {
  for (const [size,name] of [[180,'apple-touch-icon'],[192,'icon-192'],[512,'icon-512']]) {
    const page = await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${source}`);
    await page.screenshot({path:fileURLToPath(new URL(`../public/icons/${name}.png`,import.meta.url))});
    await page.close();
  }
} finally {await browser.close();}
