<script setup lang="ts">
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import { useSessionStore } from '../../stores/session';
const session = useSessionStore();
</script>
<template>
  <PageFrame title="开发者选项"
    ><GroupList>
      <ListRow label="状态模拟器" to="/me/lab" /><ListRow label="组件一览" to="/me/components" />
      <ListRow label="功能对照" action @activate="session.action('parity-export')" /> </GroupList
  ></PageFrame>
</template>
