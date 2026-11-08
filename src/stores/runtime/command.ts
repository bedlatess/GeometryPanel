import { commandSheet, ConfirmSheet, hornSheet } from '../../app/sheet-model';
type LeverPhase = 'idle' | 'sending' | 'pending' | 'success' | 'error';

import { OwnerApi } from '../../api/owner';
import { changeOnce } from '../../core/owner-model';

import { type VehicleAction } from '../../api/controls';
import { accountSession } from '../../core/accounts';
import { demoVehicle } from '../../core/model';

import {
  commandNames,
  type CommandMode,
  type CommandReport,
  type CommandStep,
} from '../../core/command-report';

import { type RuntimeContext } from './context';
export function registercommand(ctx: RuntimeContext) {
  ctx.openStorage = async function () {
    if (ctx.preview) {
      ctx.notice = '演示中不可用';
      ctx.render();
      return;
    }
    if (!ctx.session || ctx.expired || ctx.busy) return;
    const bound = ctx.session,
      owner = new OwnerApi();
    await ctx.run(
      async (signal, current) => {
        const home = (await owner.read(bound, 'home', {}, signal)) as Record<string, unknown>;
        if (!current()) return;
        if (home?.openStorageBoxFlag !== true) {
          ctx.notice = '此车型不支持';
          return;
        }
        ctx.actions.sheet(
          '打开储物箱',
          ConfirmSheet(
            '确认打开',
            bound.vehicle.name,
            bound.vehicle.vin.slice(-6),
            'data-storage-confirm',
            '从 当前状态 改为 打开',
          ),
          (button) => {
            if (!button.hasAttribute('data-storage-confirm') || ctx.session !== bound || ctx.busy)
              return;
            ctx.actions.closeSheet();
            void ctx.run(
              async (controlSignal, isCurrent) => {
                const result = await changeOnce(
                  () => owner.storage(bound, controlSignal),
                  () => owner.read(bound, 'home', {}, controlSignal),
                  () => null,
                  controlSignal,
                );
                if (isCurrent()) ctx.notice = result;
              },
              { bound, control: true },
            );
          },
        );
      },
      { bound },
    );
  };
  ctx.beginCommand = function (mode: CommandMode) {
    const bound = ctx.commandTarget;
    if (
      !bound ||
      ctx.session !== bound ||
      ctx.busy ||
      ctx.expired ||
      ctx.preview ||
      !navigator.onLine
    )
      return;
    if (ctx.isHorn(mode) ? ctx.commandIntent !== 'horn' : ctx.commandIntent !== mode) return;
    const capability = ctx.reading?.daily.capabilities;
    if (
      ((mode === 'powerOn' || mode === 'powerOff') && capability?.networkUnlock === false) ||
      (mode === 'seat' && capability?.seatOpen === false)
    )
      return;
    const report: CommandReport = { mode, startedAt: Date.now(), steps: [] };
    ctx.lastCommandReport = report;
    if (mode === 'powerOn' || mode === 'powerOff') {
      clearTimeout(ctx.leverTimer);
      ctx.leverTarget = mode;
      ctx.leverStarted = Date.now();
      ctx.leverPhase = 'sending';
    }
    void ctx.run(
      async (signal, current) => {
        const progress = (step: CommandStep) => {
          const index = report.steps.findIndex((value) => value.stage === step.stage);
          if (index < 0) report.steps.push(step);
          else report.steps[index] = step;
          if (current()) {
            const message = ctx.modal.querySelector('#modal-message');
            if (message) message.textContent = '正在发送';
          }
        };
        if (mode === 'normal' || mode === 'high')
          await ctx.api.horn(bound, signal, { mode, onProgress: progress });
        else await ctx.controls.execute(bound, mode, signal, progress);
        if (current()) {
          ctx.notice = ctx.isHorn(mode) ? '已发送鸣笛寻车' : '等待车辆响应';
          if (mode === 'powerOn' || mode === 'powerOff') {
            ctx.leverPhase = 'pending';
            ctx.leverTimer = setTimeout(() => {
              ctx.leverPhase = 'error';
              ctx.notice = '未收到车辆响应';
              ctx.render();
            }, 15000);
          }
          ctx.commandTarget = null;
          ctx.commandIntent = null;
          ctx.modal.close();
        }
      },
      { bound, control: true },
    );
  };
  ctx.presentControl = function (mode: VehicleAction, drag = false) {
    if (ctx.busy || ctx.expired || !navigator.onLine || (!ctx.session && !ctx.preview)) return;
    const label = mode === 'powerOn' ? '上电开锁' : mode === 'powerOff' ? '关机锁车' : '打开座桶';
    if (ctx.preview) {
      ctx.leverTarget = mode === 'powerOff' ? 'powerOff' : 'powerOn';
      ctx.show(label, { ...commandSheet(demoVehicle, label, mode), action: 'demo-control' });
      return;
    }
    const bound = ctx.session!;
    ctx.show(label, commandSheet(bound.vehicle, label, mode));
    ctx.commandTarget = bound;
    ctx.commandIntent = mode;
    if (drag) ctx.beginCommand(mode);
  };
  ctx.presentNativeShortcut = function () {
    const target = ctx.pendingNativeShortcut;
    if (!target) return;
    const candidate = accountSession(ctx.accountBook, target.vehicleId);
    if (!candidate) {
      ctx.pendingNativeShortcut = null;
      ctx.notice = '车辆不可用';
      ctx.render();
      return;
    }
    const name = {
      refresh: '刷新车况',
      unlock: '上电开锁',
      lock: '关机锁车',
      horn: '鸣笛寻车',
      seat: '打开座桶',
    }[target.action];
    ctx.show(
      '系统快捷指令',
      ConfirmSheet(
        '继续',
        candidate.vehicle.name,
        candidate.vehicle.vin.slice(-6),
        'data-action="native-shortcut-continue"',
        name,
      ),
    );
  };
  ctx.continueNativeShortcut = async function () {
    const target = ctx.pendingNativeShortcut;
    ctx.pendingNativeShortcut = null;
    if (!target || ctx.busy || !navigator.onLine) return;
    try {
      await ctx.activateSavedVehicle(target.vehicleId);
    } catch {
      ctx.notice = '保存失败，请重试';
      ctx.render();
      return;
    }
    if (
      ctx.busy ||
      ctx.expired ||
      !ctx.session ||
      ctx.accountBook.selectedVehicleId !== target.vehicleId
    )
      return;
    if (target.action === 'refresh') return;
    const mode =
      target.action === 'unlock'
        ? 'powerOn'
        : target.action === 'lock'
          ? 'powerOff'
          : target.action;
    if (mode === 'horn') {
      ctx.show('寻车', hornSheet(ctx.session.vehicle));
      ctx.commandTarget = ctx.session;
      ctx.commandIntent = 'horn';
    } else {
      ctx.show(
        commandNames[mode],
        ConfirmSheet(
          commandNames[mode],
          ctx.session.vehicle.name,
          ctx.session.vehicle.vin.slice(-6),
          `data-action="send-control" data-value="${mode}"`,
        ),
      );
      ctx.commandTarget = ctx.session;
      ctx.commandIntent = mode;
    }
  };
}
