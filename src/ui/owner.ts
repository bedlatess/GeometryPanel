import { OwnerApi, type OwnerRead } from '../api/owner';
import { ApiError } from '../api/client';
import type { NativeClient } from '../core/native';
import type { Session, Snapshot } from '../core/model';
import { ownerObject as obj, ownerRows as rows, ownerText as txt, ownerNumber as num, changeOnce, tireHistory, type OwnerRow } from '../core/owner-model';
import { Card, ConfirmSheet, Empty, html, ListGroup, ListRow, MonthPicker, PrimaryButton, SecondaryButton, Segmented, RefreshButton, age } from './kit';
import { choose } from './kit/pickers';
import type { PageActions } from './pages/actions';


export const ownerRoutes:Record<string,string>={
 '/vehicle/health':'体检','/vehicle/firmware':'固件信息','/vehicle/location/fences':'电子围栏',
 '/vehicle/settings/phone-keys':'手机钥匙','/vehicle/settings/card-keys':'卡钥匙','/vehicle/settings/charge-plan':'充电计划',
 '/vehicle/settings/sharing':'车辆分享','/vehicle/settings/low-phone':'超低电量电话提醒',
 '/records/battery/score':'电池评分','/records/battery/official':'官方记录',
};
const route=(label:string,path:string,value='')=>ListRow(label,value,`data-action="route" data-value="${path}"`);
const value=(label:string,v:unknown)=>ListRow(label,txt(v)||'—','',undefined,true);
const action=(label:string,cmd:string,danger=false,attrs='')=>`<button class="list-row ${danger?'danger':''}" data-owner="${cmd}" ${attrs}>${html(label)}</button>`;
const field=(label:string,name:string,v='',type='text',max=80)=>`<label>${label}<input data-owner-field="${name}" type="${type}" value="${html(v)}" maxlength="${max}" autocomplete="off" ${type==='password'?'inputmode="numeric"':''}></label>`;
const switchRow=(label:string,on:boolean,cmd:string)=>`<button class="list-row" data-owner="${cmd}" role="switch" aria-checked="${on}"><span>${label}</span><span class="switch ${on?'checked':''}" aria-hidden="true"></span></button>`;
const date=(v:unknown)=>{const s=txt(v);return /^20\d{2}-\d{2}-\d{2}/.test(s)?s.slice(0,10).replace(/^(\d{4})-(\d{2})-(\d{2})$/,(_,y,m,d)=>`${y}年${Number(m)}月${Number(d)}日`):s;};
const maskPhone=(v:unknown)=>txt(v).replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2');

