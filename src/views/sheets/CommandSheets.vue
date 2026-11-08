<script setup lang="ts">
import { computed } from 'vue';
import { IonButton } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation } from '../../stores/presentation';
import AppIcon from '../../components/AppIcon.vue';
const session = useSessionStore(),
  vehicle = useVehiclePresentation();
const title = computed(() => session.state.sheet?.title || '');
const selected = computed(() =>
  session.state.sheet?.body.includes('data-value="high"') ? 'high' : 'normal',
);
const mode = computed(() =>
  title.value === '上电开锁' ? 'powerOn' : title.value === '关机锁车' ? 'powerOff' : 'seat',
);
const car = computed(() => vehicle.vehicle);
function select(value: string) {
  session.modalAction('', undefined, { hornMode: value });
}
function send() {
  session.modalAction(session.state.preview ? 'demo-control' : 'send-control', mode.value);
}
</script>
<template>
  <template v-if="title === '寻车'">
    <div class="options">
      <button
        v-for="[value, name, help] in [
          ['normal', '鸣笛寻车', '适合小区、路边'],
          ['high', '高声寻车', '适合大型停车场'],
        ]"
        :key="value"
        role="radio"
        :aria-label="name"
        :aria-checked="selected === value"
        :disabled="session.state.busy"
        :class="{ selected: selected === value }"
        @click.stop="select(value)"
      >
        <AppIcon name="horn" /><b>{{ name }}</b
        ><small>{{ help }}</small>
      </button>
    </div>
    <p class="target">
      <b>{{ car?.name }}</b
      ><span>尾号 {{ car?.vin.slice(-6) }}</span>
    </p>
    <IonButton
      expand="block"
      :disabled="session.state.busy || session.state.expired"
      :aria-label="session.state.busy ? (selected === 'high' ? '高声寻车' : '鸣笛寻车') : undefined"
      @click.stop="session.modalAction('send-horn-choice', selected)"
    >
      {{ selected === 'high' ? '高声寻车' : '鸣笛寻车' }}</IonButton
    >
  </template>
  <div v-else class="confirm-content">
    <span class="confirm-icon"
      ><AppIcon :name="mode === 'seat' ? 'seat' : mode === 'powerOn' ? 'unlock' : 'lock'"
    /></span>
    <h2>{{ title }}</h2>
    <p>{{ car?.name }}　尾号 {{ car?.vin.slice(-6) }}</p>
    <IonButton
      expand="block"
      data-action="send-control"
      :data-value="mode"
      :disabled="session.state.busy || session.state.expired"
      @click.stop="send"
      >{{ title }}</IonButton
    >
    <IonButton expand="block" fill="clear" @click.stop="session.close()">取消</IonButton>
  </div>
</template>
<style scoped src="./CommandSheets.css"></style>
