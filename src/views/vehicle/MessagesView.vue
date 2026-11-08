<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { IonItemSliding, IonItem, IonItemOptions, IonItemOption } from '@ionic/vue';
import { useWorkflowPage } from '../../app/workflow-page';
import { useSessionStore } from '../../stores/session';
import { useWorkflowStore } from '../../stores/workflows';
import PageFrame from '../../components/PageFrame.vue';
import SegmentControl from '../../components/SegmentControl.vue';
import GroupList from '../../components/GroupList.vue';
import EmptyState from '../../components/EmptyState.vue';
import ListMotion from '../../components/ListMotion.vue';
const route = useRoute(),
  id = route.params.id;
const session = useSessionStore();
const cached = useWorkflowStore().data.extensions?.alerts?.alerts.find(
  (item: any) => item.id === id,
);
const { host, view: v } = useWorkflowPage('extensions', {
  initial: 'alerts',
  view: id ? `message:${id}` : undefined,
});
const visible = computed(() =>
  (v.value.alerts?.alerts || []).filter((item: any) =>
    v.value.messageTab === 'vehicle' ? Boolean(item.vin) : !item.vin,
  ),
);
const selected = computed(
  () => v.value.alerts?.alerts.find((item: any) => item.id === id) || cached,
);
function click(action: string) {
  host.value?.querySelector<HTMLElement>(`[data-ext="${action}"]`)?.click();
}
function tab(value: string) {
  const button = document.createElement('button');
  button.dataset.messageTab = value;
  host.value?.append(button);
  button.click();
  button.remove();
}
</script>
<template>
  <PageFrame title="消息">
    <template #toolbar
      ><button v-if="!id" class="toolbar-text" :disabled="v.busy" @click="click('read-messages')">
        全部已读
      </button></template
    >
    <div ref="host" class="workflow">
      <button hidden data-ext="read-messages" /><button hidden data-ext="delete-messages" />
      <template v-if="id">
        <article v-if="selected" class="message-detail">
          <h2>{{ selected.title }}</h2>
          <time>{{ selected.time }}</time>
          <p>{{ selected.detail || selected.title }}</p>
        </article>
      </template>
      <template v-else>
        <SegmentControl
          :model-value="v.messageTab || 'vehicle'"
          :options="[
            ['vehicle', '车辆'],
            ['account', '账号'],
          ]"
          @update:model-value="tab"
        />
        <GroupList v-if="visible.length">
          <ListMotion>
            <IonItemSliding v-for="item in visible" :key="item.id">
              <IonItem
                lines="none"
                :button="true"
                :detail="true"
                @click="session.action('route', '/vehicle/messages/' + encodeURIComponent(item.id))"
              >
                <span class="unread" :class="{ active: item.unread }" />
                <div class="message-copy" :class="{ unreadTitle: item.unread }">
                  <span>{{ item.title }}</span
                  ><time>{{ item.time }}</time>
                </div>
              </IonItem>
              <IonItemOptions side="end"
                ><IonItemOption class="delete" @click="click('delete-messages')"
                  >删除全部</IonItemOption
                ></IonItemOptions
              >
            </IonItemSliding>
          </ListMotion>
        </GroupList>
        <button
          v-if="v.alerts?.receivedCount >= 20"
          class="workflow-secondary"
          data-ext="alerts-next"
          :disabled="v.busy"
        >
          加载更多
        </button>
        <EmptyState
          v-if="!v.busy && !visible.length"
          :text="v.error || '没有新消息'"
          icon="bell"
          :retry="Boolean(v.error)"
          @retry="click('refresh')"
        />
        <GroupList v-if="visible.length"
          ><button
            class="workflow-row danger"
            data-ext="delete-messages"
            :disabled="v.busy || session.state.preview"
          >
            删除全部
          </button>
        </GroupList>
      </template>
      <p v-if="v.note || v.error" role="status" class="foot">{{ v.note || v.error }}</p>
      <button hidden data-ext="refresh" />
    </div>
  </PageFrame>
</template>
<style scoped>
.toolbar-text {
  min-height: 44px;
  padding: 0 8px;
  background: transparent;
  font-size: 17px;
}
.segments {
  display: flex;
  background: var(--fill);
  padding: 2px;
  border-radius: 10px;
}
.segments button {
  flex: 1;
  min-height: 30px;
  background: transparent;
  border-radius: 8px;
}
.segments button[aria-pressed='true'] {
  background: var(--card);
  font-weight: 600;
}
ion-item {
  --min-height: 64px;
  --background: var(--card);
  --padding-start: 12px;
}
.message-copy {
  padding: 10px 0;
  font-size: 17px;
  min-width: 0;
}
.unreadTitle > span {
  font-weight: 600;
}
time {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--t2);
}
.unread {
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
}
.unread.active {
  background: var(--alert);
}
.delete {
  background: var(--alert);
  color: var(--ink-t);
}
.message-detail {
  padding: 20px;
  background: var(--card);
  border-radius: 20px;
}
.message-detail h2 {
  font-size: 20px;
}
.message-detail p {
  font-size: 17px;
  line-height: 1.5;
}
</style>

<style scoped src="../../theme/workflows.css"></style>
