export const shortcutOptions = ['location','status','settings','tires','rides','battery','messages','high','storage','more'] as const;
export type Shortcut = typeof shortcutOptions[number];
export type StartPage = 'vehicle' | 'records' | 'tools' | 'me';
export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  voltage: boolean;
  range: boolean;
  startPage: StartPage;
  foregroundRefresh: boolean;
  shortcut: Shortcut[];
}
const defaultShortcuts: Shortcut[] = ['location','status','settings','more'];
export const defaultPreferences: Readonly<Preferences> = Object.freeze({
  theme: 'system', voltage: true, range: true, startPage: 'vehicle', foregroundRefresh: true,
  shortcut: Object.freeze(defaultShortcuts) as unknown as Shortcut[],
});
const choices = { theme: ['system','light','dark'], startPage: ['vehicle','records','tools','me'] };
function record(value: unknown): value is Record<string,unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function valid(key:string,value:unknown,legacy=false) {
  if (key==='accent') return legacy && ['green','blue','orange'].includes(String(value));
  if (key==='shortcut') return Array.isArray(value) ? value.length===4 && value.every(v=>shortcutOptions.includes(v)) : legacy && ['horn','seat','daily'].includes(String(value));
  if (key==='startPage' && legacy && value==='daily') return true;
  return key in choices ? (choices[key as keyof typeof choices] as readonly unknown[]).includes(value) : ['voltage','range','foregroundRefresh'].includes(key) && typeof value==='boolean';
}
export function normalizePreferences(value:unknown):Preferences {
  const result={...defaultPreferences,shortcut:[...defaultShortcuts]};
  if (!record(value)) return result;
  for(const key of Object.keys(result) as (keyof Preferences)[]) if(valid(key,value[key])) Object.assign(result,{[key]:key==='shortcut'?[...value[key] as Shortcut[]]:value[key]});
  return result;
}
export function readPreferences(key:string):Preferences { try{return normalizePreferences(JSON.parse(localStorage.getItem(key)||'{}'));}catch{return normalizePreferences(null);} }
export function writePreferences(value:Preferences,key:string):boolean { try{localStorage.setItem(key,JSON.stringify(normalizePreferences(value)));return true;}catch{return false;} }
export function exportPreferences(value:Preferences):string {return JSON.stringify({app:'GeometryPanel',schema:1,preferences:normalizePreferences(value)},null,2);}
export function importPreferences(text:string):Preferences {
 if(text.length>4096)throw new Error('preferences');
 let data:unknown;try{data=JSON.parse(text);}catch{throw new Error('preferences');}
 if(!record(data)||data.app!=='GeometryPanel'||data.schema!==1||Object.keys(data).some(k=>!['app','schema','preferences'].includes(k))||!record(data.preferences))throw new Error('preferences');
 const values=data.preferences,legacy=typeof values.shortcut==='string';
 if(Object.keys(values).some(k=>!valid(k,values[k],legacy))||Object.keys(defaultPreferences).some(k=>!Object.hasOwn(values,k))||legacy&&!Object.hasOwn(values,'accent'))throw new Error('preferences');
 return normalizePreferences(values);
}
