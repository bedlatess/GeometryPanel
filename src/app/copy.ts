/** Presentation copy only; transport and control results stay unchanged. */
export function displayCopy(value: string) {
  return (
    {
      已发送鸣笛寻车: '已发出鸣笛寻车',
      未收到车辆响应: '没收到车辆响应，先看一眼车',
      '保存失败，请重试': '没保存上，再试一次',
      '已发送，车辆尚未确认': '已发出，车辆尚未确认',
    }[value] || value
  );
}
