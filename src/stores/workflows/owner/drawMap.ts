import type { Context } from './context';
export function register(ctx: Context) {
  ctx.drawMap = function () {
    ctx.render();
  };
}
