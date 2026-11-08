import type { Context } from './context';
export function register(ctx: Context) {
  ctx.load = async function () {
    if (!ctx.alive || ctx.busy) return;
    const current = ++ctx.generation,
      binding = ctx.account;
    ctx.loading = true;
    ctx.error = '';
    ctx.render();
    try {
      if (ctx.options.demo) {
        ctx.summary = {
          points: 1280,
          tasks: [{ code: '1023', title: '每日动态', action: 'post', completed: false }],
        };
        ctx.sign = { signed: true, count: 12 };
      } else if (binding) {
        const result = await Promise.all([
          ctx.api.summary(binding, ctx.aborter.signal),
          ctx.api.count(binding, ctx.aborter.signal),
        ]);
        if (!ctx.alive || current !== ctx.generation) return;
        [ctx.summary, ctx.sign] = result;
      }
    } catch (failure) {
      if (ctx.alive && current === ctx.generation && !ctx.aborter.signal.aborted) ctx.fail(failure);
    } finally {
      if (ctx.alive && current === ctx.generation) {
        ctx.loading = false;
        ctx.render();
      }
    }
  };
}
