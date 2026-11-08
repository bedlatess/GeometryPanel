import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwnerApi, ownerReads, type OwnerRead } from './owner';
import { ApiError, CloudClient } from './client';
import { changeOnce } from '../core/owner-model';
import { ownerData } from '../../tests/owner-data';
const session={uid:'synthetic-user',token:'synthetic-token',vehicle:{vin:'LAAAAAAAAAAAAAAA1',name:'测试车辆',type:'AE8',plate:''}};
for(const key of Object.keys(ownerReads) as OwnerRead[])for(const mode of ['success','missing','failure']as const){
 test(`verified owner ${key}: ${mode}`,async()=>{
  const calls:{url:URL;init:RequestInit}[]=[];
  const client=new CloudClient(async(input,init)=>{calls.push({url:new URL(String(input)),init:init!});return new Response(JSON.stringify({code:mode==='failure'?50000:10000,data:mode==='missing'?null:ownerData[key]}),{status:mode==='failure'?503:200});});
  const read=new OwnerApi(client).read(session,key,{month:'2026-11',date:'2026-11-06',id:'test-task',period:'2'});
  if(mode==='failure')await assert.rejects(read,ApiError);else assert.deepEqual(await read,mode==='missing'?null:ownerData[key]);
  assert.equal(calls.length,1);const c=calls[0];assert.equal(c.init.method,'GET');assert.equal(new Headers(c.init.headers).get('Authorization'),'Bearer synthetic-token');
  assert.equal(c.url.origin,key==='tireHistory'?'https://h5.zeehoev.com':'https://tapi.zeehoev.com');
  assert.ok(c.url.pathname.startsWith(key==='unread'?'/v1.0/mine/cfmotoservermine/':key==='tireHistory'?'/cfmotoserverapp/H5/vehicle/tire/statistics':'/v1.0/app/cfmotoserverapp/'));
  if(['score','charges','uses','analysis'].includes(key))assert.equal(c.url.searchParams.get('month'),'2026.11');
  if(key==='tireHistory'){assert.equal(c.url.searchParams.get('timePeriodType'),'2');assert.equal(c.url.searchParams.get('sensorType'),'EXTERNAL');}
 });
}
type Write=(api:OwnerApi)=>Promise<unknown>;
const writes:[string,string,string,Write,Record<string,unknown>|undefined][]=[
 ['maintenance','POST','keepmileage/reset',a=>a.resetMaintenance(session),{vcu:session.vehicle.vin}],
 ['phone deletion','DELETE','app/inductiveUnlock/airLock/remove/test-phone',a=>a.removePhoneKey(session,'test-phone'),undefined],
 ['card rename','POST','vehicleSet/nfc/rename',a=>a.renameCard(session,'test-card','新名称'),{nfcId:'test-card',nfcName:'新名称',vinNo:session.vehicle.vin}],
 ['card deletion','PUT','vehicleSet/propertyOne/one',a=>a.removeCard(session,'0001'),{commond:'92',commondParam:'0001'}],
 ['fence create','POST','electricFence/one',a=>a.saveFence(session,{radius:'.2',addrPosition:'116.397,39.908',addrPositionName:'测试位置',rideRangeName:'新围栏'}),{radius:'0.2',addrPosition:'116.397,39.908'}],
 ['fence edit','PUT','electricFence/one',a=>a.saveFence(session,{id:'test-fence',radius:'5',addrPosition:'116.397,39.908',addrPositionName:'测试位置',rideRangeName:'新围栏'}),{id:'test-fence',radius:'5'}],
 ['fence deletion','DELETE','electricFence/one',a=>a.removeFence(session,'test-fence'),undefined],
 ['fence target','PUT','electricFence/one/use',a=>a.useFence(session,'test-fence',false),{id:'test-fence',delFlag:'1'}],
 ['low phone','POST','vehicleSet/lowPowerPhoneReminder',a=>a.lowPhone(session,true,'07:00','21:00'),{lowPowerPhoneReminder:1,lowPowerPhoneReminderStartTime:'07:00:00',lowPowerPhoneReminderEndTime:'21:00:00'}],
 ['plan create','POST','chargePlan/one',a=>a.savePlan(session,'07:00','21:00'),{startTime:'07:00',endTime:'21:00'}],
 ['plan edit','PUT','chargePlan/one',a=>a.savePlan(session,'07:00','21:00','test-plan'),{id:'test-plan'}],
 ['plan target','PUT','chargePlan/one/use',a=>a.usePlan(session,'test-plan',true),{id:'test-plan',delFlag:'0',vinNo:session.vehicle.vin}],
 ['long share','POST','carShare',a=>a.share(session,'long','测试家人','13900000000',24),{shareName:'测试家人',sharePhone:'13900000000',isOrNotContinue:'0'}],
 ['temporary share','POST','vehicle/tempShare',a=>a.share(session,'temp','测试家人','13900000000',48),{fullName:'测试家人',phone:'13900000000',shareHours:48}],
 ['share revoke','PUT','vehicle/tempShare',a=>a.revokeShare(session,{id:'test-share',shareName:'测试家人',sharePhone:'13900000000'}),{id:'test-share',shareHours:0}],
 ['automatic head lock','PUT','vehicleSet/propertyOne/one',a=>a.autoHead(session,true),{commond:'135',commondParam:'1'}],
 ['vehicle password','PUT','vehicleSet/propertyOne/one',a=>a.password(session,'1234'),{commond:'70',commondParam:'1234'}],
 ['forward warning off','PUT','vehicleSet/propertyOne/one',a=>a.fcw(session,false),{commond:'139',commondParam:'1'}],
 ['forward warning on','PUT','vehicleSet/propertyOne/one',a=>a.fcw(session,true),{commond:'139',commondParam:'2'}],
 ['storage','PUT','vehicleSet/propertyTwo/one',a=>a.storage(session),{commond:'29',commondParam:'1'}],
];
for(const [name,method,path,invoke,expected]of writes)for(const mode of ['success','missing','failure']as const)test(`owner write ${name}: ${mode}, one attempt and one observation`,async()=>{
 const calls:{path:string;method?:string;body:any}[]=[];
 const api=new OwnerApi(new CloudClient(async(input,init)=>{calls.push({path:new URL(String(input)).pathname,method:init?.method,body:init?.body?JSON.parse(String(init.body)):undefined});return new Response(JSON.stringify({code:mode==='failure'?50000:10000,data:mode==='missing'?null:true}),{status:200});}));
 let reads=0;const result=await changeOnce(()=>invoke(api),async()=>{reads++;return mode==='missing'?null:{matched:true};},v=>v===null?null:mode!=='failure');
 assert.equal(calls.length,1);assert.equal(reads,1);assert.equal(result,mode==='success'?'已生效':mode==='missing'?'已发送，车辆尚未确认':'修改未生效');
 assert.equal(calls[0].path,'/v1.0/app/cfmotoserverapp/'+path);assert.equal(calls[0].method,method);
 for(const [k,v]of Object.entries(expected??{}))assert.deepEqual(calls[0].body[k],v);
});
test('owner writes reject invalid radius, time, phone, identifier and password before transport',async()=>{
 let calls=0;const api=new OwnerApi(new CloudClient(async()=>{calls++;throw Error('unexpected');}));
 for(const run of [()=>api.saveFence(session,{radius:'.1',addrPosition:'116,39',rideRangeName:'x',addrPositionName:'x'}),()=>api.lowPhone(session,true,'25:00','21:00'),()=>api.share(session,'long','x','139',24),()=>api.removePhoneKey(session,'../x'),()=>api.password(session,'123456')])assert.throws(run,ApiError);
 assert.equal(calls,0);
});
