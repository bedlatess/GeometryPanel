<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useWorkflowPage } from '../../app/workflow-page';
import { useSessionStore } from '../../stores/session';
import { useOwnerStore } from '../../stores/owner';
import PageFrame from '../../components/PageFrame.vue';
import OwnerEditor from './OwnerEditor.vue';
import OwnerLists from './OwnerLists.vue';
import OwnerInfo from './OwnerInfo.vue';
import LowPhoneSetting from './LowPhoneSetting.vue';
const route = useRoute(),
  path = route.path;
const session = useSessionStore();
const { host, view } = useWorkflowPage('owner', {
  path: path === '/vehicle/status/firmware' ? '/vehicle/firmware' : path,
});
const editor = computed(() => view.value.editor);
onMounted(() => {
  if (path.endsWith('/low-phone')) void useOwnerStore().load(['settings']);
});
</script>
<template>
  <PageFrame :title="String(route.meta.title)">
    <div ref="host" class="workflow">
      <p v-if="view.note" class="foot" role="status">{{ view.note }}</p>
      <button v-if="view.failed" class="workflow-row" data-owner="retry">加载失败　重试</button>
      <p v-if="session.state.preview" class="foot">演示中不可用</p>
      <OwnerEditor v-if="editor" :view="view" :host="host" />
      <LowPhoneSetting v-else-if="path.endsWith('/low-phone')" />
      <OwnerLists
        v-else-if="/keys|fences|charge-plan|sharing/.test(path)"
        :view="view"
        :path="path"
      />
      <OwnerInfo v-else :view="view" :path="path" />
    </div>
  </PageFrame>
</template>

<style scoped src="../../theme/workflows.css"></style>
