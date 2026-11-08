<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
import BrandAsset from '../../components/BrandAsset.vue';
const session = useSessionStore();
</script>
<template>
  <div class="welcome">
    <div class="identity">
      <BrandAsset name="mark" label="几何面板" class="mark" />
      <BrandAsset name="wordmark" label="Geometry Panel" class="wordmark" />
      <p>极核电动车的车主工具</p>
    </div>
    <div class="welcome-actions">
      <IonButton expand="block" :disabled="session.state.booting" @click="session.action('connect')"
        >登录极核账号</IonButton
      >
      <IonButton expand="block" fill="clear" @click="session.action('preview')"
        >先看看演示</IonButton
      >
      <p>账号信息只保存在这台设备上</p>
    </div>
  </div>
</template>
<style scoped src="./WelcomeView.css"></style>
