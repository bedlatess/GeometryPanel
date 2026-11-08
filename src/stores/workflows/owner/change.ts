import type { Context } from './context';
export function register(ctx: Context) {
  ctx.change = function (event: Event) {
    const b = (event.target as Element).closest<HTMLElement>('button');
    if (!b || ctx.busy) return;
    if (b.dataset.tirePeriod) {
      ctx.period = b.dataset.tirePeriod;
      void ctx.load(['tireHistory']);
    }
    if (b.dataset.shareTab) {
      ctx.shareTab = b.dataset.shareTab;
      ctx.editor = null;
      ctx.render();
    }
    if (b.dataset.monthMove) {
      const d = new Date(ctx.month + '-01T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + Number(b.dataset.monthMove));
      ctx.month = d.toISOString().slice(0, 7);
      void ctx.load(['charges', 'uses']);
    }
  };
}
