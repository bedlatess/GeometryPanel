import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const out = path.resolve('.tools/ui-v2');
await mkdir(out, { recursive: true });
const run = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js','test','-c','playwright.audit.config.ts'], { encoding:'utf8', env:process.env });
await writeFile(path.join(out,'visual-run.txt'), (run.stdout || '') + (run.stderr || ''));
process.stdout.write(run.stdout || ''); process.stderr.write(run.stderr || '');
if (run.status !== 0) process.exit(run.status || 1);
const manifest = JSON.parse(await readFile(path.join(out,'visual-manifest.json'),'utf8'));
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport:{width:1320,height:1000}, deviceScaleFactor:1 });
  for (const [group,label] of [['pages','七页对照'],['states','状态矩阵'],['levers','拨杆全部状态']]) {
    const files = manifest.files.filter(f => f.group === group);
    const markup = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${label}</title><style>body{margin:24px;background:#eee;color:#111;font:14px system-ui}h1{font-size:24px}p{margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}figure{margin:0;background:white;padding:8px;border-radius:8px}img{width:100%;height:${group==='levers'?96:430}px;object-fit:contain;object-position:top}figcaption{margin-top:8px;font-size:12px}</style><h1>0.7.0 · ${label}</h1><p>合成数据 · 自动化浏览器截图 · 非 iPhone 或车辆实测</p><div class="grid">${files.map(f=>`<figure><a href="${f.file}"><img src="${f.file}"></a><figcaption>${escape(f.label)}</figcaption></figure>`).join('')}</div></html>`;
    const target = path.join(out,`contact-${group}.html`);
    await writeFile(target,markup);
    await page.goto(pathToFileURL(target).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
    await page.screenshot({path:path.join(out,`contact-${group}.png`),fullPage:true});
  }
} finally { await browser.close(); }
console.log(`Saved ${manifest.files.length} synthetic screenshots and three contact sheets to ${out}`);
