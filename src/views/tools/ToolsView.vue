<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { IonButton, onIonViewWillEnter } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import { loadTaskConfig } from '../../core/tasks-store';
import { TasksApi } from '../../api/tasks';
const session = useSessionStore(),
  enabled = ref(false);
const points = ref('未开启');
onIonViewWillEnter(async () => {
  points.value = '未开启';
  const bound = session.state.session;
  const account = session.state.accountBook.accounts.find((item) => item.uid === bound?.uid);
  if (!session.state.preview && account && loadTaskConfig(account.id).enabled) {
    points.value = '—';
    try {
      const total = await new TasksApi().total(account);
      if (session.state.session === bound) points.value = total == null ? '—' : String(total);
    } catch {
      /* A missing total stays unknown. */
    }
  }
  if (session.state.preview || !session.state.nativeAvailable) return;
  try {
    const value = await session.nativeCall<{ enabled?: boolean }>('background.status');
    enabled.value = value?.enabled === true;
  } catch {
    /* Status remains unavailable. */
  }
});
</script>
<template>
  <PageFrame title="工具" root>
    <template v-if="session.state.nativeAvailable && !session.state.preview">
      <GroupList title="车旁">
        <ListRow label="蓝牙钥匙" icon="bt" to="/tools/bluetooth" />
        <ListRow label="仪表与投屏" icon="meter" to="/tools/meter" />
        <ListRow label="扫码" icon="scan" to="/tools/scan" />
      </GroupList>
      <GroupList title="提醒与桌面">
        <ListRow
          label="后台提醒"
          icon="bell"
          :value="enabled ? '已开启' : '未开启'"
          to="/tools/monitor"
        /><ListRow label="桌面组件" icon="widget" to="/tools/widgets" />
      </GroupList>
    </template>
    <GroupList :title="session.state.nativeAvailable ? '其它' : undefined">
      <ListRow label="车况图片" icon="image" to="/tools/picture" />
      <ListRow label="签到与积分" icon="cal" :value="points" to="/tools/tasks" />
      <ListRow label="诊断" icon="pulse" to="/tools/diagnostics" />
    </GroupList>
    <GroupList v-if="session.state.android && !session.state.preview" title="Android">
      <ListRow label="极核 App 登录" icon="key" to="/tools/android" />
      <ListRow label="后台常驻模块" icon="gear" to="/tools/android" />
    </GroupList>
    <section v-if="!session.state.nativeAvailable || session.state.preview" class="app-card">
      <h2>在 App 中还能用</h2>
      <p>需要系统权限的功能，只在安装包里提供</p>
      <ul>
        <li
          v-for="[icon, label] in [
            ['bt', '蓝牙钥匙'],
            ['widget', '桌面组件'],
            ['bell', '后台提醒'],
            ['meter', '仪表与投屏'],
          ]"
          :key="icon"
        >
          <AppIcon :name="icon" />{{ label }}
        </li>
      </ul>
      <IonButton size="small" @click="session.action('download-app')">获取 App</IonButton>
    </section>
  </PageFrame>
</template>
<style scoped src="./ToolsView.css"></style>
