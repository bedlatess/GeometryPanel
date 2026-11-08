<script setup lang="ts">
import { computed } from 'vue';
import { useVehiclePresentation, calendarDay } from '../../stores/presentation';
import { useOwnerStore, txt, rows } from '../../stores/owner';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const vehicle = useVehiclePresentation(),
  owner = useOwnerStore();
const firmware = (key: string) =>
  txt(rows(owner.get('home').iotProperties).find((row) => row.identify === key)?.value) || '—';
const mac = computed(() => {
  const input = txt(owner.get('home').bluetoothAddress).replace(/[^a-f0-9]/gi, '');
  return input.length === 12 ? `尾号 ${input.slice(-4, -2)}:${input.slice(-2)}`.toUpperCase() : '—';
});
</script>
<template>
  <GroupList>
    <ListRow label="车型" :value="vehicle.vehicle?.type || '—'" />
    <ListRow label="车牌" :value="vehicle.vehicle?.plate || '—'" />
    <ListRow label="车架号" :value="vehicle.vehicle?.vin.slice(-6) || '—'" />
    <ListRow
      label="固件版本"
      :value="
        Number(owner.data.redPoint) > 0
          ? '有新版本'
          : txt(owner.get('home').otaVersion) || firmware('VCU_Firmware')
      "
      to="/vehicle/status/firmware"
    />
    <ListRow label="ECU 版本" :value="firmware('ECU_Firmware')" />
    <ListRow label="仪表版本" :value="firmware('HMI_Firmware')" />
    <ListRow label="激活日期" :value="calendarDay(txt(owner.get('home').activationDate))" />
    <ListRow label="首次绑定" :value="calendarDay(txt(owner.get('home').firstBindDate))" />
    <ListRow label="蓝牙地址" :value="mac" />
    <ListRow
      label="流量卡"
      :value="
        owner.get('sim').lastUseDate == null ? '—' : `${owner.get('sim').lastUseDate} 天后到期`
      "
    />
  </GroupList>
</template>
