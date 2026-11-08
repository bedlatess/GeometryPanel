import type { Context } from './context';
export function register(ctx: Context) {
  ctx.loadDetail = async function (id: string) {
    try {
      await ctx.read('otaDetail', { id });
      ctx.render();
    } catch {
      if (ctx.active()) {
        ctx.note = '加载失败';
        ctx.render();
      }
    }
  };
}
