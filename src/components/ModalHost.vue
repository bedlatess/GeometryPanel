<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { displayCopy } from '../app/copy';
import { IonModal, IonActionSheet } from '@ionic/vue';
import { useSessionStore } from '../stores/session';
import AppIcon from './AppIcon.vue';
import LoginContent from '../views/welcome/LoginContent.vue';
import GeneralSheet from '../views/sheets/GeneralSheet.vue';
import CommandSheets from '../views/sheets/CommandSheets.vue';
import VehiclePicker from '../views/sheets/VehiclePicker.vue';
import MoreShortcuts from '../views/sheets/MoreShortcuts.vue';
const confirm = computed(() =>
  ['打开座桶', '上电开锁', '关机锁车'].includes(session.state.sheet?.title ?? ''),
);
const session = useSessionStore();
let opener: HTMLElement | null = null;
function rememberFocus() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  opener = active instanceof HTMLElement ? active : null;
}
function restoreFocus() {
  if (opener?.isConnected) opener.focus({ preventScroll: true });
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Tab' && session.sheetOpen) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#runtime-modal :is(button, input, textarea, ion-button, [tabindex="0"])',
      ),
    ).filter((el) => !el.matches(':disabled, [disabled]') && el.getClientRects().length);
    if (candidates.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const index = candidates.indexOf(document.activeElement as HTMLElement);
      const next = (index + (event.shiftKey ? -1 : 1) + candidates.length) % candidates.length;
      const candidate = candidates[next];
      const target = candidate.shadowRoot?.querySelector<HTMLElement>('button, input') || candidate;
      target.focus();
    }
  }
  if (event.key === 'Escape' && session.sheetOpen && !session.state.committing) {
    session.close();
  }
}
onMounted(() => document.addEventListener('keydown', escape, true));
onBeforeUnmount(() => document.removeEventListener('keydown', escape, true));
const login = computed(() =>
  ['手机号', '短信验证码', '图形验证码', '登录', '选择车辆'].includes(
    session.state.sheet?.title ?? '',
  ),
);
</script>
<template>
  <IonModal
    :is-open="session.sheetOpen && session.state.sheet?.body.kind !== 'choice'"
    :breakpoints="[0, 1]"
    :initial-breakpoint="1"
    :backdrop-breakpoint="0"
    :handle="true"
    :can-dismiss="!session.state.committing"
    :keep-contents-mounted="false"
    @will-present="rememberFocus"
    @did-dismiss="restoreFocus"
    @will-dismiss="
      session.sheetOpen && session.state.sheet?.body.kind !== 'choice' && session.close()
    "
  >
    <div
      id="runtime-modal"
      open
      :class="['sheet-content', { centered: confirm }]"
      @click="session.modalEvent"
      @submit="session.modalEvent"
      @change="session.modalEvent"
    >
      <div v-if="!confirm" class="sheet-heading">
        <h2 id="modal-title">
          {{ session.state.sheet?.title === '切换车辆' ? '我的车' : session.state.sheet?.title }}
        </h2>
        <button
          class="sheet-close"
          aria-label="关闭"
          :disabled="session.state.committing"
          @click.stop="session.close()"
        >
          <AppIcon name="x" />
        </button>
      </div>
      <LoginContent v-if="login" />
      <CommandSheets v-else-if="confirm || session.state.sheet?.title === '寻车'" />
      <VehiclePicker v-else-if="session.state.sheet?.title === '切换车辆'" />
      <GeneralSheet v-else-if="session.state.sheet" />
      <MoreShortcuts v-if="session.state.sheet?.title === '更多'" />
      <p v-if="session.sheetOpen && session.state.notice" id="modal-message" role="status">
        {{ displayCopy(session.state.notice) }}
      </p>
    </div>
  </IonModal>
  <IonActionSheet
    :is-open="session.sheetOpen && session.state.sheet?.body.kind === 'choice'"
    :header="session.state.sheet?.title"
    :buttons="[
      ...(session.state.sheet?.body.items || []).map(([value, text]: string[]) => ({
        text,
        handler: () => session.modalAction(session.state.sheet?.body.action, value),
      })),
      { text: '取消', role: 'cancel', handler: () => session.close() },
    ]"
    @did-dismiss="$event.detail.role === 'backdrop' && session.close()"
  />
</template>
<style scoped src="./ModalHost.css"></style>
