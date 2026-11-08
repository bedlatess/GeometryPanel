<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useOwnerStore, rows, txt } from '../../stores/owner';
import { chinaDay } from '../../core/extensions-model';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
const owner = useOwnerStore(),
  month = ref(chinaDay().slice(0, 7));
function load() {
  return owner.load(['battery', 'charges', 'uses'], { month: month.value });
}
function step(value: number) {
  const date = new Date(`${month.value}-01T12:00:00`);
  date.setMonth(date.getMonth() + value);
  month.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  void load();
}
onMounted(load);
</script>
<template>
  <div class="month">
    <button aria-label="上个月" @click="step(-1)">
      <AppIcon name="chev-l" /></button
    ><span>{{ month.replace('-', ' 年 ') }} 月</span>
    <button aria-label="下个月" @click="step(1)"><AppIcon name="chev-r" /></button>
  </div>
  <GroupList title="电池">
    <ListRow
      label="电压"
      :value="
        txt(owner.get('battery').bmsVoltage) ? `${txt(owner.get('battery').bmsVoltage)} V` : '—'
      "
    />
    <ListRow
      label="电流"
      :value="
        txt(owner.get('battery').bmsCurrent) ? `${txt(owner.get('battery').bmsCurrent)} A` : '—'
      "
    />
  </GroupList>
  <GroupList title="充电">
    <ListRow
      label="本月充电"
      :value="
        owner.get('charges').powerChargeMonth == null
          ? '—'
          : `${txt(owner.get('charges').powerChargeMonth)} A·h`
      "
    />
    <ListRow
      v-for="(item, index) in rows(owner.get('charges').chargeList)"
      :key="index"
      :label="txt(item.powerChargeDate)"
      :value="item.powerChargeValue == null ? '—' : `${txt(item.powerChargeValue)} A·h`"
    />
  </GroupList>
  <GroupList title="放电">
    <ListRow
      label="本月放电"
      :value="
        owner.get('uses').powerUseMonth == null
          ? '—'
          : `${txt(owner.get('uses').powerUseMonth)} A·h`
      "
    />
    <ListRow
      v-for="(item, index) in rows(owner.get('uses').useList)"
      :key="index"
      :label="txt(item.powerUseDate)"
      :value="item.powerUseValue == null ? '—' : `${txt(item.powerUseValue)} A·h`"
    />
  </GroupList>
</template>
<style scoped src="./OfficialBatteryRecords.css"></style>
