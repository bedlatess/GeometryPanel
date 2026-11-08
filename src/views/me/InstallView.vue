<script setup lang="ts">
import { useSessionStore } from '../../stores/session';
import { currentInstallContext } from '../../core/pwa';
import { version } from '../../../package.json';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
const session = useSessionStore(),
  installed = currentInstallContext() === 'installed';
</script>
<template>
  <PageFrame title="添加到主屏幕">
    <GroupList
      ><ListRow label="当前版本" :value="version" />
      <ListRow label="运行方式" :value="installed ? '已添加到主屏幕' : '在浏览器中使用'" />
      <ListRow label="下载 App" action @activate="session.action('download-app')" />
      <ListRow
        label="检查更新"
        :value="session.state.checkingUpdate ? '正在加载' : ''"
        action
        @activate="session.action('check-update')" />
      <ListRow label="离线数据" action @activate="session.action('cache-status')" />
      <ListRow label="清理离线数据" action @activate="session.action('cache-clear')"
    /></GroupList>
    <GroupList title="添加到主屏幕"
      ><ListRow label="打开分享菜单" icon="share" />
      <ListRow label="添加到主屏幕" icon="plus" /><ListRow label="添加"
    /></GroupList>
  </PageFrame>
</template>
