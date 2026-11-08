import { ApiError, CloudClient } from './client';
import { validVehicleId, type Session } from '../core/model';
import { ownerObject, ownerText } from '../core/owner-model';
const APP='/v1.0/app/cfmotoserverapp', MINE='/v1.0/mine/cfmotoservermine';
// Full declaration, DTO and caller evidence is recorded in docs/dev/owner-endpoints.md.
export const ownerReads = {
  tires:['app/vehicle/tire/monitoring','vinNo'],
  sim:['aggregate/vehicle/{vin}','path'], expiry:['getRechargeEndDate','frameNo'], recharge:['app/service/recharge/vehicle/detail','vinNo'],
  examination:['vehicle/abnormal/{vin}','path'], maintenance:['keepmileage/{vin}','path'], score:['batteryAnalyse','month'],
  battery:['batteryInfo/detail/{vin}','path'], charges:['batteryChargings','month'], uses:['batteryUsings','month'],
  redPoint:['redPoint','vinNo'], otaTasks:['ota/list','vinNo'], otaDetail:['otaDetail','id'], otaRecords:['otaRecord','vinNo'], otaStatus:['upstatus','vinNo'],
  analysis:['analyse/analyse','month'], rideDay:['rideDayInfo','date'], unread:['app/Message/allUnRead','mine'],
  phoneKeys:['app/inductiveUnlock/airLock/list','vinNo'], bleStatus:['app/inductiveUnlock/ble/status','vinNo'], nfcKeys:['vehicleSet/nfc/list','vinNo'],
  fences:['electricFence/list/{vin}','path'], plans:['chargePlan/list/{vin}','path'], shareLong:['carShare/{vin}','path'],
  shareTemp:['vehicle/tempShare/list','vinNo'], shareTimes:['vehicle/tempShare/timeOpts','none'],
  settings:['vehicleSet/vehicleSetInfo/{vin}','path'], caps:['vehicleSet/items','vinNo'], home:['vehicleHomePageV2/{vin}','path'],
  tireHistory:['/cfmotoserverapp/H5/vehicle/tire/statistics','h5'],
} as const;
export type OwnerRead=keyof typeof ownerReads;
const id=(s:unknown)=>{if(typeof s!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(s))throw new ApiError('format');return s;};
const time=(s:unknown)=>{if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(s))throw new ApiError('format');return s;};
const text=(s:unknown,max=80)=>{if(typeof s!=='string'||!s.trim()||s.length>max||/[\u0000-\u001f\u007f]/.test(s))throw new ApiError('format');return s.trim();};
export class OwnerApi {
  constructor(private readonly cloud=new CloudClient()){}
  async read(session:Session,key:OwnerRead,args:Record<string,string>={},signal?:AbortSignal):Promise<unknown>{
    this.bind(session);const [path,kind]=ownerReads[key],v=session.vehicle.vin;
    let query:Record<string,string>={};
    if(kind==='vinNo'||kind==='id'||kind==='date'||kind==='month')query.vinNo=v;
    if(kind==='frameNo')query.frameNo=v;
    if(kind==='month'){const m=args.month??new Date().toISOString().slice(0,7);if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))throw new ApiError('format');query.month=m.replace('-','.');}
    if(kind==='id')query.id=id(args.id);
    if(kind==='date'){if(!/^20\d{2}-\d{2}-\d{2}$/.test(args.date??''))throw new ApiError('format');query.date=args.date;}
    if(kind==='h5'){if(!['1','2'].includes(args.period??'1'))throw new ApiError('format');query={sensorType:'EXTERNAL',timePeriodType:args.period??'1',vinNo:v};}
    if(key==='tires')query.sensorType='EXTERNAL';
    return this.cloud.request(kind==='h5'?path:(kind==='mine'?MINE:APP)+'/'+path.replace('{vin}',v),{token:session.token,query,signal,...(kind==='h5'?{service:'h5' as const}:{})});
  }
  private bind(s:Session){if(!s.token||!validVehicleId(s.vehicle.vin))throw new ApiError('format');}
  private async send(s:Session,path:string,method:'POST'|'PUT'|'DELETE',body:unknown,signal?:AbortSignal,query?:Record<string,string>){
    this.bind(s);signal?.throwIfAborted();const result=await this.cloud.request(APP+'/'+path,{method,body,query,token:s.token,signal});
    signal?.throwIfAborted();if(result===false)throw new ApiError('rejected');return result;
  }
  resetMaintenance(s:Session,signal?:AbortSignal){return this.send(s,'keepmileage/reset','POST',{vcu:s.vehicle.vin},signal);}
  removePhoneKey(s:Session,keyId:string,signal?:AbortSignal){return this.send(s,'app/inductiveUnlock/airLock/remove/'+id(keyId),'DELETE',undefined,signal);}
  renameCard(s:Session,nfcId:string,name:string,signal?:AbortSignal){return this.send(s,'vehicleSet/nfc/rename','POST',{nfcId:id(nfcId),nfcName:text(name),vinNo:s.vehicle.vin},signal);}
  removeCard(s:Session,nfcNo:string,signal?:AbortSignal){return this.property(s,'92',id(nfcNo),signal);}
  saveFence(s:Session,input:Record<string,unknown>,signal?:AbortSignal){
    const radius=Number(input.radius),coordinate=String(input.addrPosition??'').split(',').map(Number);
    if(!Number.isFinite(radius)||radius<.2||radius>5||coordinate.length!==2||!Number.isFinite(coordinate[0])||!Number.isFinite(coordinate[1])||Math.abs(coordinate[0])>180||Math.abs(coordinate[1])>85)throw new ApiError('format');
    return this.send(s,'electricFence/one',input.id?'PUT':'POST',{
      vinNo:s.vehicle.vin,radius:String(radius),addrPosition:coordinate.join(','),addrPositionName:text(input.addrPositionName),rideRangeName:text(input.rideRangeName),scalingRatio:'15',
      ...(input.id?{id:id(input.id),...(input.rideRangeRule?{rideRangeRule:text(input.rideRangeRule,256)}:{})}:{}),
    },signal);
  }
  removeFence(s:Session,fenceId:string,signal?:AbortSignal){return this.send(s,'electricFence/one','DELETE',undefined,signal,{id:id(fenceId)});}
  useFence(s:Session,fenceId:string,on:boolean,signal?:AbortSignal){return this.send(s,'electricFence/one/use','PUT',{id:id(fenceId),delFlag:on?'0':'1'},signal);}
  lowPhone(s:Session,on:boolean,start:string,end:string,signal?:AbortSignal){return this.send(s,'vehicleSet/lowPowerPhoneReminder','POST',{vinNo:s.vehicle.vin,lowPowerPhoneReminder:on?1:0,lowPowerPhoneReminderStartTime:time(start).slice(0,5)+':00',lowPowerPhoneReminderEndTime:time(end).slice(0,5)+':00'},signal);}
  savePlan(s:Session,start:string,end:string,planId?:string,signal?:AbortSignal){return this.send(s,'chargePlan/one',planId?'PUT':'POST',{vinNo:s.vehicle.vin,startTime:time(start),endTime:time(end),...(planId?{id:id(planId)}:{})},signal);}
  usePlan(s:Session,planId:string,on:boolean,signal?:AbortSignal){return this.send(s,'chargePlan/one/use','PUT',{id:id(planId),vinNo:s.vehicle.vin,delFlag:on?'0':'1'},signal);}
  share(s:Session,mode:'long'|'temp',name:string,phone:string,hours:number,signal?:AbortSignal){
    if(!/^1\d{10}$/.test(phone)||!Number.isInteger(hours)||hours<1||hours>8760)throw new ApiError('format');
    return this.send(s,mode==='long'?'carShare':'vehicle/tempShare','POST',mode==='long'?{vinNo:s.vehicle.vin,shareName:text(name),sharePhone:phone,isOrNotContinue:'0'}:{vinNo:s.vehicle.vin,fullName:text(name),phone,shareHours:hours},signal);
  }
  revokeShare(s:Session,share:Record<string,unknown>,signal?:AbortSignal){return this.send(s,'vehicle/tempShare','PUT',{id:id(share.id),fullName:text(share.shareName??share.userName),phone:text(share.sharePhone??share.userPhone,32),vinNo:s.vehicle.vin,shareHours:0},signal);}
  private property(s:Session,command:string,param:string,signal?:AbortSignal,two=false){return this.send(s,'vehicleSet/property'+(two?'Two':'One')+'/one','PUT',{commond:command,commondParam:param,relatedFunctions:null,vcu:s.vehicle.vin,version:''},signal);}
  autoHead(s:Session,on:boolean,signal?:AbortSignal){return this.property(s,'135',on?'1':'0',signal);}
  password(s:Session,password:string,signal?:AbortSignal){if(!/^\d{4}$/.test(password))throw new ApiError('format');return this.property(s,'70',password,signal);}
  fcw(s:Session,on:boolean,signal?:AbortSignal){return this.property(s,'139',on?'2':'1',signal);}
  storage(s:Session,signal?:AbortSignal){return this.property(s,'29','1',signal,true);}
}
