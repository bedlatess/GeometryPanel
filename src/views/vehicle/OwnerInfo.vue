<script setup lang="ts">
import { calendarDay } from '../../stores/presentation';
import { computed } from 'vue';
import { rows, obj, txt, num } from '../../stores/owner';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import MetricValue from '../../components/MetricValue.vue';
const props = defineProps<{ view: any; path: string }>();
const get = (key: string) => obj(props.view.data?.[key]);
const list = (key: string) => rows(props.view.data?.[key]);
const health = computed(() =>
  rows(get('examination').systemList)
    .flatMap((row) => [row, ...rows(row.list)])
    .filter((row) => num(row.abnormalState) !== null && num(row.abnormalState) !== 0),
);
const deductions = computed(() =>
  rows(get('score').batteryDeductList).flatMap((row) => rows(row.batteryDetailList)),
);
</script>
<template>
  <template v-if="path.endsWith('/health') && Object.keys(get('examination')).length">
    <GroupList v-if="health.length" title="体检">
      <ListRow
        v-for="(row, index) in health"
        :key="index"
        :label="txt(row.inspectionName) || '异常'"
        :detail="txt(row.advise)"
      />
    </GroupList>
    <GroupList v-else
      ><ListRow label="体检" :value="num(get('examination').heteroconstant) === 0 ? '无异常' : '—'"
    /></GroupList>
  </template>
  <template v-if="path.endsWith('/firmware')">
    <GroupList v-if="list('otaTasks').length" title="可用版本">
      <button
        v-for="(row, index) in list('otaTasks')"
        :key="index"
        class="workflow-row"
        data-owner="ota-detail"
        :data-index="index"
        :disabled="view.busy"
      >
        {{ txt(row.partName) || '固件' }} {{ txt(row.otaVersion) || '—' }}
      </button>
    </GroupList>
    <GroupList v-if="Object.keys(get('otaDetail')).length" title="版本信息">
      <ListRow label="当前版本" :value="txt(get('otaDetail').nowVersion) || '—'" />
      <ListRow label="新版本" :value="txt(get('otaDetail').lastlyVersion) || '—'" />
      <ListRow label="更新日期" :value="calendarDay(txt(get('otaDetail').updateDate))" />
    </GroupList>
    <p v-if="get('otaDetail').versionDesc">{{ get('otaDetail').versionDesc }}</p>
    <GroupList v-if="list('otaRecords').length" title="升级记录">
      <ListRow
        v-for="(row, index) in list('otaRecords')"
        :key="index"
        :label="calendarDay(txt(row.updateDate))"
        :value="txt(row.otaVersion) || '—'"
      />
    </GroupList>
    <p class="owner-foot">升级请在极核 App 中进行</p>
  </template>
  <template v-if="path.endsWith('/score') && get('score').score !== undefined">
    <div class="score-hero">
      <MetricValue :value="num(get('score').score)" unit="分" />
      <p>本月电池评分</p>
    </div>
    <GroupList title="扣分项"
      ><ListRow
        v-for="(row, index) in deductions"
        :key="index"
        :label="txt(row.deductContent) || '扣分'"
        :value="txt(row.deductScore) || '—'"
    /></GroupList>
  </template>
</template>

<style scoped src="../../theme/workflows.css"></style>
<style scoped>
.score-hero {
  padding: 22px 20px 6px;
}
.score-hero :deep(.metric-value) {
  font-size: 56px;
  line-height: 1;
  font-weight: 600;
}
.score-hero :deep(small) {
  font-size: 20px;
}
.score-hero p,
.owner-foot {
  font-size: 15px;
  color: var(--t2);
  margin-top: 6px;
}
.owner-foot {
  text-align: center;
  font-size: 13px;
  margin-top: 22px;
}
</style>
