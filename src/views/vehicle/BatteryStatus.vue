<script setup lang="ts">
import { computed } from 'vue';
import { useVehiclePresentation, format } from '../../stores/presentation';
import { useOwnerStore, txt } from '../../stores/owner';
import StatusCard from '../../components/StatusCard.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const vehicle = useVehiclePresentation(),
  owner = useOwnerStore();
const metrics = computed(() => [
  { label: '电量', value: vehicle.reading?.soc, unit: '%' },
  { label: '健康度', value: vehicle.daily?.healthPercent, unit: '%' },
  { label: '温度', value: vehicle.daily?.temperatureC, unit: '°C' },
]);
const expiry = computed(() =>
  txt(
    owner.get('expiry').rechargeEndDate ??
      owner.get('recharge').rechargeEndDate ??
      owner.get('home').rechargeEndDate,
  ).replace(/^(\d{4})-(\d{2})-(\d{2}).*/, (_, y, m, d) => `${y} 年 ${+m} 月 ${+d} 日到期`),
);
</script>
<template>
  <StatusCard :title="vehicle.charging ? '正在充电' : '电池'" icon="batt" :metrics="metrics" />
  <GroupList>
    <ListRow label="电压" :value="format(vehicle.reading?.voltage, 'V')" numeric />
    <ListRow label="电流" :value="format(vehicle.daily?.currentA, 'A')" numeric />
    <ListRow label="功率" :value="format(vehicle.daily?.powerW, 'W')" numeric />
    <ListRow label="累计充电" :value="format(vehicle.daily?.chargeCount, '次')" numeric />
    <ListRow label="充电已用时长" :value="vehicle.daily?.chargeElapsedText || '—'" />
    <ListRow label="预计充满" :value="vehicle.daily?.expectedFullText || '—'" />
  </GroupList>
  <GroupList
    ><ListRow
      label="本月电池评分"
      :value="txt(owner.get('score').score) || '—'"
      numeric
      to="/records/battery/score"
    /><ListRow label="智能服务" :value="expiry || '—'" />
  </GroupList>
</template>
