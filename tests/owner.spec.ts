import {test,expect,open,login,navigate,ownerData,auditData,type Mocks} from './fixtures';
import type {Page} from '@playwright/test';

function setup(m:Mocks){m.owner={data:structuredClone(ownerData)};m.extensions=auditData().extensions;}
async function ready(page:Page,m:Mocks,path:string){setup(m);await open(page);await login(page);await navigate(page,path);}
const writes=(m:Mocks)=>m.calls.filter(c=>c.method!=='GET'&&!/authCode|loginByPhone|code\/generate/.test(c.path));

test('token and sign-in URL stay masked and validate the vehicle list before saving',async({page,mocks})=>{
 await open(page);await page.getByRole('button',{name:'登录极核账号',exact:true}).click();await page.getByRole('button',{name:'使用 token 登录'}).click();
 const input=page.locator('#login-secret');await expect(input).toHaveAttribute('type','password');
 await input.fill('https://example.invalid/signin?token=synthetic-url-token&uid=synthetic-user');
 await page.getByRole('button',{name:'显示登录信息'}).click();await expect(input).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'隐藏登录信息'}).click();await expect(input).toHaveAttribute('type','password');
 await page.getByRole('button',{name:'解析并登录'}).click();await page.getByRole('button',{name:/^测试极核 A/}).click();
 await expect(page.getByRole('heading',{name:'测试极核 A'})).toBeVisible();
 expect(mocks.calls.some(c=>/loginByPhone|authCode/.test(c.path))).toBe(false);
 expect(mocks.calls.find(c=>c.path.endsWith('/vehicle/list'))?.authorization).toBe('Bearer synthetic-url-token');
 await expect(page.locator('body')).not.toContainText('synthetic-url-token');
});

test('renewing a login keeps the existing vehicle and preferences',async({page,mocks})=>{
 await ready(page,mocks,'/me/accounts');await page.getByRole('button',{name:'更新登录信息',exact:true}).click();await page.getByRole('button',{name:'使用 token 登录'}).click();
 await page.locator('#login-secret').fill('synthetic-renewed');await page.getByRole('button',{name:'解析并登录'}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:/^测试极核 A/})).toBeVisible();
 await navigate(page,'/vehicle');await page.getByRole('button',{name:'刷新车况'}).click();
 await expect.poll(()=>mocks.calls.some(c=>c.path.includes('/vehicleHomePageV2/')&&c.authorization==='Bearer synthetic-renewed')).toBe(true);
});

test('encrypted account backup can be restored and never exports plaintext',async({page,mocks})=>{
 await ready(page,mocks,'/me/backup');await page.getByRole('button',{name:'备份账号',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('备份包含登录信息');await page.locator('[data-account-password]').fill('synthetic-backup-password');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'加密并导出'}).click();const artifact=await download;
 const stream=await artifact.createReadStream();const chunks:Buffer[]=[];for await(const c of stream!)chunks.push(Buffer.from(c));const text=Buffer.concat(chunks).toString();
 expect(artifact.suggestedFilename()).toMatch(/\.gpbackup$/);expect(text).not.toContain('synthetic-token');expect(JSON.parse(text).kdf).toBe('PBKDF2-SHA256');
 await expect(page.getByRole('dialog')).not.toBeVisible();await page.getByRole('button',{name:'恢复账号',exact:true}).click();
 await page.locator('[data-account-file]').setInputFiles({name:'test.gpbackup',mimeType:'application/octet-stream',buffer:Buffer.from(text)});
 await page.locator('[data-account-password]').fill('synthetic-backup-password');await page.getByRole('button',{name:'解密并恢复'}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();await navigate(page,'/me/accounts');await expect(page.getByRole('button',{name:/^测试极核 A/})).toBeVisible();
});

const pages:[string,string][]=[['/vehicle/status','距下次保养'],['/vehicle/info','设备'],['/vehicle/health','测试电气系统'],['/vehicle/firmware','测试仪表'],['/records/battery/score','测试扣分项'],['/records/battery/official','34.5 A·h'],['/records/rides','本月分析'],['/records/tires','胎压与胎温曲线'],['/vehicle/settings/phone-keys','测试手机'],['/vehicle/settings/card-keys','测试卡钥匙'],['/vehicle/location/fences','测试围栏'],['/vehicle/settings/charge-plan','07:00–21:00'],['/vehicle/settings/sharing','测试家人']];
for(const [path,label] of pages)for(const mode of ['success','missing','failure']as const)test(`owner page ${path} ${mode} handles optional fields without writing`,async({page,mocks})=>{
 setup(mocks);await open(page);await login(page);if(mode!=='success')mocks.owner!.mode=mode;await navigate(page,path);
 if(mode==='success'){if(label==='胎压与胎温曲线')await expect(page.getByRole('img',{name:label}).first()).toBeVisible();else await expect(page.locator('main')).toContainText(label);}
 else if(mode==='failure')await expect(page.locator('main')).toContainText('加载失败');
 else await expect(page.locator('main')).not.toContainText('无异常');
 expect(writes(mocks)).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('main')).not.toContainText('undefined');await expect(page.locator('main')).not.toContainText('NaN');
});

