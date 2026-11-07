import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
const markLight = await readFile('public/brand/mark-on-light.svg', 'utf8'), markDark = await readFile('public/brand/mark.svg', 'utf8');
await mkdir('public/startup', { recursive: true });
const links = [];
try {
  for (const [width, height, scale] of [[375,667,2],[414,736,3],[375,812,3],[390,844,3],[393,852,3],[402,874,3],[414,896,2],[428,926,3],[430,932,3],[440,956,3]]) {
    for (const theme of ['light','dark']) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
      await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${theme==='dark'?'#0B0D10':'#F4F5F7'};color:${theme==='dark'?'#F2F4F6':'#0F1215'}}body{display:grid;place-items:center}svg{width:96px;height:96px}</style>${theme==='dark'?markDark:markLight}`);
      const name=`${width}x${height}-${scale}-${theme}.png`;
      await page.screenshot({path:`public/startup/${name}`}); await page.close();
      links.push(`<link rel="apple-touch-startup-image" href="./startup/${name}" media="(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait) and (prefers-color-scheme: ${theme})" />`);
    }
  }
  // Same supplied G artwork, with 1/4 clear space, for Android launch layers.
  for (const theme of ['light','dark']) {
    const folder = `android/app/src/main/res/drawable${theme==='dark'?'-night':''}`; await mkdir(folder,{recursive:true});
    const page = await browser.newPage({viewport:{width:144,height:144},deviceScaleFactor:2});
    await page.setContent(`<style>html,body{margin:0;width:144px;height:144px;background:transparent;color:${theme==='dark'?'#F2F4F6':'#0F1215'}}body{display:grid;place-items:center}svg{width:96px;height:96px}</style>${theme==='dark'?markDark:markLight}`);
    await page.screenshot({path:`${folder}/startup_mark.png`,omitBackground:true}); await page.close();
    await writeFile(`${folder}/launch_background.xml`,`<?xml version="1.0" encoding="utf-8"?><layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="${theme==='dark'?'#0B0D10':'#F4F5F7'}"/><item android:width="144dp" android:height="144dp" android:gravity="center" android:drawable="@drawable/startup_mark"/></layer-list>`);
  }
  const file = await readFile('index.html','utf8');
  await writeFile('index.html',file.replace(/\s*<!-- startup:start -->[\s\S]*?<!-- startup:end -->/,'').replace('</head>',`<!-- startup:start -->\n${links.join('\n')}\n<!-- startup:end -->\n  </head>`));
} finally { await browser.close(); }
