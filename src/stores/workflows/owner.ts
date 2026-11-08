import { OwnerApi, type OwnerRead } from '../../api/owner';
import type { Session, Snapshot } from '../../core/model';
import type { NativeClient } from '../../core/native';
import {
  ownerObject as obj,
  ownerRows as rows,
  ownerText as txt,
  type OwnerRow,
} from '../../core/owner-model';
import { type PageActions } from '../workflow-actions';
import { register as change } from './owner/change';
import { register as click } from './owner/click';
import type { Context } from './owner/context';
import { register as drawMap } from './owner/drawMap';
import { register as initial } from './owner/initial';
import { register as load } from './owner/load';
import { register as loadDetail } from './owner/loadDetail';
import { register as monthChanged } from './owner/monthChanged';
import { register as mutate } from './owner/mutate';
import { register as ownerFences } from './owner/ownerFences';
import { register as ownerKeys } from './owner/ownerKeys';
import { register as ownerPlans } from './owner/ownerPlans';
import { register as ownerSharing } from './owner/ownerSharing';
import { register as phoneKeys } from './owner/phoneKeys';
import { register as read } from './owner/read';
import { register as render } from './owner/render';
import { register as savePlan } from './owner/savePlan';
import { register as supported } from './owner/supported';
import { register as times } from './owner/times';
export function mountOwner(
  host: HTMLElement,
  o: {
    path: string;
    session: Session | null;
    demo: boolean;
    actions: PageActions;
    native: NativeClient;
    snapshot?: Snapshot | null;
    onExpired(): void;
    publish(value: any): void;
  },
) {
  const ctx = { host, o } as Context;
  supported(ctx);
  phoneKeys(ctx);
  read(ctx);
  load(ctx);
  render(ctx);
  mutate(ctx);
  times(ctx);
  drawMap(ctx);
  click(ctx);
  ownerKeys(ctx);
  ownerFences(ctx);
  ownerPlans(ctx);
  ownerSharing(ctx);
  savePlan(ctx);
  loadDetail(ctx);
  initial(ctx);
  monthChanged(ctx);
  change(ctx);
  ctx.api = new OwnerApi();
  ctx.scope = new AbortController();
  ctx.s = ctx.o.session;
  ctx.a = ctx.o.actions;
  ctx.path = ctx.o.path;
  ctx.alive = true;
  ctx.busy = false;
  ctx.note = '';
  ctx.failed = false;
  ctx.month = new Date().toISOString().slice(0, 7);
  ctx.period = '1';
  ctx.shareTab = 'long';
  ctx.pendingPlan = '';
  ctx.data = {};
  ctx.known = new Set<OwnerRead>();
  ctx.errors = new Set<OwnerRead>();
  ctx.ownIdentity = '';
  ctx.identityReady = !ctx.o.native.available;
  ctx.editor = null;
  ctx.mapLoaded = false;
  ctx.mapSelected = false;
  ctx.center = null;
  ctx.radius = 500;
  ctx.mapZoom = 15;
  ctx.get = (k: OwnerRead) => obj(ctx.data[k]);
  ctx.has = (k: OwnerRead) => Object.keys(ctx.get(k)).length > 0;
  ctx.list = (k: OwnerRead) => rows(ctx.data[k]);
  ctx.active = () => ctx.alive && !ctx.scope.signal.aborted;
  ctx.readMatch = (v: unknown, key: string, target: unknown) =>
    obj(v)[key] === undefined ? null : String(obj(v)[key]) === String(target);
  ctx.host.addEventListener('fence-point', ((event: CustomEvent<any>) => {
    if (!ctx.center) return;
    const { x, y, width, height } = event.detail;
    const scale = 256 * 2 ** ctx.mapZoom,
      cx = ((ctx.center.longitude + 180) / 360) * scale;
    const cy =
      ((1 - Math.log(Math.tan(Math.PI / 4 + (ctx.center.latitude * Math.PI) / 360)) / Math.PI) /
        2) *
      scale;
    const wx = cx - 320 + (x / width) * 640,
      wy = cy - 180 + (y / height) * 360;
    ctx.mapSelected = true;
    ctx.center = {
      longitude: (wx / scale) * 360 - 180,
      latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / scale))) * 180) / Math.PI,
    };
    ctx.render();
  }) as EventListener);
  ctx.host.addEventListener('owner-month', ctx.monthChanged);
  ctx.host.addEventListener('click', ctx.click);
  ctx.host.addEventListener('click', ctx.change);
  if (ctx.o.native.available && !ctx.o.demo)
    void ctx.o.native
      .call<OwnerRow>('status', {}, ctx.scope.signal)
      .then((v) => {
        if (ctx.active()) {
          ctx.ownIdentity = txt(v.uniqueIdentify);
          ctx.identityReady = true;
          ctx.render();
        }
      })
      .catch(() => {});
  void ctx.initial();
  return () => {
    ctx.alive = false;
    ctx.scope.abort();
    ctx.data = {};
    ctx.host.removeEventListener('owner-month', ctx.monthChanged);
    ctx.host.removeEventListener('click', ctx.click);
    ctx.host.removeEventListener('click', ctx.change);
  };
}
