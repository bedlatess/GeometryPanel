import type { Context } from './context';
export function register(ctx: Context) {
  ctx.click = async function (event: Event) {
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
    if (
      cmd === 'retry' ||
      cmd === 'editor-cancel' ||
      cmd === 'reset-maintenance' ||
      cmd === 'ota-detail' ||
      cmd === 'auto-head' ||
      cmd === 'fcw' ||
      cmd === 'password' ||
      cmd === 'remove-phone' ||
      cmd === 'remove-card' ||
      cmd === 'rename-card' ||
      cmd === 'low-toggle' ||
      cmd === 'low-period'
    )
      return ctx.ownerKeys(event);
    if (
      cmd === 'fence-new' ||
      cmd === 'fence-edit' ||
      cmd === 'fence-map' ||
      cmd === 'map-in' ||
      cmd === 'map-out' ||
      cmd === 'fence-radius' ||
      (cmd === 'fence-save' && ctx.editor?.type === 'fence') ||
      cmd === 'fence-use' ||
      cmd === 'fence-delete'
    )
      return ctx.ownerFences(event);
    if (
      cmd === 'plan-new' ||
      cmd === 'plan-edit' ||
      (cmd === 'plan-time' && ctx.editor) ||
      (cmd === 'plan-save' && ctx.editor?.type === 'plan') ||
      cmd === 'plan-use' ||
      cmd === 'plan-retry'
    )
      return ctx.ownerPlans(event);
    if (
      cmd === 'share-new' ||
      (cmd === 'share-hours' && ctx.editor) ||
      (cmd === 'share-save' && ctx.editor?.type === 'share') ||
      cmd === 'share-revoke'
    )
      return ctx.ownerSharing(event);
  };
}
