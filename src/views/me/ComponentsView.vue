<script setup lang="ts">
import { ref } from 'vue';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import StatusCard from '../../components/StatusCard.vue';
import EmptyState from '../../components/EmptyState.vue';
import QuickAction from '../../components/QuickAction.vue';
import MetricValue from '../../components/MetricValue.vue';
import SegmentControl from '../../components/SegmentControl.vue';
import Sheet from '../../components/Sheet.vue';
const segment = ref('state'),
  checked = ref(false),
  open = ref(false);
</script>
<template>
  <PageFrame title="组件一览">
    <SegmentControl
      v-model="segment"
      :options="[
        ['state', '状态'],
        ['battery', '电池'],
        ['device', '设备'],
      ]"
    />
    <StatusCard
      title="车况良好"
      subtitle="各项状态正常"
      icon="check"
      :metrics="[
        { label: '电量', value: 82, unit: '%' },
        { label: '续航', value: 91, unit: 'km' },
      ]"
    />
    <GroupList title="列表"
      ><ListRow label="跳转" to="/me/lab" /><ListRow label="只读" value="—" />
      <ListRow label="开关" toggle :checked="checked" @change="checked = $event" />
      <ListRow label="打开弹层" action @activate="open = true"
    /></GroupList>
    <MetricValue :value="82" unit="%" /><QuickAction
      icon="horn"
      label="寻车"
      @activate="open = true"
    />
    <EmptyState text="没有新消息" icon="bell" />
    <Sheet :open="open" title="组件一览" @close="open = false">
      <button class="workflow-primary" @click="open = false">确定</button></Sheet
    >
  </PageFrame>
</template>

<style scoped src="../../theme/workflows.css"></style>
