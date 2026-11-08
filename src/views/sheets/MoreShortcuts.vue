<script setup lang="ts">
import { computed } from 'vue';
import { shortcutMap } from '../../app/shortcuts';
import { useSessionStore } from '../../stores/session';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const session = useSessionStore();
const shortcuts = computed(() =>
  [...new Set(session.state.preferences.shortcut.slice(1))]
    .filter((name) => name !== 'more' && name !== 'storage')
    .map((name) => shortcutMap[name])
    .filter(Boolean),
);
</script>
<template>
  <GroupList v-if="shortcuts.length">
    <ListRow
      v-for="[icon, label, action, value] in shortcuts"
      :key="label"
      :icon="icon"
      :label="label"
      action
      @activate="session.action(action, value)"
    />
  </GroupList>
</template>