for(const mode of ['effective','unchanged','network']as const)test(`card rename confirms then writes once and reads once: ${mode}`,async({page,mocks})=>{
 await ready(page,mocks,'/vehicle/settings/card-keys');await page.getByRole('button',{name:'改名',exact:true}).click();await page.getByRole('dialog').getByRole('textbox').fill('新的测试卡');await page.getByRole('button',{name:'继续',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('从 测试卡钥匙 改为 新的测试卡');expect(writes(mocks)).toHaveLength(0);
 const reads=mocks.calls.filter(c=>c.path.endsWith('/nfc/list')).length;if(mode==='unchanged')mocks.owner!.noChange=true;if(mode==='network')mocks.owner!.networkWrite='nfc/rename';
 await page.getByRole('button',{name:'确认修改',exact:true}).click();await expect(page.locator('main')).toContainText(mode==='effective'?'已生效':mode==='unchanged'?'修改未生效':'已发送，车辆尚未确认');
 expect(writes(mocks)).toHaveLength(1);expect(mocks.calls.filter(c=>c.path.endsWith('/nfc/list'))).toHaveLength(reads+1);
});

test('native phone identity blocks deleting the current device',async({page,mocks})=>{
 await page.addInitScript(()=>{(window as any).GeometryNative={postMessage(raw:string){const r=JSON.parse(raw);const result=r.method==='status'?{uniqueIdentify:'0102030405060708'}:{};queueMicrotask(()=>(window as any).GeometryNative.onmessage?.({data:JSON.stringify({id:r.id,ok:true,result})}));}};});
 await ready(page,mocks,'/vehicle/settings/phone-keys');await expect(page.locator('main')).toContainText('不可删除');await expect(page.getByRole('button',{name:'删除设备',exact:true})).toHaveCount(0);expect(writes(mocks)).toHaveLength(0);
});

test('fence requires deliberate map selection, then saves metres as kilometres',async({page,mocks})=>{
 await ready(page,mocks,'/vehicle/location/fences');await page.getByRole('button',{name:'新建围栏'}).click();await page.locator('[data-owner-field=name]').fill('新的测试围栏');expect(mocks.roadTiles).toHaveLength(0);
 await page.getByRole('button',{name:'加载地图',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.result-toast')).toContainText('请在地图上选择圆心');expect(writes(mocks)).toHaveLength(0);
 await page.getByRole('img',{name:'点击地图选择围栏圆心'}).click({position:{x:120,y:70}});await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('button',{name:'确认修改',exact:true}).click();
 await expect(page.locator('main')).toContainText('已生效');expect(writes(mocks)[0].body.radius).toBe('0.5');expect(mocks.roadTiles.length).toBeGreaterThan(0);
});

test('charge plan keeps a saved disabled plan and only retries enable after confirmation',async({page,mocks})=>{
 await ready(page,mocks,'/vehicle/settings/charge-plan');await page.getByRole('button',{name:'编辑',exact:true}).click();mocks.owner!.failWrite='chargePlan/one/use';
 await page.getByRole('button',{name:'保存并启用',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'保存并启用',exact:true}).click();await expect(page.locator('main')).toContainText('已保存，未启用');
 expect(writes(mocks)).toHaveLength(2);expect(writes(mocks).map(c=>c.path.split('/').slice(-3).join('/'))).toEqual(['cfmotoserverapp/chargePlan/one','chargePlan/one/use']);
 mocks.owner!.failWrite=undefined;await page.getByRole('button',{name:'重试启用',exact:true}).click();expect(writes(mocks)).toHaveLength(2);await page.getByRole('button',{name:'确认修改',exact:true}).click();await expect(page.locator('main')).toContainText('已生效');expect(writes(mocks)).toHaveLength(3);
});

test('sharing warns about control rights, uses danger confirmation and enforces three recipients',async({page,mocks})=>{
 await ready(page,mocks,'/vehicle/settings/sharing');await page.getByRole('button',{name:'新增分享',exact:true}).click();await page.locator('[data-owner-field=name]').fill('测试家人二');await page.locator('[data-owner-field=phone]').fill('13900000001');await page.getByRole('button',{name:'继续',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('对方可以控制这台车');await expect(page.getByRole('dialog').locator('.primary')).toHaveClass(/danger/);expect(writes(mocks)).toHaveLength(0);
 await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.locator('main')).toContainText('已生效');
 mocks.owner!.data.shareLong=[1,2,3].map(i=>({id:'share-'+i,shareName:'测试家人'+i,sharePhone:'1390000000'+i}));await navigate(page,'/vehicle/settings');await navigate(page,'/vehicle/settings/sharing');await expect(page.getByRole('button',{name:'新增分享',exact:true})).toHaveCount(0);
});

test('password is entered twice and absent from confirmation and rendered result',async({page,mocks})=>{
 await ready(page,mocks,'/vehicle/settings');await page.getByRole('button',{name:'修改车端密码',exact:true}).click();await page.locator('[data-owner-field=password]').fill('4831');await page.locator('[data-owner-field=repeat]').fill('4831');await page.getByRole('button',{name:'继续',exact:true}).click();await expect(page.getByRole('dialog')).not.toContainText('4831');
 await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.locator('main')).toContainText('已发送，车辆尚未确认');expect(writes(mocks)[0].body.commond).toBe('70');await expect(page.locator('body')).not.toContainText('4831');
});


test('home reminders and every shortcut stay above the bottom bar on compact phones',async({page,mocks})=>{
 await ready(page,mocks,'/vehicle');await expect(page.getByRole('button',{name:'1 项提醒',exact:true})).toBeVisible();
 for(const [width,height]of [[360,640],[390,664],[430,740]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
  const nav=await page.locator('.bottom-nav').boundingBox(),shortcuts=await page.locator('.quick-controls').boundingBox();
  expect(shortcuts!.y+shortcuts!.height).toBeLessThanOrEqual(nav!.y-8);
  for(const b of await page.locator('.quick-controls button').all())await expect(b).toBeInViewport();
 }
 await page.setViewportSize({width:740,height:390});await page.locator('.quick-controls').scrollIntoViewIfNeeded();
 const nav=await page.locator('.bottom-nav').boundingBox(),shortcuts=await page.locator('.quick-controls').boundingBox();
 expect(shortcuts!.y+shortcuts!.height).toBeLessThanOrEqual(nav!.y);
});

test('an uncertain charge-plan save is read once and never enables or retries automatically',async({page,mocks})=>{
 await ready(page,mocks,'/vehicle/settings/charge-plan');await page.getByRole('button',{name:'编辑',exact:true}).click();mocks.owner!.failWrite='chargePlan/one';
 const count=mocks.calls.filter(c=>c.path.includes('/chargePlan/list/')).length;
 await page.getByRole('button',{name:'保存并启用',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'保存并启用',exact:true}).click();
 await expect(page.locator('main')).toContainText('已发送，车辆尚未确认');expect(writes(mocks)).toHaveLength(1);expect(mocks.calls.filter(c=>c.path.includes('/chargePlan/list/'))).toHaveLength(count+1);
 expect(writes(mocks).some(c=>c.path.endsWith('/one/use'))).toBe(false);
});
