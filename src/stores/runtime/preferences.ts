type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { decryptAccounts, encryptAccounts } from '../../core/account-backup';

import { accountSession } from '../../core/accounts';
import { revokeNativeAccounts } from '../../core/background';
import { updateAccounts } from '../../core/vault';

import { storagePrefix } from '../../core/scope';

import { exportPreferences } from '../../app/home-layout';
import { writePreferences } from '../../core/preferences';

import { UserMessage, type RuntimeContext } from './context';
export function registerpreferences(ctx: RuntimeContext) {
  ctx.applyPreferences = function (save = true) {
    document.documentElement.dataset.theme = ctx.preferences.theme;
    const dark =
      ctx.preferences.theme === 'dark' ||
      (ctx.preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      );
    if (save && !ctx.preview && !writePreferences(ctx.preferences, `${storagePrefix}preferences`))
      ctx.notice = '保存失败，请重试';
  };
  ctx.showAccountBackup = function (exporting: boolean) {
    if (ctx.preview) return;
    ctx.actions.sheet(
      exporting ? '备份账号' : '恢复账号',
      { kind: 'accountBackup', exporting },
      (button) => {
        if (!button.hasAttribute('data-account-backup-confirm')) return;
        const dialog = button.closest('#runtime-modal')!,
          input = dialog.querySelector<HTMLInputElement>('[data-account-password]')!,
          password = input.value,
          file = dialog.querySelector<HTMLInputElement>('[data-account-file]')?.files?.[0];
        if (password.length < 8) {
          ctx.actions.toast('密码至少 8 位');
          return;
        }
        if (!exporting && !file) {
          ctx.actions.toast('请选择备份文件');
          return;
        }
        input.value = '';
        button.setAttribute('disabled', '');
        void ctx.run(async (_signal, current) => {
          try {
            if (exporting) {
              const encrypted = await encryptAccounts(ctx.accountBook, password);
              if (!current()) return;
              const a = document.createElement('a'),
                url = URL.createObjectURL(
                  new Blob([encrypted], { type: 'application/octet-stream' }),
                );
              a.href = url;
              a.download = 'GeometryPanel.gpbackup';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } else {
              const restored = await decryptAccounts(await file!.text(), password);
              if (!current()) return;
              await revokeNativeAccounts(ctx.native);
              ctx.accountBook = await updateAccounts(() => restored);
              ctx.session = accountSession(ctx.accountBook);
              ctx.reading = null;
              ctx.expired = false;
              await ctx.synchronizeAccounts();
              ctx.pageKey = '';
            }
            ctx.notice = exporting ? '已导出' : '已恢复';
            ctx.close();
          } catch {
            throw new UserMessage(exporting ? '保存失败，请重试' : '文件或密码不正确');
          }
        });
      },
    );
  };
  ctx.downloadText = function (text: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  ctx.copyPreferences = function () {
    const value = exportPreferences(ctx.preferences, ctx.preview);
    void (navigator.clipboard?.writeText(value) ?? Promise.reject())
      .then(() => {
        ctx.notice = '已复制';
        ctx.render();
      })
      .catch(() => {
        ctx.show('复制设置', { kind: 'copyPreferences', value });
        ctx.content.querySelector<HTMLTextAreaElement>('#preferences-backup')?.select();
        ctx.notice = '复制配置';
        ctx.render();
      });
  };
}
