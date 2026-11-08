import { ownerNumber as num, ownerRows as rows, ownerText as txt } from '../../../core/owner-model';
import { choose } from '../../workflow-actions';

import type { Context } from './context';
export function register(ctx: Context) {
  ctx.ownerFences = async function (event: Event) {
    const b = (event.target as Element).closest<HTMLElement>('button');
    if (!b || b.hasAttribute('disabled') || ctx.busy) return;
    const cmd = b.dataset.owner,
      i = Number(b.dataset.index);
    if (!cmd || ctx.o.demo || !ctx.s!) return;
    const readKey = ctx.path.endsWith('/sharing')
      ? ctx.shareTab === 'long'
        ? 'shareLong'
        : 'shareTemp'
      : 'settings';
    if (cmd === 'fence-new' || cmd === 'fence-edit') {
      const r = cmd === 'fence-edit' ? ctx.list('fences')[i] : {};
      ctx.editor = { type: 'fence', row: { ...r } };
      const coords = txt(r.addrPosition).split(',').map(Number);
      ctx.center =
        coords.length === 2 && coords.every(Number.isFinite)
          ? { longitude: coords[0], latitude: coords[1] }
          : ctx.o.snapshot?.daily.location
            ? {
                longitude: ctx.o.snapshot.daily.location.longitude,
                latitude: ctx.o.snapshot.daily.location.latitude,
              }
            : null;
      ctx.radius = num(r.radius) !== null ? Number(r.radius) * 1000 : 500;
      ctx.mapSelected = Boolean(r.id);
      ctx.mapLoaded = false;
      ctx.render();
    }
    if (cmd === 'fence-map') {
      if (!ctx.center) ctx.center = { longitude: 116.397, latitude: 39.908 };
      ctx.editor!.row.rideRangeName = ctx.host.querySelector<HTMLInputElement>('input')!.value;
      ctx.mapLoaded = true;
      ctx.render();
    }
    if (cmd === 'map-in' || cmd === 'map-out') {
      ctx.mapZoom = Math.max(8, Math.min(18, ctx.mapZoom + (cmd === 'map-in' ? 1 : -1)));
      ctx.drawMap();
    }
    if (cmd === 'fence-radius') {
      if (ctx.editor)
        ctx.editor.row.rideRangeName = ctx.host.querySelector<HTMLInputElement>('input')!.value;
      choose(
        ctx.a,
        '半径',
        Array.from({ length: 49 }, (_, i) => {
          const v = 200 + i * 100;
          return [String(v), v + ' m'] as [string, string];
        }),
        String(ctx.radius),
        (v) => {
          ctx.radius = Number(v);
          if (ctx.center)
            ctx.mapZoom = Math.max(
              8,
              Math.min(
                18,
                Math.floor(
                  Math.log2(
                    (156543.03392 * Math.cos((ctx.center.latitude * Math.PI) / 180) * 150) /
                      ctx.radius,
                  ),
                ),
              ),
            );
          ctx.render();
        },
      );
    }
    if (cmd === 'fence-save' && ctx.editor?.type === 'fence') {
      const name = ctx.host.querySelector<HTMLInputElement>('input')!.value.trim();
      if (!name || !ctx.center || !ctx.mapLoaded || !ctx.mapSelected) {
        ctx.a.toast(!name ? '请填写围栏名称' : '请在地图上选择圆心');
        return;
      }
      const old = { ...ctx.editor.row },
        next = {
          ...old,
          rideRangeName: name,
          addrPositionName: name,
          addrPosition: `${ctx.center.longitude},${ctx.center.latitude}`,
          radius: String(ctx.radius / 1000),
        };
      ctx.editor = null;
      void ctx.mutate(
        '电子围栏',
        old.id ? txt(old.rideRangeName) + '　' + Number(old.radius) * 1000 + ' m' : '无',
        name + '　' + ctx.radius + ' m',
        () => ctx.api.saveFence(ctx.s!, next, ctx.scope.signal),
        'fences',
        (v) =>
          Array.isArray(v)
            ? rows(v).some(
                (x) =>
                  x.rideRangeName === name &&
                  String(x.radius) === String(ctx.radius / 1000) &&
                  x.addrPosition === next.addrPosition,
              )
            : null,
      );
      ctx.render();
    }
    if (cmd === 'fence-use' || cmd === 'fence-delete') {
      const r = ctx.list('fences')[i];
      if (!r) return;
      const on = String(r.delFlag) !== '0';
      void ctx.mutate(
        cmd === 'fence-delete' ? '删除围栏' : '电子围栏',
        txt(r.rideRangeName) + '　' + (String(r.delFlag) === '0' ? '开启' : '关闭'),
        cmd === 'fence-delete' ? '已删除' : on ? '开启' : '关闭',
        () =>
          cmd === 'fence-delete'
            ? ctx.api.removeFence(ctx.s!, txt(r.id), ctx.scope.signal)
            : ctx.api.useFence(ctx.s!, txt(r.id), on, ctx.scope.signal),
        'fences',
        (v) =>
          Array.isArray(v)
            ? cmd === 'fence-delete'
              ? !rows(v).some((x) => x.id === r.id)
              : rows(v).some((x) => x.id === r.id && String(x.delFlag) === (on ? '0' : '1'))
            : null,
        cmd === 'fence-delete',
      );
    }
  };
}
