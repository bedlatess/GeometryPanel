<script setup lang="ts">
import { IonItem, IonLabel, IonToggle, IonSpinner } from '@ionic/vue';
import AppIcon from './AppIcon.vue';
import { nextTick } from 'vue';
import { useSessionStore } from '../stores/session';
const session = useSessionStore();
const props = defineProps<{
  label: string;
  value?: string;
  detail?: string;
  icon?: string;
  to?: string;
  action?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  danger?: boolean;
  numeric?: boolean;
  toggle?: boolean;
  checked?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ activate: []; change: [value: boolean] }>();
function activate(event: Event) {
  if (props.to) return;
  event.preventDefault();
  if (!props.readonly && !props.toggle) emit('activate');
}
function changed(event: CustomEvent) {
  session.haptic('selection');
  emit('change', event.detail.checked);
  void nextTick(() => {
    (event.target as HTMLIonToggleElement).checked = Boolean(props.checked);
  });
}
</script>
<template>
  <IonItem
    class="list-row"
    :button="!readonly && Boolean(to || action || toggle)"
    v-bind="to ? { routerLink: to } : {}"
    :detail="Boolean(to || (action && value && !readonly && !danger))"
    :disabled="disabled"
    :class="{ danger, tall: detail, 'with-icon': icon, readonly }"
    :aria-disabled="readonly || disabled"
    @click="activate"
  >
    <span v-if="icon" slot="start" class="tile"><AppIcon :name="icon" /></span>
    <IonLabel
      >{{ label }}<small v-if="detail">{{ detail }}</small></IonLabel
    >
    <IonSpinner v-if="busy" slot="end" name="crescent" />
    <IonToggle
      v-else-if="toggle"
      slot="end"
      :checked="checked"
      :aria-label="label"
      :disabled="disabled"
      @ion-change="changed"
    />
    <span v-else-if="value" slot="end" class="value row-value" :class="{ num: numeric }">{{
      value
    }}</span>
  </IonItem>
</template>
<style scoped src="./ListRow.css"></style>
