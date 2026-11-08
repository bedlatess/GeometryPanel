import type { Context } from './context';
export function register(ctx: Context) {
  ctx.loadDesktop = function () {
    ctx.style = '2x2';
    ctx.controls = false;
    if (ctx.demo) return;
    try {
      const value = JSON.parse(localStorage.getItem(ctx.desktopKey) ?? '{}')?.[ctx.selected];
      if (['1x1', '2x2', '4x2', '4x4'].includes(value?.style)) ctx.style = value.style;
      ctx.controls = value?.controls === true;
    } catch {}
  };
}
