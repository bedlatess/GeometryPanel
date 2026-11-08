import type { Context } from './context';
export function register(ctx: Context) {
  ctx.supported = function (code: string) {
    return ctx
      .list('caps')
      .some(
        (r) =>
          r.functionCode === code &&
          (r.isSupport === true || r.isSupport === 1 || r.isSupport === '1'),
      );
  };
}
