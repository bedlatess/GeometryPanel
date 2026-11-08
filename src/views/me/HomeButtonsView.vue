<script setup lang="ts">
import { useHomeButtons } from '../../stores/home-buttons';
import { useSessionStore } from '../../stores/session';
import { shortcutMap } from '../../app/shortcuts';
import { choose, workflowActions } from '../../stores/workflow-actions';
import PageFrame from '../../components/PageFrame.vue';
import QuickAction from '../../components/QuickAction.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const home = useHomeButtons(),
  session = useSessionStore();
function pick(index: number) {
  choose(
    workflowActions(),
    `第 ${index + 1} 个按钮`,
    home.choices.map((id) => [id, shortcutMap[id][1]]),
    home.buttons[index],
    (value) => home.set(index, value),
  );
}
</script>
<template>
  <PageFrame title="首页按钮"
    ><div class="preview">
      <QuickAction
        v-for="(id, index) in [...home.buttons, 'more']"
        :key="index"
        :icon="shortcutMap[id][0]"
        :label="shortcutMap[id][1]"
        @activate="index < 3 && pick(index)"
      />
    </div>
    <GroupList title="首页按钮"
      ><ListRow
        v-for="(id, index) in home.buttons"
        :key="index"
        :label="`第 ${index + 1} 个按钮`"
        :value="shortcutMap[id][1]"
        action
        @activate="pick(index)" />
      <ListRow label="第 4 个按钮" value="更多"
    /></GroupList>
    <GroupList
      ><ListRow
        label="首页显示续航"
        toggle
        :checked="session.state.preferences.range"
        @change="session.action('range')" />
      <ListRow
        label="首页显示电压"
        toggle
        :checked="session.state.preferences.voltage"
        @change="session.action('voltage')" />
      <ListRow
        label="回到前台自动刷新"
        toggle
        :checked="session.state.preferences.foregroundRefresh"
        @change="session.action('foreground-refresh')" />
      <ListRow
        label="打开后的首页"
        action
        :value="
          { vehicle: '车辆', records: '记录', tools: '工具', me: '我的' }[
            session.state.preferences.startPage
          ]
        "
        @activate="session.action('pick-start')"
    /></GroupList>
  </PageFrame>
</template>
<style scoped>
.preview {
  display: flex;
  justify-content: space-around;
  padding: 24px 0;
}
</style>

<style scoped src="../../theme/workflows.css"></style>
