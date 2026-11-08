<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import AppIcon from '../../components/AppIcon.vue';
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation } from '../../stores/presentation';
import { useOwnerStore } from '../../stores/owner';
defineProps<{ loading: boolean }>();
const session = useSessionStore(),
  vehicle = useVehiclePresentation();
const owner = useOwnerStore();
</script>
<template>
  <header class="home-heading">
    <div>
      <button class="car-name" aria-label="切换车辆" @click="session.action('vehicle-picker')">
        <h1>{{ vehicle.vehicle?.name }}</h1>
        <AppIcon name="chev-d" /><small v-if="session.state.preview">演示</small>
      </button>
      <div v-if="!loading" class="state-line" :class="vehicle.status[3]">
        <b><AppIcon :name="vehicle.status[2]" />{{ vehicle.status[0] }}</b>
        <IonButton
          v-if="session.state.expired"
          size="small"
          fill="solid"
          @click="session.action('connect')"
          >重新登录</IonButton
        >
        <span v-else>{{ vehicle.status[1] }}</span>
      </div>
      <span v-else class="skeleton state-skeleton" />
    </div>
    <button
      class="icon-button"
      aria-label="消息"
      @click="session.action('route', '/vehicle/messages')"
    >
      <AppIcon name="bell" />
      <span v-if="session.state.homeUnread || Number(owner.data.unread) > 0" class="badge" />
    </button>
  </header>
</template>
<style scoped src="./HomeHeading.css"></style>
