<script setup lang="ts">
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import LineChart from '../../components/LineChart.vue';
import EmptyState from '../../components/EmptyState.vue';
import { format } from '../../stores/presentation';
defineProps<{ view: any; disabled?: boolean }>();
const time = (value: number) => (!value ? '—' : new Date(value).toLocaleString('zh-CN'));
</script>
<template>
  <GroupList>
    <button
      v-for="[key, label] in [
        ['battery', '电量'],
        ['charge', '充电记录'],
        ['events', '提醒记录'],
      ]"
      :key="key"
      class="workflow-row"
      :data-history-kind="key"
      :disabled="disabled"
    >
      {{ label }}
    </button>
  </GroupList>
  <GroupList title="时段">
    <button
      v-for="[key, label] in [
        ['24h', '24 小时'],
        ['7d', '7 天'],
        ['30d', '30 天'],
        ['90d', '90 天'],
        ['all', '全部'],
      ]"
      :key="key"
      class="workflow-row"
      :data-history-period="key"
      :disabled="disabled"
    >
      {{ label }}
    </button>
    <button class="workflow-row" data-background="custom-range" :disabled="disabled">
      自选时段
    </button>
  </GroupList>
  <LineChart
    v-if="view.kind === 'battery'"
    label="电量历史"
    energy
    :points="
      (view.items || []).filter((v: any) => v.soc != null).map((v: any) => ({ t: v.at, v: v.soc }))
    "
  />
  <GroupList v-if="view.items?.length" title="记录">
    <ListRow
      v-for="(item, index) in view.items"
      :key="index"
      :label="
        view.kind === 'charge'
          ? `${item.startSoc ?? '—'}% → ${item.endSoc ?? '—'}%`
          : view.kind === 'events'
            ? item.title || item.message || '提醒'
            : time(item.at)
      "
      :detail="
        view.kind === 'battery' ? undefined : time(item.startedAt || item.at || item.detectedAt)
      "
      :value="view.kind === 'battery' ? format(item.soc, '%') : undefined"
    />
  </GroupList>
  <EmptyState v-else text="还没有充电记录" icon="batt" />
  <button
    v-if="view.items?.length < view.total"
    class="workflow-secondary"
    data-background="history-more"
    :disabled="disabled"
  >
    加载更多
  </button>
  <GroupList
    ><button class="workflow-row" data-background="history-export" :disabled="disabled">
      导出表格</button
    ><button class="workflow-row" data-background="history-info">电池与充电</button>
  </GroupList>
  <GroupList
    ><button class="workflow-row danger" data-background="history-clear" :disabled="disabled">
      清除本机记录
    </button></GroupList
  >
</template>
<style scoped src="../../theme/workflows.css"></style>