export function mountOwner(host:HTMLElement,o:{path:string;session:Session|null;demo:boolean;actions:PageActions;native:NativeClient;snapshot?:Snapshot|null;onExpired():void}){
 const api=new OwnerApi(),scope=new AbortController(),s=o.session,a=o.actions,path=o.path;
 let alive=true,busy=false,note='',failed=false,month=new Date().toISOString().slice(0,7),period='1',shareTab='long',pendingPlan='';
 let data:Partial<Record<OwnerRead,unknown>>={},known=new Set<OwnerRead>(),errors=new Set<OwnerRead>(),ownIdentity='',identityReady=!o.native.available;
 let editor:{type:'fence'|'plan'|'share';row:OwnerRow}|null=null,mapLoaded=false,mapSelected=false,center:{longitude:number;latitude:number}|null=null,radius=500,mapZoom=15;
 const get=(k:OwnerRead)=>obj(data[k]);
 const has=(k:OwnerRead)=>Object.keys(get(k)).length>0;
 const list=(k:OwnerRead)=>rows(data[k]);
 const active=()=>alive&&!scope.signal.aborted;
 function expiry(){const v=get('expiry').rechargeEndDate??get('recharge').rechargeEndDate??get('home').rechargeEndDate;return txt(v);}
 function health(){const result=get('examination');return rows(result.systemList).flatMap(r=>[r,...rows(r.list)]).filter(r=>num(r.abnormalState)!==null&&num(r.abnormalState)!==0);}
 function examCount(){const r=get('examination'),count=num(r.heteroconstant);if(count!==null)return count;const systems=rows(r.systemList);return systems.length&&systems.every(r=>num(r.abnormalState)!==null)?health().length:null;}
 function supported(code:string){return list('caps').some(r=>r.functionCode===code&&(r.isSupport===true||r.isSupport===1||r.isSupport==='1'));}
 function phoneKeys(){return list('phoneKeys').flatMap(r=>rows(r.inductiveUnlockVOList).length?rows(r.inductiveUnlockVOList):[r]);}
 async function read(k:OwnerRead,args:Record<string,string>={}){if(!s||o.demo)return;try{const result=await api.read(s,k,args,scope.signal);if(active()){data[k]=result;known.add(k);errors.delete(k);}return result;}catch(e){if(!active())return;errors.add(k);if(e instanceof ApiError&&e.kind==='expired')o.onExpired();throw e;}}
 async function load(keys:OwnerRead[]){if(!s||o.demo){render();return;}busy=true;render();const results=await Promise.allSettled(keys.map(k=>read(k,{month,period,...(k==='rideDay'?{date:path.split('/').at(-1)!}:{})})));if(!active())return;failed=results.every(r=>r.status==='rejected');busy=false;render();}
 function reminders(){const result:string[]=[];const d=o.snapshot;if(d?.soc!=null&&d.soc<=20)result.push('电量低');if(d?.daily.vehicleLocked===true&&d.daily.seatLocked===false&&d.daily.reportState==='fresh')result.push('座桶未锁');
  const wheels=rows(get('tires').realTimeData);if(wheels.some(r=>num(r.tirePressure)!==null&&Number(r.tirePressure)<1))result.push('胎压过低');
  const end=Date.parse(expiry());if(Number.isFinite(end)){const days=Math.ceil((end-Date.now())/86400000);if(days<=30)result.push(days<=0?'智能服务已到期':`智能服务 ${days} 天后到期`);}
  const simDays=num(get('sim').lastUseDate);if(simDays!==null&&simDays<=30)result.push(simDays<=0?'流量卡已到期':`流量卡 ${simDays} 天后到期`);const count=examCount();if(count!==null&&count>0)result.push(`${count} 项异常`);
  const km=num(get('maintenance').keepMileage);if(km!==null&&km<=200)result.push(`距下次保养 ${km} km`);return result;
 }
 function status(){let body='';const exam=get('examination'),end=expiry(),km=get('maintenance').keepMileage;
  const count=examCount();if(count!==null)body+=route('体检','/vehicle/health',count?`${count} 项异常`:'无异常');
  if(num(km)!==null)body+=value('距下次保养',txt(km)+' km');
  if(get('score').score!==undefined)body+=route('本月电池评分','/records/battery/score',txt(get('score').score));
  if(end)body+=value('智能服务',date(end)+'到期');
  const firmware=txt(get('home').otaVersion)||txt(rows(get('home').iotProperties).find(r=>r.identify==='VCU_Firmware')?.value);if(firmware)body+=route('固件版本','/vehicle/firmware',firmware);
  const days=num(get('sim').lastUseDate);if(days!==null)body+=value('流量卡有效期',days+' 天');
  return body?ListGroup('健康',body)+(num(km)!==null?ListGroup('',action('已完成保养，重置提醒','reset-maintenance',true)):''):'';
 }
 function device(){const h=get('home');let body=txt(h.otaVersion)?value('固件版本',h.otaVersion):'';
  for(const [k,label]of [['activationDate','激活日期'],['firstBindDate','首次绑定日期']]as const)if(h[k]!=null)body+=value(label,date(h[k]));
  for(const r of rows(h.iotProperties).filter(r=>/_Firmware$/.test(txt(r.identify))))body+=value(({ECU_Firmware:'ECU 版本',HMI_Firmware:'仪表版本',VCU_Firmware:'固件版本'} as Record<string,string>)[txt(r.identify)]||'固件版本',r.value);
  const mac=txt(h.bluetoothAddress).replace(/[^a-f0-9]/gi,'');if(mac.length===12)body+=value('蓝牙地址','••:••:'+mac.slice(-4,-2).toUpperCase()+':'+mac.slice(-2).toUpperCase());
  if(num(data.redPoint)!==null&&Number(data.redPoint)>0)body+=route('有新版本','/vehicle/firmware');
  return body?ListGroup('设备',body):'';
 }
 function firmware(){const tasks=list('otaTasks'),records=list('otaRecords');let body='';if(tasks.length)body+=ListGroup('可用版本',tasks.map((r,i)=>action(`${txt(r.partName)||'固件'} ${txt(r.otaVersion)||'—'}`,'ota-detail',false,`data-index="${i}"`)).join(''));
  const detail=get('otaDetail');if(Object.keys(detail).length)body+=ListGroup('版本信息',value('当前版本',detail.nowVersion)+value('新版本',detail.lastlyVersion)+value('更新日期',date(detail.updateDate)))+(txt(detail.versionDesc)?`<p>${html(txt(detail.versionDesc))}</p>`:'');
  if(records.length)body+=ListGroup('升级记录',records.map(r=>value(date(r.updateDate),r.otaVersion)).join(''));

  return body?body+'<p class="muted">请在极核 App 中升级</p>':'';
 }
 function score(){const r=get('score');const deductions=rows(r.batteryDeductList).flatMap(x=>rows(x.batteryDetailList));return r.score===undefined?'':ListGroup('',value('本月电池评分',r.score))+ListGroup('扣分项',deductions.map(x=>value(txt(x.deductContent)||'扣分',x.deductScore)).join(''));}
 function cloudBattery(){const charge=get('charges'),use=get('uses');let body=MonthPicker(month,'data-month-move');if(has('battery'))body+=ListGroup('电池',value('电压',txt(get('battery').bmsVoltage)?txt(get('battery').bmsVoltage)+' V':'—')+value('电流',txt(get('battery').bmsCurrent)?txt(get('battery').bmsCurrent)+' A':'—'));
  if(Object.keys(charge).length)body+=ListGroup('充电',value('本月充电',charge.powerChargeMonth==null?'—':txt(charge.powerChargeMonth)+' A·h')+rows(charge.chargeList).map(r=>value(date(r.powerChargeDate),r.powerChargeValue==null?'—':txt(r.powerChargeValue)+' A·h')).join(''));
  if(Object.keys(use).length)body+=ListGroup('放电',value('本月放电',use.powerUseMonth==null?'—':txt(use.powerUseMonth)+' A·h')+rows(use.useList).map(r=>value(date(r.powerUseDate),r.powerUseValue==null?'—':txt(r.powerUseValue)+' A·h')).join(''));return body;
 }
 function analysis(){const r=get(path.startsWith('/records/rides/')?'rideDay':'analysis'),daily=path.startsWith('/records/rides/');const keys=daily?[['accelerationTimesDay','急加速'],['brakesTimesDay','急刹车'],['bendingTimesDay','转弯'],['greenContributionDay','减碳'],['powerConsumptionDay','耗电'],['maxSpeed','最高速']]:[['accelerationTimes','急加速'],['brakesTimes','急刹车'],['extremeSpeedNumber','超速'],['bendingTimes','转弯'],['nightRide','夜间骑行'],['longDrive','长时间骑行']];const body=keys.filter(([k])=>r[k]!=null).map(([k,label])=>value(label,r[k])).join('');return body?ListGroup(daily?'当日分析':'本月分析',body):'';}
 function history(){const wheels=tireHistory(data.tireHistory);return Segmented([['1','24 小时'],['2','7 天']],period,'data-tire-period')+wheels.map(w=>{
   const all=[...w.pressure,...w.temperature];if(!all.length)return '';const start=Math.min(...all.map(p=>p.t)),end=Math.max(...all.map(p=>p.t));
   const line=(pts:{t:number;v:number}[])=>{if(!pts.length)return '';const max=Math.max(...pts.map(p=>p.v),1),min=Math.min(...pts.map(p=>p.v),0),xy=(p:{t:number;v:number})=>`${(12+(p.t-start)/Math.max(1,end-start)*296).toFixed(2)},${(180-(p.v-min)/Math.max(.1,max-min)*160).toFixed(2)}`;let solid='',gaps='';pts.forEach((p,i)=>{const gap=i>0&&p.t-pts[i-1].t>(period==='1'?2*3600000:12*3600000);solid+=`${!i||gap?'M':'L'}${xy(p)}`;if(gap)gaps+=`M${xy(pts[i-1])}L${xy(p)}`;});return `<path d="${solid}"/><path class="chart-gap" d="${gaps}"/>`;};
   return Card(`<h2>${w.position===1?'前轮':'后轮'}</h2><svg class="track-drawing" viewBox="0 0 320 200" role="img" aria-label="胎压与胎温曲线"><g>${line(w.pressure)}</g><g class="chart-temperature">${line(w.temperature)}</g></svg><p class="muted">胎压 · bar　胎温 · °C</p>`);
  }).join('');}
 function settings(){const r=get('settings');let body='';
  const safe=[['AUTOMATIC_LOCK','automaticLock','自动龙头锁','auto-head'],['RADAR_ASSISTED_FCW','radarFcw','前碰撞预警','fcw']] as const;
  const safety=safe.filter(([code,k])=>supported(code)&&r[k]!=null).map(([,k,label,cmd])=>switchRow(label,k==='radarFcw'?Number(r[k])!==1:Number(r[k])===1,cmd)).join('');
  if(safety||supported('PASSWORD_UNLOCKING'))body+=ListGroup('安全',safety+(supported('PASSWORD_UNLOCKING')?action('修改车端密码','password'):''));
  body+=(has('settings')?ListGroup('钥匙',route('手机钥匙','/vehicle/settings/phone-keys')+route('卡钥匙','/vehicle/settings/card-keys')):'');
  body+=(has('settings')?ListGroup('电量与充电',route('超低电量电话提醒','/vehicle/settings/low-phone')+route('充电计划','/vehicle/settings/charge-plan')):'');
  return body+(has('settings')?ListGroup('',route('车辆分享','/vehicle/settings/sharing')):'');
 }
 function phones(){return ListGroup('',phoneKeys().map((r,i)=>value(txt(r.phoneName)||'手机钥匙',date(r.modifyTime))+(txt(r.uniqueIdentify)&&ownIdentity&&r.uniqueIdentify===ownIdentity?value('当前设备','不可删除'):action('删除设备','remove-phone',true,`data-index="${i}" ${!identityReady||o.native.available&&!ownIdentity||!txt(r.id)||!txt(r.uniqueIdentify)?'disabled':''}`))).join(''));}
 function cards(){return list('nfcKeys').map((r,i)=>ListGroup(txt(r.nfcName)||'卡钥匙',value('卡号尾号',txt(r.nfcNo).slice(-4))+action('改名','rename-card',false,`data-index="${i}" ${!r.id?'disabled':''}`)+action('删除卡钥匙','remove-card',true,`data-index="${i}" ${!r.nfcNo?'disabled':''}`))).join('');}
 function fences(){if(!Array.isArray(data.fences))return '';return list('fences').map((r,i)=>ListGroup(txt(r.rideRangeName)||'电子围栏',switchRow('已启用',String(r.delFlag)==='0','fence-use').replace('data-owner="fence-use"',`data-owner="fence-use" data-index="${i}"`)+value('半径',num(r.radius)===null?'—':Number(r.radius)*1000+' m')+action('编辑','fence-edit',false,`data-index="${i}"`)+action('删除围栏','fence-delete',true,`data-index="${i}"`))).join('')+PrimaryButton('新建围栏','data-owner="fence-new"');}
 function plan(){if(!Array.isArray(data.plans))return '';return list('plans').map((r,i)=>ListGroup('充电计划',value('充电时段',`${txt(r.startTime)||'—'}–${txt(r.endTime)||'—'}`)+switchRow('已启用',String(r.delFlag)==='0','plan-use').replace('data-owner="plan-use"',`data-owner="plan-use" data-index="${i}"`)+action('编辑','plan-edit',false,`data-index="${i}"`))).join('')+(!list('plans').length?PrimaryButton('新建计划','data-owner="plan-new"'):'')+(pendingPlan?ListGroup('',action('重试启用','plan-retry')):'');}
 function shares(){const key=shareTab==='long'?'shareLong':'shareTemp';if(!Array.isArray(data[key]))return '';const items=list(key).filter(r=>shareTab==='long'||num(r.residualSeconds)!==null&&Number(r.residualSeconds)>0);return Segmented([['long','长期'],['temp','临时']],shareTab,'data-share-tab')+items.map((r,i)=>ListGroup(txt(r.shareName??r.userName)||'车辆分享',value('手机号',maskPhone(r.sharePhone??r.userPhone))+action('撤销分享','share-revoke',true,`data-index="${list(key).indexOf(r)}"`))).join('')+(items.length<3?PrimaryButton('新增分享','data-owner="share-new"'):'');}
 function lowPhone(){if(!has('settings'))return '';if(num(get('settings').ultraLowBatteryReminder)===null)return ListGroup('',value('超低电量电话提醒','—'));const r=get('settings'),on=Number(r.ultraLowBatteryReminder)===1;return ListGroup('',switchRow('超低电量电话提醒',on,'low-toggle')+ListRow('提醒时段',`${txt(r.withdrawalStartTime).slice(0,5)||'07:00'}–${txt(r.withdrawalEndTime).slice(0,5)||'21:00'}`,'data-owner="low-period"'));}
 function render(){if(!active())return;let body='';
  if(ownerRoutes[path]||['/vehicle/info','/vehicle/location'].includes(path))a.toolbar(RefreshButton(),()=>{if(!busy)void initial();});
  if(path==='/vehicle'){const items=reminders();host.innerHTML=items.length?`<button class="tag attention" data-owner="reminders">${items.length} 项提醒</button>`:'';return;}
  if(editor){renderEditor();return;}
  if(path==='/vehicle/status')body=status();else if(path==='/vehicle/info')body=device();else if(path==='/vehicle/firmware')body=firmware();else if(path==='/vehicle/health'&&has('examination'))body=ListGroup('',health().map(r=>value(txt(r.inspectionName)||'异常',r.advise)).join('')||value('体检',examCount()===0?'无异常':examCount()===null?'—':`${examCount()} 项异常`));
  else if(path==='/vehicle/settings')body=settings();else if(path==='/vehicle/location')body=ListGroup('',route('电子围栏','/vehicle/location/fences'));
  else if(path==='/records/battery/score')body=score();else if(path==='/records/battery/official')body=cloudBattery();
  else if(path==='/records/battery')body=(get('score').score!==undefined?ListGroup('',route('本月电池评分','/records/battery/score',txt(get('score').score))):'');
  else if(path==='/records/tires')body=history();else if(path.startsWith('/records/rides'))body=analysis();
  else if(path.endsWith('/phone-keys'))body=phones();else if(path.endsWith('/card-keys'))body=cards();else if(path.endsWith('/fences'))body=fences();else if(path.endsWith('/charge-plan'))body=plan();else if(path.endsWith('/sharing'))body=shares();else if(path.endsWith('/low-phone'))body=lowPhone();
  if(o.demo&&ownerRoutes[path])body=Empty('演示中不可用','key');
  host.innerHTML=`${note?`<p class="form-message" role="status">${html(note)}</p>`:''}${failed?ListGroup('',action('加载失败　重试','retry')):''}${body}`;
  host.querySelectorAll<HTMLButtonElement>('button[data-owner]').forEach(b=>b.disabled||=(busy||o.demo||!s||!navigator.onLine));
 }
 async function mutate(title:string,from:string,to:string,write:()=>Promise<unknown>,readKey:OwnerRead,matches:(v:unknown)=>boolean|null,danger=false){
  if(!s||o.demo||busy||!navigator.onLine)return;
  a.sheet(title,ConfirmSheet(danger?'确认':'确认修改',s.vehicle.name,s.vehicle.vin.slice(-6),'data-owner-confirm',`从 ${from} 改为 ${to}`).replace('class="primary"',danger?'class="primary danger"':'class="primary"')+(danger?'<p class="danger">'+(title.includes('分享')?'对方可以控制这台车':'')+'</p>':''),button=>{
   if(!button.hasAttribute('data-owner-confirm')||busy||!active())return;a.closeSheet();busy=true;note='';render();
   void changeOnce(write,()=>read(readKey,{month,period}),matches,scope.signal).then(result=>{if(active()){note=result;if(readKey==='plans'&&result==='已生效')pendingPlan='';}}).catch(()=>{}).finally(()=>{if(active()){busy=false;render();}});
  });
 }
 function times(title:string,start:string,end:string,done:(start:string,end:string)=>void){let x=start,y=end;const show=()=>a.sheet(title,ListGroup('',ListRow('开始时间',x,'data-time="start"')+ListRow('结束时间',y,'data-time="end"'))+PrimaryButton('继续','data-time="done"'),button=>{const cmd=button.dataset.time;if(cmd==='done'){a.closeSheet();done(x,y);}else if(cmd==='start'||cmd==='end'){const opts=Array.from({length:48},(_,i)=>{const v=String(Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00');return [v,v] as [string,string];});choose(a,cmd==='start'?'开始时间':'结束时间',opts,cmd==='start'?x:y,v=>{if(cmd==='start')x=v;else y=v;show();});}});show();}
 function renderEditor(){if(!editor)return;const r=editor.row;
  if(editor.type==='plan'){host.innerHTML=ListGroup('',action('充电时段','plan-time',false,`data-start="${html(txt(r.startTime)||'07:00')}" data-end="${html(txt(r.endTime)||'21:00')}"`))+value('充电时段',`${txt(r.startTime)||'07:00'}–${txt(r.endTime)||'21:00'}`)+PrimaryButton('保存并启用','data-owner="plan-save"')+SecondaryButton('取消','data-owner="editor-cancel"');}
  if(editor.type==='share'){host.innerHTML=field('姓名','name',txt(r.name))+field('手机号','phone',txt(r.phone),'tel',11)+(shareTab==='temp'?ListGroup('',ListRow('分享时长',`${txt(r.hours)||'24'} 小时`,'data-owner="share-hours"')):'')+PrimaryButton('继续','data-owner="share-save"')+SecondaryButton('取消','data-owner="editor-cancel"');}
  if(editor.type==='fence'){host.innerHTML=field('围栏名称','name',txt(r.rideRangeName))+value('圆心',center?center.longitude.toFixed(5)+', '+center.latitude.toFixed(5):'—')+ListGroup('',ListRow('半径',radius+' m','data-owner="fence-radius"'))+(mapLoaded?'<div class="track-card" data-fence-map></div>':PrimaryButton('加载地图','data-owner="fence-map"'))+SecondaryButton('保存','data-owner="fence-save"')+ListGroup('',action('取消','editor-cancel'));if(mapLoaded)drawMap();}
 }
 function drawMap(){const el=host.querySelector<HTMLElement>('[data-fence-map]');if(!el||!center)return;const scale=256*2**mapZoom,cx=(center.longitude+180)/360*scale,cy=(1-Math.log(Math.tan(Math.PI/4+center.latitude*Math.PI/360))/Math.PI)/2*scale,left=cx-320,top=cy-180;let tiles='';for(let x=Math.floor(left/256);x<Math.ceil((left+640)/256);x++)for(let y=Math.floor(top/256);y<Math.ceil((top+360)/256);y++)tiles+=`<image href="https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&amp;size=1&amp;scale=1&amp;style=8&amp;x=${x}&amp;y=${y}&amp;z=${mapZoom}" x="${x*256-left}" y="${y*256-top}" width="256" height="256"/>`;
  const metersPerPixel=156543.03392*Math.cos(center.latitude*Math.PI/180)/2**mapZoom;
  el.innerHTML=`<svg viewBox="0 0 640 360" role="img" aria-label="点击地图选择围栏圆心">${tiles}<circle class="fence-radius" cx="320" cy="180" r="${Math.min(175,radius/metersPerPixel)}"/><circle cx="320" cy="180" r="5"/></svg><div class="map-actions">${action('放大','map-in')}${action('缩小','map-out')}</div><p class="muted">© 高德地图</p>`;
  el.querySelector('svg')!.addEventListener('click',e=>{const rect=(e.currentTarget as SVGElement).getBoundingClientRect(),wx=left+(e.clientX-rect.left)/rect.width*640,wy=top+(e.clientY-rect.top)/rect.height*360;mapSelected=true;center={longitude:wx/scale*360-180,latitude:Math.atan(Math.sinh(Math.PI*(1-2*wy/scale)))*180/Math.PI};drawMap();});
 }
 const readMatch=(v:unknown,key:string,target:unknown)=>obj(v)[key]===undefined?null:String(obj(v)[key])===String(target);
 async function click(event:Event){const b=(event.target as Element).closest<HTMLElement>('button');if(!b||b.hasAttribute('disabled')||busy)return;const cmd=b.dataset.owner,i=Number(b.dataset.index);if(!cmd||o.demo||!s)return;
  if(cmd==='reminders'){a.sheet('车辆提醒',ListGroup('',reminders().map(v=>value(v,'')).join('')),()=>{});return;}
  const readKey=path.endsWith('/sharing')?(shareTab==='long'?'shareLong':'shareTemp'):'settings';
  if(cmd==='retry'){void initial();return;}if(cmd==='editor-cancel'){editor=null;render();return;}
  if(cmd==='reset-maintenance'){const old=num(get('maintenance').keepMileage);void mutate('重置保养提醒',old===null?'—':old+' km','已完成保养',()=>api.resetMaintenance(s,scope.signal),'maintenance',v=>num(obj(v).keepMileage)===null?null:Number(obj(v).keepMileage)>Number(old),true);}
  if(cmd==='ota-detail'){const r=list('otaTasks')[i];const id=txt(r?.iotTaskId);if(id){await loadDetail(id);}}
  if(cmd==='auto-head'||cmd==='fcw'){const key=cmd==='fcw'?'radarFcw':'automaticLock',current=Number(get('settings')[key]),on=cmd==='fcw'?current===1:current!==1;void mutate(cmd==='fcw'?'前碰撞预警':'自动龙头锁',on?'关闭':'开启',on?'开启':'关闭',()=>cmd==='fcw'?api.fcw(s,on,scope.signal):api.autoHead(s,on,scope.signal),'settings',v=>readMatch(v,key,cmd==='fcw'?(on?2:1):(on?1:0)));}
  if(cmd==='password'){a.sheet('修改车端密码',field('新密码','password','','password',4)+field('再次输入','repeat','','password',4)+PrimaryButton('继续','data-password-next'),button=>{if(!button.hasAttribute('data-password-next'))return;const d=button.closest('#runtime-modal')!,p=d.querySelector<HTMLInputElement>('[data-owner-field="password"]')!,r=d.querySelector<HTMLInputElement>('[data-owner-field="repeat"]')!;let secret=p.value;if(!/^\d{4}$/.test(secret)||secret!==r.value){a.toast('两次密码需为相同的 4 位数字');return;}p.value=r.value='';a.closeSheet();void mutate('修改车端密码','原密码','新密码',()=>{const v=secret;secret='';return api.password(s,v,scope.signal);},'settings',()=>null,true);});}
  if(cmd==='remove-phone'){const r=phoneKeys()[i];if(!r||!identityReady||o.native.available&&!ownIdentity||!r.uniqueIdentify||r.uniqueIdentify===ownIdentity)return;void mutate('删除设备',txt(r.phoneName),'已删除',()=>api.removePhoneKey(s,txt(r.id),scope.signal),'phoneKeys',v=>Array.isArray(v)?!rows(v).flatMap(r=>rows(r.inductiveUnlockVOList).length?rows(r.inductiveUnlockVOList):[r]).some(x=>x.id===r.id):null,true);}
  if(cmd==='remove-card'){const r=list('nfcKeys')[i];if(!r)return;void mutate('删除卡钥匙',txt(r.nfcName),'已删除',()=>api.removeCard(s,txt(r.nfcNo),scope.signal),'nfcKeys',v=>Array.isArray(v)?!rows(v).some(x=>x.id===r.id):null,true);}
  if(cmd==='rename-card'){const r=list('nfcKeys')[i];if(!r)return;a.sheet('卡钥匙名称',field('名称','name',txt(r.nfcName))+PrimaryButton('继续','data-card-name'),button=>{if(!button.hasAttribute('data-card-name'))return;const name=button.closest('#runtime-modal')!.querySelector<HTMLInputElement>('input')!.value.trim();if(!name)return;a.closeSheet();void mutate('卡钥匙改名',txt(r.nfcName),name,()=>api.renameCard(s,txt(r.id),name,scope.signal),'nfcKeys',v=>Array.isArray(v)?rows(v).some(x=>x.id===r.id&&x.nfcName===name):null);});}
  if(cmd==='low-toggle'||cmd==='low-period'){const r=get('settings'),on=Number(r.ultraLowBatteryReminder)===1,start=txt(r.withdrawalStartTime).slice(0,5)||'07:00',end=txt(r.withdrawalEndTime).slice(0,5)||'21:00';const save=(x:string,y:string,next:boolean)=>void mutate('超低电量电话提醒',`${on?'开启':'关闭'} ${start}–${end}`,`${next?'开启':'关闭'} ${x}–${y}`,()=>api.lowPhone(s,next,x,y,scope.signal),'settings',v=>obj(v).ultraLowBatteryReminder===undefined?null:Number(obj(v).ultraLowBatteryReminder)===(next?1:0)&&txt(obj(v).withdrawalStartTime).slice(0,5)===x&&txt(obj(v).withdrawalEndTime).slice(0,5)===y);if(cmd==='low-period')times('提醒时段',start,end,(x,y)=>save(x,y,on));else save(start,end,!on);}
  if(cmd==='fence-new'||cmd==='fence-edit'){const r=cmd==='fence-edit'?list('fences')[i]:{};editor={type:'fence',row:{...r}};const coords=txt(r.addrPosition).split(',').map(Number);center=coords.length===2&&coords.every(Number.isFinite)?{longitude:coords[0],latitude:coords[1]}:o.snapshot?.daily.location?{longitude:o.snapshot.daily.location.longitude,latitude:o.snapshot.daily.location.latitude}:null;radius=num(r.radius)!==null?Number(r.radius)*1000:500;mapSelected=Boolean(r.id);mapLoaded=false;render();}
  if(cmd==='fence-map'){if(!center)center={longitude:116.397,latitude:39.908};editor!.row.rideRangeName=host.querySelector<HTMLInputElement>('input')!.value;mapLoaded=true;render();}
  if(cmd==='map-in'||cmd==='map-out'){mapZoom=Math.max(8,Math.min(18,mapZoom+(cmd==='map-in'?1:-1)));drawMap();}
  if(cmd==='fence-radius'){if(editor)editor.row.rideRangeName=host.querySelector<HTMLInputElement>('input')!.value;choose(a,'半径',Array.from({length:49},(_,i)=>{const v=200+i*100;return [String(v),v+' m'] as [string,string];}),String(radius),v=>{radius=Number(v);if(center)mapZoom=Math.max(8,Math.min(18,Math.floor(Math.log2(156543.03392*Math.cos(center.latitude*Math.PI/180)*150/radius))));render();});}
  if(cmd==='fence-save'&&editor?.type==='fence'){const name=host.querySelector<HTMLInputElement>('input')!.value.trim();if(!name||!center||!mapLoaded||!mapSelected){a.toast(!name?'请填写围栏名称':'请在地图上选择圆心');return;}const old={...editor.row},next={...old,rideRangeName:name,addrPositionName:name,addrPosition:`${center.longitude},${center.latitude}`,radius:String(radius/1000)};editor=null;void mutate('电子围栏',old.id?txt(old.rideRangeName)+' · '+Number(old.radius)*1000+' m':'无',name+' · '+radius+' m',()=>api.saveFence(s,next,scope.signal),'fences',v=>Array.isArray(v)?rows(v).some(x=>x.rideRangeName===name&&String(x.radius)===String(radius/1000)&&x.addrPosition===next.addrPosition):null);render();}
  if(cmd==='fence-use'||cmd==='fence-delete'){const r=list('fences')[i];if(!r)return;const on=String(r.delFlag)!=='0';void mutate(cmd==='fence-delete'?'删除围栏':'电子围栏',txt(r.rideRangeName)+' · '+(String(r.delFlag)==='0'?'开启':'关闭'),cmd==='fence-delete'?'已删除':on?'开启':'关闭',()=>cmd==='fence-delete'?api.removeFence(s,txt(r.id),scope.signal):api.useFence(s,txt(r.id),on,scope.signal),'fences',v=>Array.isArray(v)?cmd==='fence-delete'?!rows(v).some(x=>x.id===r.id):rows(v).some(x=>x.id===r.id&&String(x.delFlag)===(on?'0':'1')):null,cmd==='fence-delete');}
  if(cmd==='plan-new'||cmd==='plan-edit'){editor={type:'plan',row:cmd==='plan-edit'?{...list('plans')[i]}:{startTime:'07:00',endTime:'21:00'}};render();}
  if(cmd==='plan-time'&&editor){times('充电时段',txt(editor.row.startTime),txt(editor.row.endTime),(x,y)=>{if(editor){editor.row.startTime=x;editor.row.endTime=y;render();}});}
  if(cmd==='plan-save'&&editor?.type==='plan'){const r={...editor.row},old=list('plans').find(x=>x.id===r.id);editor=null;a.sheet('充电计划',ConfirmSheet('保存并启用',s.vehicle.name,s.vehicle.vin.slice(-6),'data-plan-confirm',`从 ${old?txt(old.startTime)+'–'+txt(old.endTime):'无计划'} 改为 ${txt(r.startTime)}–${txt(r.endTime)}`),button=>{if(button.hasAttribute('data-plan-confirm')&&!busy){a.closeSheet();void savePlan(r);}});render();}
  if(cmd==='plan-use'||cmd==='plan-retry'){const r=cmd==='plan-retry'?{id:pendingPlan,delFlag:'1'}:list('plans')[i];if(!r)return;const on=String(r.delFlag)!=='0';void mutate('充电计划',on?'未启用':'已启用',on?'已启用':'未启用',()=>api.usePlan(s,txt(r.id),on,scope.signal),'plans',v=>Array.isArray(v)?rows(v).some(x=>x.id===r.id&&String(x.delFlag)===(on?'0':'1')):null);}
  if(cmd==='share-new'){const existing=list(readKey).filter(r=>shareTab==='long'||Number(r.residualSeconds)>0);if(existing.length>=3)return;editor={type:'share',row:{hours:txt(list('shareTimes')[0]?.hours)||'24'}};render();}
  if(cmd==='share-hours'&&editor){editor.row.name=host.querySelector<HTMLInputElement>('[data-owner-field="name"]')!.value;editor.row.phone=host.querySelector<HTMLInputElement>('[data-owner-field="phone"]')!.value;choose(a,'分享时长',list('shareTimes').filter(r=>num(r.hours)!==null).map(r=>[txt(r.hours),txt(r.hours)+' 小时']),txt(editor.row.hours),v=>{if(editor){editor.row.hours=v;render();host.querySelector<HTMLInputElement>('[data-owner-field="name"]')!.value=txt(editor.row.name);host.querySelector<HTMLInputElement>('[data-owner-field="phone"]')!.value=txt(editor.row.phone);}});}
  if(cmd==='share-save'&&editor?.type==='share'){const name=host.querySelector<HTMLInputElement>('[data-owner-field="name"]')!.value.trim(),phone=host.querySelector<HTMLInputElement>('[data-owner-field="phone"]')!.value.trim(),hours=Number(editor.row.hours)||24;if(!name||!/^1\d{10}$/.test(phone)){a.toast('请填写姓名和手机号');return;}editor=null;void mutate('车辆分享',shareTab==='long'?'未分享':'未分享',`${name} ${maskPhone(phone)} · 对方可以控制这台车`,()=>api.share(s,shareTab==='long'?'long':'temp',name,phone,hours,scope.signal),readKey,v=>Array.isArray(v)?rows(v).some(r=>(r.sharePhone??r.userPhone)===phone):null,true);render();}
  if(cmd==='share-revoke'){const r=list(readKey)[i];if(!r)return;void mutate('撤销分享',txt(r.shareName??r.userName),'已撤销',()=>api.revokeShare(s,r,scope.signal),readKey,v=>Array.isArray(v)?!rows(v).some(x=>x.id===r.id&&(shareTab==='long'||Number(x.residualSeconds)>0)):null,true);}
 }
 async function savePlan(r:OwnerRow){if(!s)return;busy=true;note='';render();let saved=false;
  try{
   let result:unknown,rejected=false;
   try{result=await api.savePlan(s,txt(r.startTime),txt(r.endTime),txt(r.id)||undefined,scope.signal);saved=true;}catch(e){rejected=e instanceof ApiError&&e.kind==='rejected'&&(e.httpStatus===undefined||e.httpStatus<500&&![408,429].includes(e.httpStatus));}
   if(!active())return;
   await read('plans').catch(()=>null);if(!active())return;
   pendingPlan=saved?txt(result)||txt(r.id):'';
   if(!saved||!pendingPlan){note=rejected?'修改未生效':'已发送，车辆尚未确认';return;}
   // The enable operation is separate, only after an acknowledged save with a known id.
   const outcome=await changeOnce(()=>api.usePlan(s!,pendingPlan,true,scope.signal),()=>read('plans'),v=>Array.isArray(v)?rows(v).some(x=>x.id===pendingPlan&&String(x.delFlag)==='0'):null,scope.signal);
   if(!active())return;
   const confirmed=list('plans').find(x=>x.id===pendingPlan);
   note=outcome==='已生效'?'已生效':confirmed&&String(confirmed.delFlag)==='1'?'已保存，未启用':'已发送，车辆尚未确认';
   if(note==='已生效')pendingPlan='';
  }catch{if(active())note='已发送，车辆尚未确认';}finally{if(active()){busy=false;render();}}
 }
 async function loadDetail(id:string){try{await read('otaDetail',{id});render();}catch{if(active()){note='加载失败';render();}}}
 function initial(){const keys:OwnerRead[]=path==='/vehicle'?['expiry','recharge','maintenance','tires','sim','examination']:path==='/vehicle/status'?['sim','expiry','recharge','examination','maintenance','score','home']:path==='/vehicle/info'?['home','redPoint']:path==='/vehicle/health'?['examination']:path==='/vehicle/firmware'?['redPoint','otaTasks','otaRecords','otaStatus']:path==='/records/battery/score'||path==='/records/battery'?['score']:path==='/records/battery/official'?['battery','charges','uses']:path==='/records/tires'?['tireHistory']:path.startsWith('/records/rides/')?['rideDay']:path==='/records/rides'?['analysis']:path.endsWith('/phone-keys')?['phoneKeys','bleStatus']:path.endsWith('/card-keys')?['nfcKeys']:path.endsWith('/fences')?['fences']:path.endsWith('/charge-plan')?['plans']:path.endsWith('/sharing')?['shareLong','shareTemp','shareTimes']:path==='/vehicle/settings'?['settings','caps']:path.endsWith('/low-phone')?['settings']:[];return load(keys);}
 function monthChanged(event:Event){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number((event as CustomEvent).detail));month=d.toISOString().slice(0,7);void load(['analysis']);}
 function change(event:Event){const b=(event.target as Element).closest<HTMLElement>('button');if(!b||busy)return;if(b.dataset.tirePeriod){period=b.dataset.tirePeriod;void load(['tireHistory']);}if(b.dataset.shareTab){shareTab=b.dataset.shareTab;editor=null;render();}if(b.dataset.monthMove){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(b.dataset.monthMove));month=d.toISOString().slice(0,7);void load(['charges','uses']);}}
 host.addEventListener('owner-month',monthChanged);host.addEventListener('click',click);host.addEventListener('click',change);
 if(o.native.available&&!o.demo)void o.native.call<OwnerRow>('status',{},scope.signal).then(v=>{if(active()){ownIdentity=txt(v.uniqueIdentify);identityReady=true;render();}}).catch(()=>{});
 void initial();
 return()=>{alive=false;scope.abort();data={};host.removeEventListener('owner-month',monthChanged);host.removeEventListener('click',click);host.removeEventListener('click',change);};
}
