import type { Context } from './context';
export function register(ctx: Context) {
  ctx.times = function (
    title: string,
    start: string,
    end: string,
    done: (start: string, end: string) => void,
  ) {
    ctx.a.sheet(
      title,
      {
        kind: 'times',
        label: '继续',
        fields: [
          { name: 'start', label: '开始时间', value: start },
          { name: 'end', label: '结束时间', value: end },
        ],
      },
      (button) => {
        const host = button.closest('#runtime-modal')!;
        const x = host.querySelector<HTMLInputElement>('[name=start]')!.value;
        const y = host.querySelector<HTMLInputElement>('[name=end]')!.value;
        ctx.a.closeSheet();
        done(x, y);
      },
    );
  };
}
