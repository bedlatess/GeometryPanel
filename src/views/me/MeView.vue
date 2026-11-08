<script setup lang="ts">
import { computed } from 'vue';
import { IonButton } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation } from '../../stores/presentation';
import { vehicleImageSources } from '../../app/vehicle-art';
import PageFrame from '../../components/PageFrame.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
import AppIcon from '../../components/AppIcon.vue';
import manifest from '../../../package.json';
const session = useSessionStore(),
  vehicle = useVehiclePresentation();
const count = computed(() =>
  session.state.accountBook.accounts.reduce((total, account) => total + account.vehicles.length, 0),
);
const image = computed(() => vehicleImageSources(vehicle.vehicle, true)[0]);
</script>
<template>
  <PageFrame title="我的" root>
    <button class="identity-card" @click="session.action('route', '/me/accounts')">
      <img v-if="image" :src="image" alt="" referrerpolicy="no-referrer" />
      <span v-else class="car-mark num">{{ vehicle.vehicle?.type }}</span>
      <span class="name"
        ><b>{{ vehicle.vehicle?.name || '账号与车辆' }}</b>
        <small
          >{{ session.state.accountBook.accounts.length }} 个账号　{{ count }} 台车</small
        > </span
      ><AppIcon name="chev-r" />
    </button>
    <GroupList title="偏好">
      <ListRow
        label="外观"
        icon="palette"
        :value="
          { system: '跟随系统', light: '浅色', dark: '深色' }[session.state.preferences.theme]
        "
        to="/me/appearance"
      />
      <ListRow label="首页按钮" icon="grid4" to="/me/home" />
    </GroupList>
    <GroupList title="数据">
      <ListRow label="备份与恢复" icon="arch" to="/me/backup" />
      <ListRow
        v-if="!session.state.nativeAvailable"
        label="添加到主屏幕"
        icon="phone"
        to="/me/install"
      />
      <ListRow
        v-else
        label="检查更新"
        icon="refresh"
        action
        @activate="session.action('check-update')"
      />
    </GroupList>
    <GroupList
      ><ListRow label="关于几何面板" icon="info" :value="manifest.version" to="/me/about"
    /></GroupList>
    <IonButton
      v-if="session.state.preview"
      fill="clear"
      expand="block"
      @click="session.action('preview')"
      >退出演示</IonButton
    >
  </PageFrame>
</template>
<style scoped src="./MeView.css"></style>
