import { type OwnerRead } from '../../../api/owner';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.initial = function () {
    const keys: OwnerRead[] =
      ctx.path === '/vehicle'
        ? ['expiry', 'recharge', 'maintenance', 'tires', 'sim', 'examination']
        : ctx.path === '/vehicle/status'
          ? ['sim', 'expiry', 'recharge', 'examination', 'maintenance', 'score', 'home']
          : ctx.path === '/vehicle/info'
            ? ['home', 'redPoint']
            : ctx.path === '/vehicle/health'
              ? ['examination']
              : ctx.path === '/vehicle/firmware'
                ? ['redPoint', 'otaTasks', 'otaRecords', 'otaStatus']
                : ctx.path === '/records/battery/score' || ctx.path === '/records/battery'
                  ? ['score']
                  : ctx.path === '/records/battery/official'
                    ? ['battery', 'charges', 'uses']
                    : ctx.path === '/records/tires'
                      ? ['tireHistory']
                      : ctx.path.startsWith('/records/rides/')
                        ? ['rideDay']
                        : ctx.path === '/records/rides'
                          ? ['analysis']
                          : ctx.path.endsWith('/phone-keys')
                            ? ['phoneKeys', 'bleStatus']
                            : ctx.path.endsWith('/card-keys')
                              ? ['nfcKeys']
                              : ctx.path.includes('/fences')
                                ? ['fences']
                                : ctx.path.endsWith('/charge-plan')
                                  ? ['plans']
                                  : ctx.path.endsWith('/sharing')
                                    ? ['shareLong', 'shareTemp', 'shareTimes']
                                    : ctx.path === '/vehicle/settings'
                                      ? ['settings', 'caps']
                                      : ctx.path.endsWith('/low-phone')
                                        ? ['settings']
                                        : [];
    return ctx.load(keys).then(() => {
      if (!ctx.active() || !ctx.path.includes('/fences/')) return;
      const id = decodeURIComponent(ctx.path.split('/').at(-1)!);
      const index = ctx.list('fences').findIndex((row) => String(row.id) === id);
      if (id !== 'new' && index < 0) return;
      const button = document.createElement('button');
      Object.assign(button.dataset, {
        owner: id === 'new' ? 'fence-new' : 'fence-edit',
        index: String(index),
      });
      void ctx.click({ target: button } as unknown as Event);
    });
  };
}
