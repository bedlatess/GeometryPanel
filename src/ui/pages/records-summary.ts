import { ExtensionsApi } from '../../api/extensions';
import { ApiError } from '../../api/client';
import { nativeAccountsAuthorized } from '../../core/background';
import { readLocalHistory } from '../../core/history-store';
import { validateHistory, type ChargingSession } from '../../core/history';
import type { NativeClient, NativeCapabilities } from '../../core/native';
import type { Session, Snapshot } from '../../core/model';
import type { TireReading } from '../../core/extensions-model';
import { recordsPage } from './records';

/** Read existing sources for the three entry cards; never writes or sends commands. */
export function mountRecordsSummary(host: HTMLElement, o: { session: Session | null; snapshot: Snapshot | null; vehicleId: string; native: NativeClient; demo: boolean; onExpired(): void }) {
  let disposed=false,charge:ChargingSession|undefined,tires:TireReading[]=[];
  const aborter=new AbortController();
  const render=()=>{if(!disposed)host.innerHTML=recordsPage(o.snapshot,charge,tires);};
  render();
  if(!o.demo&&o.session) {
    void (async()=>{
      try {
        let sessions:ChargingSession[];
        const caps=o.native.available?await o.native.call<NativeCapabilities>('capabilities',{},aborter.signal):null;
        if(caps?.features.history&&nativeAccountsAuthorized()) {
          const history=await o.native.call<{items:unknown[]}>('background.history',{vehicleId:o.vehicleId,kind:'charge',limit:500},aborter.signal);
          sessions=validateHistory({schema:1,samples:[],chargingSessions:history.items}).chargingSessions;
        } else sessions=(await readLocalHistory(o.vehicleId)).chargingSessions;
        if(disposed)return;
        charge=[...sessions].sort((a,b)=>(b.endedAt??b.startedAt)-(a.endedAt??a.startedAt))[0];render();
      } catch { /* Missing history stays missing. */ }
    })();
    if(navigator.onLine)void new ExtensionsApi().tires(o.session,aborter.signal).then(value=>{
      if(disposed)return;tires=value.wheels;render();
    }).catch(error=>{if(!disposed&&error instanceof ApiError&&error.kind==='expired')o.onExpired();});
  }
  return ()=>{disposed=true;aborter.abort();};
}
