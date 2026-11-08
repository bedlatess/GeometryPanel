<script setup lang="ts">
import { ref } from 'vue';
import { IonButton } from '@ionic/vue';
import { useOwnerStore, obj } from '../../stores/owner';
import { useSessionStore } from '../../stores/session';
import ListRow from '../../components/ListRow.vue';
import Sheet from '../../components/Sheet.vue';
import AppIcon from '../../components/AppIcon.vue';
const owner = useOwnerStore(),
  session = useSessionStore();
const target = ref<{ name: string; kind: string; on: boolean } | null>(null);
const editing = ref(false),
  password = ref(''),
  repeat = ref('');
let passwordNext = false;
function safety(kind: string) {
  const key = kind === 'fcw' ? 'radarFcw' : 'automaticLock';
  const current = Number(owner.get('settings')[key]);
  target.value = {
    name: kind === 'fcw' ? '前碰撞预警' : '自动龙头锁',
    kind,
    on: kind === 'fcw' ? current === 1 : current !== 1,
  };
}
function nextPassword() {
  if (!/^\d{4}$/.test(password.value) || password.value !== repeat.value) {
    session.toast('两次密码需为相同的 4 位数字');
    return;
  }
  passwordNext = true;
  editing.value = false;
}
function passwordClosed() {
  if (!passwordNext) return;
  passwordNext = false;
  target.value = { name: '修改车端密码', kind: 'password', on: true };
}
function cancel() {
  target.value = null;
  password.value = '';
  repeat.value = '';
}
async function confirm() {
  const item = target.value,
    bound = session.state.session;
  if (!item || !bound) return;
  target.value = null;
  let secret = password.value;
  password.value = '';
  repeat.value = '';
  await owner.mutate(
    (api, signal) =>
      item.kind === 'password'
        ? (() => {
            const value = secret;
            secret = '';
            return api.password(bound, value, signal);
          })()
        : item.kind === 'fcw'
          ? api.fcw(bound, item.on, signal)
          : api.autoHead(bound, item.on, signal),
    'settings',
    (value) => {
      if (item.kind === 'password') return null;
      const key = item.kind === 'fcw' ? 'radarFcw' : 'automaticLock';
      return obj(value)[key] === undefined
        ? null
        : String(obj(value)[key]) ===
            String(item.kind === 'fcw' ? (item.on ? 2 : 1) : item.on ? 1 : 0);
    },
  );
}
</script>
<template>
  <ListRow
    v-if="owner.supported('AUTOMATIC_LOCK') && owner.get('settings').automaticLock != null"
    label="自动龙头锁"
    toggle
    :checked="Number(owner.get('settings').automaticLock) === 1"
    :disabled="owner.busy || session.state.preview"
    @change="safety('head')"
  />
  <ListRow
    v-if="owner.supported('RADAR_ASSISTED_FCW') && owner.get('settings').radarFcw != null"
    label="前碰撞预警"
    toggle
    :checked="Number(owner.get('settings').radarFcw) !== 1"
    :disabled="owner.busy || session.state.preview"
    @change="safety('fcw')"
  />
  <ListRow
    v-if="owner.supported('PASSWORD_UNLOCKING')"
    label="修改车端密码"
    action
    :disabled="owner.busy || session.state.preview"
    @activate="editing = true"
  />
  <Sheet
    :open="editing"
    title="修改车端密码"
    @close="
      editing = false;
      cancel();
    "
    @closed="passwordClosed"
  >
    <form @submit.prevent="nextPassword">
      <label
        >新密码<input
          v-model="password"
          type="password"
          inputmode="numeric"
          pattern="[0-9]{4}"
          maxlength="4"
          autocomplete="new-password"
          required
      /></label>
      <label
        >再次输入<input
          v-model="repeat"
          type="password"
          inputmode="numeric"
          pattern="[0-9]{4}"
          maxlength="4"
          autocomplete="new-password"
          required
      /></label>
      <IonButton type="submit" expand="block">修改密码</IonButton>
    </form>
  </Sheet>
  <Sheet :open="Boolean(target)" :title="target?.name || ''" centered @close="cancel">
    <div v-if="target" class="confirm-content">
      <span class="confirm-icon"><AppIcon name="lock" /></span>
      <h2>{{ target.name }}</h2>
      <p>
        {{ session.state.session?.vehicle.name }}　尾号
        {{ session.state.session?.vehicle.vin.slice(-6) }}<br />从
        {{ target.kind === 'password' ? '原密码' : target.on ? '关闭' : '开启' }} 改为
        {{ target.kind === 'password' ? '新密码' : target.on ? '开启' : '关闭' }}
      </p>
      <IonButton expand="block" @click="confirm">{{ target.name }}</IonButton>
      <IonButton expand="block" fill="clear" @click="cancel">取消</IonButton>
    </div>
  </Sheet>
</template>
<style scoped src="./SafetySettings.css"></style>
