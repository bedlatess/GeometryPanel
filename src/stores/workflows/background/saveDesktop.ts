import type { Context } from './context';
export function register(ctx: Context) {
  ctx.saveDesktop = function () {
    try {
      const value = JSON.parse(localStorage.getItem(ctx.desktopKey) ?? '{}');
      const next: Record<string, unknown> = {};
      for (const car of ctx.vehicles)
        if (value?.[car.id])
          next[car.id] = { style: value[car.id].style, controls: value[car.id].controls === true };
      next[ctx.selected] = { style: ctx.style, controls: ctx.controls };
      localStorage.setItem(ctx.desktopKey, JSON.stringify(next));
    } catch {}
  };
}
