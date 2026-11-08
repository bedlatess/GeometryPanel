import type { Context } from './context';
export function register(ctx: Context) {
  ctx.task = async function (work: () => Promise<void>) {
    if (ctx.working || ctx.disposed) return;
    ctx.working = true;
    ctx.message = '';
    ctx.render();
    try {
      await work();
    } catch (error) {
      ctx.message = '加载失败';
    } finally {
      ctx.working = false;
      ctx.render();
    }
  };
}
