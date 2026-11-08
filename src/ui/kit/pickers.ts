import { CalendarPicker, PickerSheet } from './index';
import type { PageActions } from '../pages/actions';
export function choose(actions:PageActions,title:string,items:[string,string][],value:string,done:(value:string)=>void){
 actions.sheet(title,PickerSheet(items,value,'pick-value'),button=>{if(button.dataset.action==='pick-value'&&items.some(([id])=>id===button.dataset.value)){actions.closeSheet();done(button.dataset.value!);}});
}
export function chooseDate(actions:PageActions,title:string,value:string,done:(value:string)=>void){
 let month=value||new Date().toISOString().slice(0,10);
 const render=()=>actions.sheet(title,CalendarPicker(month),button=>{
  if(button.dataset.dateValue){actions.closeSheet();done(button.dataset.dateValue);}
  if(button.dataset.calendarMonth){const d=new Date(month+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+Number(button.dataset.calendarMonth));month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;render();}
 });render();
}
