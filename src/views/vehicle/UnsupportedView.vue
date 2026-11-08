<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useExtensionsStore } from '../../stores/extensions';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import EmptyState from '../../components/EmptyState.vue';
const ext = useExtensionsStore();
const items = computed(
  () =>
    ext.settings?.filter(
      (item) => (!item.writable && item.reason === '当前车型不支持') || item.display === '不支持',
    ) || [],
);
onMounted(() => ext.load('settings'));
</script>
<template>
  <PageFrame title="此车型不支持的功能"
    ><GroupList v-if="items.length">
      <ListRow
        v-for="item in items"
        :key="item.key"
        :label="item.title"
        value="此车型不支持"
      /> </GroupList
    ><EmptyState v-else-if="!ext.busy" text="此车型不支持" icon="info"
  /></PageFrame>
</template>
