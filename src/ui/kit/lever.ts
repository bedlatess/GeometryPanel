import { icon } from '../icons';
import { html } from './index';
export type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';
export function Lever(locked: boolean | null, phase: LeverPhase = 'idle', disabled = false, reason = '', target: 'powerOn' | 'powerOff' = 'powerOn') {
  const center = phase === 'idle' && locked === null || phase === 'error', right = phase === 'sending' || phase === 'pending' || phase === 'success' ? target === 'powerOn' : locked === false;
  const text = phase === 'sending' ? '正在发送' : phase === 'pending' ? '等待车辆响应' : phase === 'success' ? target === 'powerOn' ? '已开锁' : '已锁车' : center ? '锁车 ｜ 开锁' : locked ? '上电开锁' : '关机锁车';
  const glyph = phase === 'sending' ? 'refresh' : phase === 'pending' ? 'clock' : phase === 'success' ? 'check' : phase === 'error' ? 'info' : locked === false ? 'unlock' : 'lock';
  const arrows = (left = false) => `<span class="lever-arrows" aria-hidden="true">${[1,2,3].map(() => `<i>${left ? '‹' : '›'}</i>`).join('')}</span>`;
  return `<div class="lever-control"><button type="button" class="lever ${center ? 'center' : right ? 'right' : 'left'} phase-${phase}" data-action="lever" data-value="${locked === false ? 'powerOff' : 'powerOn'}" data-lock="${locked === null ? 'unknown' : locked ? 'locked' : 'unlocked'}" aria-label="${html(center ? '锁车 ｜ 开锁' : text)}" aria-description="需要确认" ${disabled || ['sending', 'pending'].includes(phase) ? 'disabled' : ''}><span class="lever-label">${center ? '<span>‹‹ 锁车</span><span>开锁 ››</span>' : right && phase === 'idle' ? `${arrows(true)}${text}` : `${text}${phase === 'idle' ? arrows() : ''}`}</span><span class="lever-knob ${phase === 'sending' ? 'spinning' : ''}">${icon(glyph)}</span></button>${reason ? `<span class="lever-reason">${html(reason)}</span>` : ''}</div>`;
}

/** All input paths share one explicit gesture; this module never sends commands. */
export function mountLever(host: HTMLElement, confirm: (action: 'powerOn' | 'powerOff', drag: boolean) => void) {
  let start: { x: number; y: number; knob: number; max: number; element: HTMLButtonElement } | null = null;
  let moved = false, keyboard: 'powerOn' | 'powerOff' | null = null, suppressClick = false;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  const element = (event: Event) => (event.target as Element).closest<HTMLButtonElement>('.lever:not(:disabled)');
  function down(event: PointerEvent) {
    const button = element(event); if (!button || event.button !== 0) return;
    const knob = button.querySelector<HTMLElement>('.lever-knob')!, max = button.clientWidth - knob.offsetWidth - 8;
    const value = button.dataset.lock === 'unknown' ? max / 2 : button.dataset.lock === 'unlocked' ? max : 0;
    start = { x: event.clientX, y: event.clientY, knob: value, max, element: button }; moved = false;
    button.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!moved && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { cancel(); return; }
    if (Math.abs(dx) > 6) moved = true;
    if (!moved) return;
    const x = Math.max(0, Math.min(start.max, start.knob + dx));
    start.element.style.setProperty('--drag-x', `${x}px`); start.element.classList.add('dragging');
    start.element.style.setProperty('--label-opacity', String(1 - Math.min(1, Math.abs(x - start.knob) / Math.max(1, start.max - start.knob || start.max))));
  }
  function cancel() { if (start) { start.element.style.removeProperty('--drag-x'); start.element.style.removeProperty('--label-opacity'); start.element.classList.remove('dragging'); } start = null; }
  function up(event: PointerEvent) {
    if (!start) return;
    const current = start, dx = event.clientX - current.x;
    const available = dx > 0 ? current.max - current.knob : current.knob;
    const accepted = moved && available > 0 && Math.abs(dx) / available >= .7;
    suppressClick = moved; clearTimeout(clickTimer); clickTimer = setTimeout(() => { suppressClick = false; }, 0); cancel();
    if (accepted) confirm(dx > 0 ? 'powerOn' : 'powerOff', true);
  }
  function click(event: Event) {
    const button = element(event); if (!button) return;
    event.stopPropagation();
    if (suppressClick) { suppressClick = false; return; }
    confirm(keyboard ?? (button.dataset.lock === 'unlocked' ? 'powerOff' : 'powerOn'), false); keyboard = null;
  }
  function key(event: KeyboardEvent) {
    const button = element(event); if (!button) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); keyboard = event.key === 'ArrowLeft' ? 'powerOff' : 'powerOn'; button.setAttribute('aria-label', keyboard === 'powerOn' ? '上电开锁' : '关机锁车'); }
  }
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', cancel); host.addEventListener('click', click); host.addEventListener('keydown', key);
  return () => { cancel(); clearTimeout(clickTimer); host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', cancel); host.removeEventListener('click', click); host.removeEventListener('keydown', key); };
}
