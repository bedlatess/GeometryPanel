import { icon, type Icon } from '../icons';
export const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const number = (value: number | null | undefined, unit = '') => value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}${unit}`;
export const age = (value?: number | null) => {
  if (!value) return '时间未知';
  const elapsed = Date.now() - value;
  if (elapsed < -300000) return '时间异常';
  if (elapsed < 60000) return '刚刚';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace('/', '月').replace(' ', '日 ');
};
export const clock = (value?: number | null) => !value ? '时间未知' : value > Date.now() + 300000 ? '时间异常' : new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
export const attrs = (action: string, value?: string) => `data-action="${html(action)}"${value == null ? '' : ` data-value="${html(value)}"`}`;
export const PrimaryButton = (label: string, attributes = '', disabled = false) => `<button class="primary" ${attributes} ${disabled ? 'disabled' : ''}>${html(label)}</button>`;
export const SecondaryButton = (label: string, attributes = '', disabled = false) => `<button class="secondary" ${attributes} ${disabled ? 'disabled' : ''}>${html(label)}</button>`;
export const TextButton = (label: string, attributes = '') => `<button class="action-row" ${attributes}>${html(label)}</button>`;
export const Pill = (label: string, attributes = '') => `<button class="pill" ${attributes}>${html(label)}</button>`;
export function CircleButton(label: string, glyph: Icon, action: string, value?: string, disabled = false, small = false) {
  return `<button class="circle-control ${small ? 'small' : ''}" ${attrs(action, value)} ${disabled ? 'disabled' : ''} aria-label="${html(label)}"><span class="circle">${icon(glyph)}</span><span>${html(label)}</span></button>`;
}
export const Card = (body: string, label = '') => `<section class="card" ${label ? `aria-label="${html(label)}"` : ''}>${body}</section>`;
export const Stat = (value: number | null | undefined, unit: string, label: string) => `<div class="stat"><strong class="num">${number(value)}<small>${value == null ? '' : html(unit)}</small></strong><span>${html(label)}</span></div>`;
export const ListRow = (label: string, value = '', attributes = '', glyph?: Icon, readOnly = false) => `<${readOnly ? 'div' : 'button'} class="list-row" ${attributes}>${glyph ? `<span class="row-icon">${icon(glyph)}</span>` : ''}<span>${html(label)}</span><span class="row-value num">${html(value)}</span>${readOnly ? '' : icon('arrow')}</${readOnly ? 'div' : 'button'}>`;
export const ListGroup = (label: string, body: string) => `<section class="list-section">${label ? `<h2 class="group-title">${html(label)}</h2>` : ''}<div class="list-group">${body}</div></section>`;
export const Switch = (label: string, checked: boolean, attributes = '', disabled = false, busy = false) => `<button class="list-row" role="switch" aria-checked="${checked}" ${attributes} ${disabled || busy ? 'disabled' : ''}><span>${html(label)}</span><span class="switch ${checked ? 'checked' : ''}" aria-hidden="true">${busy ? icon('refresh') : ''}</span></button>`;
export const Segmented = (items: [string, string][], selected: string, attribute: string) => `<div class="segmented">${items.map(([id, label]) => `<button ${attribute}="${html(id)}" aria-pressed="${selected === id}">${html(label)}</button>`).join('')}</div>`;
export const Tag = (label: string, attention = false) => `<span class="tag ${attention ? 'attention' : ''}">${attention ? icon('clock') : ''}${html(label)}</span>`;
export const Badge = (attention = false) => `<i class="badge ${attention ? 'attention' : ''}" aria-hidden="true"></i>`;
export const Empty = (label: string, glyph: Icon = 'info') => `<div class="empty">${icon(glyph)}<p>${html(label)}</p></div>`;
export const Skeleton = () => '<span class="skeleton" aria-label="正在加载"></span>';
export function Chart(values: (number | null)[], energy = false) {
  const points = values.map((value, i) => value == null ? null : [10 + i / Math.max(1, values.length - 1) * 280, 110 - Math.max(0, Math.min(100, value))]);
  let path = '', gaps = '';
  points.forEach((p, i) => { if (p) path += `${i === 0 || !points[i - 1] ? 'M' : 'L'}${p.join(',')}`; else if (i && points[i - 1]) { const next = points.slice(i + 1).find(Boolean); if (next) gaps += `M${points[i - 1]!.join(',')}L${next.join(',')}`; } });
  return `<svg class="chart ${energy ? 'energy' : ''}" viewBox="0 0 300 140" role="img" aria-label="${energy ? '电量变化' : '本月骑行'}"><path d="${path}"/><path class="chart-gap" d="${gaps}"/>${gaps ? '<text x="150" y="132" text-anchor="middle">无数据</text>' : ''}</svg>`;
}
export const MapCard = (address: string, stamp: string, action = 'route', value = '/vehicle/location') => `<section class="map-card"><svg viewBox="0 0 360 180" aria-hidden="true"><g class="contours"><path d="M-20 30C60 0 100 70 190 25S300 5 390 40M-20 55C60 25 100 95 190 50S300 30 390 65M-20 80C60 50 100 120 190 75S300 55 390 90M-20 105C60 75 100 145 190 100S300 80 390 115M-20 130C60 100 100 170 190 125S300 105 390 140M-20 155C60 125 100 195 190 150S300 130 390 165"/><ellipse cx="222" cy="60" rx="42" ry="22"/><ellipse cx="222" cy="60" rx="25" ry="13"/></g><path class="map-road" d="M90 190 150 115 222 60 300-20"/><circle class="map-dot" cx="222" cy="60" r="9"/></svg><div class="map-caption"><button class="map-address" ${attrs(action, value)}><strong>${html(address)}</strong><span>${html(stamp)}</span></button>${Pill('步行找车', attrs('walk'))}</div></section>`;
export const PlatformNote = () => '<div class="platform-note"><span>以下功能需在 App 中使用</span><button class="action-row" data-action="route" data-value="/me/install">获取 App</button></div>';
export const PageHeader = (label: string, extra = '') => `<header class="page-header"><button class="icon-button" data-action="back" aria-label="返回">${icon('back')}</button><h1>${html(label)}</h1><div class="header-extra">${extra}</div></header>`;
export const Sheet = (title: string, body: string) => `<div class="sheet-handle" aria-hidden="true"></div><div class="modal-heading"><h2 id="modal-title">${html(title)}</h2><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div>${body}<p id="modal-message" class="form-message" role="status" aria-live="polite"></p>`;
export const ConfirmSheet = (title: string, target: string, tail: string, attributes: string, consequence = '') => `${Card(`<strong>${html(target)}</strong><span class="muted">尾号 ${html(tail)}</span>`, '目标车辆')}${consequence ? `<p>${html(consequence)}</p>` : ''}${PrimaryButton(title, attributes)}${SecondaryButton('取消', attrs('close'))}`;
export const PickerSheet = (items: [string, string][], selected: string, action: string) => `<div class="picker">${items.map(([id, label]) => `<button class="list-row" ${attrs(action, id)}><span>${html(label)}</span>${id === selected ? icon('check') : ''}</button>`).join('')}</div>`;
export const ActionSheet = (items: [string, Icon, string, string?][]) => items.map(([label, glyph, action, value]) => ListRow(label, '', attrs(action, value), glyph)).join('');

export const duration=(minutes?:number|null)=>minutes==null||!Number.isFinite(minutes)?'—':minutes>=60?`${Math.floor(minutes/60)} 小时${minutes%60?' '+Math.round(minutes%60)+' 分':''}`:`${Math.round(minutes)} 分`;
export const ActionRow=(label:string,attributes='',danger=false)=>`<button class="list-row action-row ${danger?'danger':''}" ${attributes}><span>${html(label)}</span></button>`;
export const RefreshButton=(label='刷新')=>`<button class="icon-button" data-action="page-toolbar" data-page-tool="refresh" aria-label="${html(label)}">${icon('refresh')}</button>`;
export function MonthPicker(month:string,attribute='data-month-step'){const [year,n]=month.split('-');return `<div class="month-picker"><button class="icon-button" ${attribute}="-1" aria-label="上个月">${icon('back')}</button><strong class="num">${year}年${Number(n)}月</strong><button class="icon-button" ${attribute}="1" aria-label="下个月">${icon('arrow')}</button></div>`;}
export function MonthBars(month:string,days:{day?:string|null,date?:string,mileageKm:number|null}[]){const [y,m]=month.split('-').map(Number),count=new Date(y,m,0).getDate(),max=Math.max(1,...days.map(d=>d.mileageKm??0));return `<svg class="ride-bars" viewBox="0 0 320 150" role="img" aria-label="每日里程">${Array.from({length:count},(_,i)=>{const d=days.find(d=>(d.day||d.date||'').replaceAll('.','-').slice(8,10)===String(i+1).padStart(2,'0')),h=(d?.mileageKm??0)/max*100,x=10+i*300/count,w=Math.min(6,300/count-3);return `<rect class="bar-base" x="${x}" y="20" width="${w}" height="100" rx="2"/><rect x="${x}" y="${120-h}" width="${w}" height="${h}" rx="2"/>`;}).join('')}<text x="10" y="145">1日</text><text x="310" y="145" text-anchor="end">${count}日</text></svg>`;}
export function CalendarPicker(value:string,attribute='data-date-value'){const dt=/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Date().toISOString().slice(0,10),[y,m]=dt.split('-').map(Number),count=new Date(y,m,0).getDate(),offset=new Date(y,m-1,1).getDay();return `${MonthPicker(dt.slice(0,7),'data-calendar-month')}<div class="calendar-grid">${['日','一','二','三','四','五','六'].map(d=>`<span>${d}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:count},(_,i)=>{const date=dt.slice(0,8)+String(i+1).padStart(2,'0');return `<button ${attribute}="${date}" aria-pressed="${date===value}">${i+1}</button>`;}).join('')}</div>`;}
