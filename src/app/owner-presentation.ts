import { computed } from 'vue';
import { useVehiclePresentation } from '../stores/presentation';
import { useOwnerStore, num, rows, txt } from '../stores/owner';

// Display aggregation moved from src/ui/owner.ts; thresholds and order are unchanged.
export function useOwnerPresentation() {
  const owner = useOwnerStore(),
    vehicle = useVehiclePresentation();
  const examination = computed(() => {
    const result = owner.get('examination'),
      count = num(result.heteroconstant);
    if (count !== null) return count;
    const systems = rows(result.systemList);
    const abnormal = systems
      .flatMap((row) => [row, ...rows(row.list)])
      .filter((row) => num(row.abnormalState) !== null && num(row.abnormalState) !== 0);
    return systems.length && systems.every((row) => num(row.abnormalState) !== null)
      ? abnormal.length
      : null;
  });
  const reminders = computed(() => {
    const result: string[] = [],
      data = vehicle.reading;
    if (data?.soc != null && data.soc <= 20) result.push('电量低');
    if (
      data?.daily.vehicleLocked === true &&
      data.daily.seatLocked === false &&
      data.daily.reportState === 'fresh'
    )
      result.push('座桶未锁');
    const wheels = rows(owner.get('tires').realTimeData);
    if (wheels.some((row) => num(row.tirePressure) !== null && Number(row.tirePressure) < 1))
      result.push('胎压过低');
    const expiry = txt(
      owner.get('expiry').rechargeEndDate ??
        owner.get('recharge').rechargeEndDate ??
        owner.get('home').rechargeEndDate,
    );
    const end = Date.parse(expiry);
    if (Number.isFinite(end)) {
      const days = Math.ceil((end - Date.now()) / 86400000);
      if (days <= 30) result.push(days <= 0 ? '智能服务已到期' : `智能服务 ${days} 天后到期`);
    }
    const simDays = num(owner.get('sim').lastUseDate);
    if (simDays !== null && simDays <= 30)
      result.push(simDays <= 0 ? '流量卡已到期' : `流量卡 ${simDays} 天后到期`);
    if (examination.value !== null && examination.value > 0)
      result.push(`${examination.value} 项异常`);
    const km = num(owner.get('maintenance').keepMileage);
    if (km !== null && km <= 200) result.push(`距下次保养 ${km} km`);
    return result;
  });
  return { examination, reminders };
}
