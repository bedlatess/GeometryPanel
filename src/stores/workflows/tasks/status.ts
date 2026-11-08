import type { Context } from './context';
export function register(ctx: Context) {
  ctx.status = async function (poll = false) {
    try {
      const raw = await ctx.options.native.call('tasks.status', {}, ctx.aborter.signal);
      if (!ctx.alive) return;
      const running = ctx.receiveStatus(raw);
      ctx.render();
      if (poll && running)
        ctx.timer = setTimeout(() => {
          ctx.timer = null;
          void ctx.status(true);
        }, 3000);
      else if (poll) void ctx.load();
    } catch (failure) {
      if (ctx.alive && !ctx.aborter.signal.aborted) {
        ctx.fail(failure);
        ctx.render();
      }
    }
  };
}
