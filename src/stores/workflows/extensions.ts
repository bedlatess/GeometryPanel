import { ExtensionsApi } from '../../api/extensions';
import { NativeMaterialsApi } from '../../api/native-materials';
import { chinaDay } from '../../core/extensions-model';
import type { Session } from '../../core/model';
import { type PageActions } from '../workflow-actions';
import { register as clicked } from './extensions/clicked';
import { register as confirmSetting } from './extensions/confirmSetting';
import type { Context } from './extensions/context';
import { register as expire } from './extensions/expire';
import { register as load } from './extensions/load';
import { register as render } from './extensions/render';
import { Tab } from './extensions/shared';
import { register as simulated } from './extensions/simulated';
import { register as submitted } from './extensions/submitted';
import { register as updateMessages } from './extensions/updateMessages';
import { register as write } from './extensions/write';
export function mountExtensions(
  host: HTMLElement,
  options: {
    session: Session | null;
    demo: boolean;
    onExpired: () => void;
    onUncertain?: () => void;
    initial?: Tab;
    day?: string;
    view?: string;
    actions: PageActions;
    publish(value: any): void;
  },
) {
  const ctx = { host, options } as Context;
  expire(ctx);
  render(ctx);
  confirmSetting(ctx);
  simulated(ctx);
  load(ctx);
  updateMessages(ctx);
  write(ctx);
  clicked(ctx);
  submitted(ctx);
  ctx.session = ctx.options.session
    ? { ...ctx.options.session, vehicle: { ...ctx.options.session.vehicle } }
    : null;
  ctx.api = new ExtensionsApi();
  ctx.materials = new NativeMaterialsApi();
  ctx.alive = true;
  ctx.expired = false;
  ctx.writing = false;
  ctx.tab = ctx.options.initial ?? 'ride';
  ctx.busy = false;
  ctx.error = '';
  ctx.note = '';
  ctx.month = chinaDay().slice(0, 7);
  ctx.day = ctx.options.day ?? chinaDay();
  ctx.trackPage = 1;
  ctx.alertPage = 1;
  ctx.generation = 0;
  ctx.request = null;
  ctx.monthly = null;
  ctx.tracks = null;
  ctx.tires = null;
  ctx.alerts = null;
  ctx.settings = null;
  ctx.confirmation = null;
  ctx.messageConfirmation = null;
  ctx.roadMaps = new Set<number>();
  ctx.disabled = () => (ctx.busy || ctx.expired ? 'disabled' : '');
  ctx.messageTab = 'vehicle';
  ctx.settingName = (key: string, title: string) =>
    key === 'cloudInductiveEnabled'
      ? '车辆感应钥匙'
      : title
          .replace('eTCS 牵引力控制', '牵引力控制')
          .replace('自定义按键 · 单击', '按键单击')
          .replace('电子座垫感应 2.0', '座垫感应 2.0');
  ctx.settingsAt = null;
  ctx.host.addEventListener('click', ctx.clicked);
  ctx.host.addEventListener('submit', ctx.submitted);
  ctx.render();
  void ctx.load();
  return () => {
    const uncertain = ctx.alive && ctx.writing;
    ctx.alive = false;
    ctx.writing = false;
    ctx.generation++;
    ctx.request?.abort();
    ctx.host.removeEventListener('click', ctx.clicked);
    ctx.host.removeEventListener('submit', ctx.submitted);
    // The Vue page owns these nodes; clearing them would blank a re-entered cached page.
    if (uncertain) ctx.options.onUncertain?.();
  };
}
