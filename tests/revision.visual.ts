import { test, expect, open, login, navigate, auditData } from './fixtures';
import { mkdir, writeFile } from 'node:fs/promises';
const phase=process.env.CAPTURE_PHASE||'after';
const routes=[['home','/vehicle'],['folded','/vehicle'],['status','/vehicle/status'],['location','/vehicle/location'],['settings','/vehicle/settings'],['records','/records'],['rides','/records/rides'],['battery','/records/battery'],['tools','/tools'],['bluetooth','/tools/bluetooth'],['monitor','/tools/monitor'],['me','/me'],['backup','/me/backup'],['about','/me/about']];
test('revision comparison with synthetic data',async({page,mocks})=>{
 Object.assign(mocks,auditData());await open(page);await expect(page.getByRole('button',{name:'登录极核账号',exact:true})).toBeEnabled();
 await mkdir(`.tools/revision/${phase}`,{recursive:true});
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:`.tools/revision/${phase}/welcome-${theme}.png`});}
 await login(page);
 await expect(page.locator('.result-toast')).toHaveCount(0,{timeout:6000});
 const out=`.tools/revision/${phase}`;await mkdir(out,{recursive:true});
 const checks=[];
 for(const theme of ['light','dark']){
  await navigate(page,'/me/appearance');await page.getByRole('button',{name:theme==='light'?'浅色':'深色',exact:true}).click();
  for(const [name,path]of routes){
   await navigate(page,path);await page.waitForTimeout(380);
   if(name==='folded'){await page.evaluate(()=>window.scrollTo(0,document.querySelector<HTMLElement>('.home-cards')!.offsetTop-100));await page.waitForTimeout(350);}
   await page.screenshot({path:`${out}/${name}-${theme}.png`,fullPage:!['home','folded'].includes(name)});
   checks.push({name,theme,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  }
 }
 expect(checks.every(c=>!c.overflow)).toBe(true);
 await writeFile(`${out}/checks.json`,JSON.stringify({synthetic:true,outsideRequests:mocks.external,checks},null,2));
 expect(mocks.external).toEqual([]);
});
