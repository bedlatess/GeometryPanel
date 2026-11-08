<script setup lang="ts">
import { useSessionStore } from '../../stores/session';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const session = useSessionStore();
</script>
<template>
  <PageFrame title="备份与恢复">
    <GroupList>
      <ListRow label="导出设置" action @activate="session.action('export-preferences')" />
      <ListRow label="复制设置" action @activate="session.action('copy-preferences')" />
      <ListRow label="导入设置" action @activate="session.action('import-preferences')" />
      <ListRow
        label="备份账号"
        action
        :disabled="session.state.preview"
        @activate="session.action('account-backup-export')"
      />
      <ListRow
        label="恢复账号"
        action
        :disabled="session.state.preview"
        @activate="session.action('account-backup-import')"
      />
    </GroupList>
    <GroupList
      ><ListRow label="恢复默认设置" danger action @activate="session.action('reset-preferences')"
    /></GroupList>
  </PageFrame>
</template>
