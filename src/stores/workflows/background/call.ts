import { type NativeMethod } from '../../../core/native';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.call = async function (method: NativeMethod, params: object = {}) {
    return ctx.native.call<any>(method, params, ctx.controller.signal);
  };
}
