<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IonActionSheet, IonButton, IonDatetime } from '@ionic/vue';
import { useWorkflowOverlay } from '../stores/workflow-actions';
import Sheet from './Sheet.vue';
import AppIcon from './AppIcon.vue';
const overlay = useWorkflowOverlay();
const value = ref('');
const fieldValues = ref<Record<string, string>>({});
watch(
  () => overlay.sheet,
  (sheet) => {
    value.value = sheet?.body.value || '';
    fieldValues.value = Object.fromEntries(
      (sheet?.body.fields || []).map((field) => [field.name, field.value || '']),
    );
  },
);
function accept(event?: Event, chosen?: string) {
  const button = (event?.currentTarget as HTMLElement) || document.createElement('button');
  Object.assign(button.dataset, overlay.sheet?.body.data, { value: chosen ?? value.value });
  overlay.submit(button);
}
const buttons = computed(() => [
  ...(overlay.sheet?.body.options || []).map(([key, label]) => ({
    text: label,
    role: key === overlay.sheet?.body.value ? 'selected' : undefined,
    handler: () => accept(undefined, key),
  })),
  { text: '取消', role: 'cancel', handler: () => overlay.close() },
]);
</script>
<template>
  <IonActionSheet
    :is-open="overlay.sheet?.body.kind === 'choose'"
    :header="overlay.sheet?.title"
    :buttons="buttons"
    @did-dismiss="$event.detail.role === 'backdrop' && overlay.close()"
  />
  <Sheet
    :open="Boolean(overlay.sheet && overlay.sheet.body.kind !== 'choose')"
    :title="overlay.sheet?.title || ''"
    :centered="overlay.sheet?.body.kind === 'confirm'"
    @close="overlay.close"
  >
    <div
      v-if="overlay.sheet"
      id="runtime-modal"
      :class="{
        'confirm-content': overlay.sheet.body.kind === 'confirm',
      }"
    >
      <template v-if="overlay.sheet.body.kind === 'confirm'">
        <span class="confirm-icon"><AppIcon name="gear" /></span>
        <h2>{{ overlay.sheet.title }}</h2>
        <p>{{ overlay.sheet.body.name }}<br />{{ overlay.sheet.body.detail }}</p>
        <blockquote v-if="overlay.sheet.body.quote">{{ overlay.sheet.body.quote }}</blockquote>
      </template>
      <label v-for="field in overlay.sheet.body.fields" :key="field.name"
        >{{ field.label }}
        <input
          v-if="overlay.sheet.body.kind !== 'times'"
          :data-owner-field="field.name"
          :name="field.name"
          :type="field.type || 'text'"
          :value="field.value"
          autocomplete="off"
        />
        <template v-else>
          <IonDatetime
            presentation="time"
            locale="zh-CN"
            hour-cycle="h23"
            :prefer-wheel="true"
            :value="`2026-01-01T${fieldValues[field.name]}:00`"
            @ion-change="fieldValues[field.name] = String($event.detail.value).slice(11, 16)"
          />
          <input type="hidden" :name="field.name" :value="fieldValues[field.name]" />
        </template>
      </label>
      <IonDatetime
        v-if="overlay.sheet.body.kind === 'date'"
        locale="zh-CN"
        presentation="date"
        :value="value || undefined"
        :prefer-wheel="true"
        @ion-change="value = String($event.detail.value).slice(0, 10)"
      />
      <button
        class="workflow-primary primary"
        :class="{ danger: overlay.sheet.body.danger }"
        @click="accept($event)"
      >
        {{ overlay.sheet.body.label }}
      </button>
      <IonButton fill="clear" expand="block" @click="overlay.close">取消</IonButton>
    </div>
  </Sheet>
</template>

<style scoped src="../theme/workflows.css"></style>
