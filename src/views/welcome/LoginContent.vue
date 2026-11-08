<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { IonButton, IonInput } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
const session = useSessionStore();
const title = computed(() => session.state.sheet?.title);
const phone = ref('');
const secret = ref('');
const uid = ref('');
const reveal = ref(false);
const digits = ref('');
function focusCode() {
  void nextTick(() => document.querySelector<HTMLInputElement>('#code')?.focus());
}
watch(title, () => {
  uid.value = session.state.session?.uid || '';
  secret.value = '';
  digits.value = '';
  if (title.value === '短信验证码') focusCode();
});
function inputCode(event: Event) {
  digits.value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
  if (digits.value.length === 6 && !session.state.busy) {
    (event.target as HTMLInputElement).form?.requestSubmit();
  }
}
function inputPhone(event: Event) {
  phone.value = (event.target as HTMLInputElement).value.replace(/\s/g, '');
}
</script>
<template>
  <form v-if="title === '手机号'" id="phone-form">
    <label for="phone">手机号</label>
    <input
      id="phone"
      :value="phone"
      type="tel"
      inputmode="tel"
      autocomplete="tel-national"
      maxlength="11"
      pattern="1[0-9]{10}"
      required
      @input="inputPhone"
    />
    <IonButton expand="block" type="submit" :disabled="session.state.busy">获取验证码</IonButton>
    <IonButton expand="block" fill="clear" @click="session.modalAction('token-login')">
      使用 token 登录
    </IonButton>
  </form>
  <form v-else-if="title === '短信验证码'" id="code-form">
    <p>已发送至 {{ session.state.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') }}</p>
    <label for="code">输入验证码</label>
    <div class="code-entry" @click="focusCode">
      <span v-for="n in 6" :key="n" :class="{ active: n === digits.length + 1 }">
        {{ digits[n - 1] }}
      </span>
      <input
        id="code"
        :value="digits"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]{6}"
        maxlength="6"
        required
        aria-label="输入验证码"
        @input="inputCode"
      />
    </div>
    <IonButton
      fill="clear"
      :disabled="session.state.busy || session.state.secondsRemaining > 0"
      @click="session.modalAction('resend')"
    >
      {{
        session.state.secondsRemaining
          ? `${session.state.secondsRemaining} 秒后重新获取`
          : '重新获取验证码'
      }}
    </IonButton>
    <IonButton fill="clear" @click="session.modalAction('phone')">更换手机号</IonButton>
  </form>
  <form v-else-if="title === '登录'" id="token-form">
    <label for="login-secret">粘贴 token 或完整网址</label>
    <div class="secret-field">
      <input
        id="login-secret"
        v-model="secret"
        :type="reveal ? 'text' : 'password'"
        autocomplete="off"
        spellcheck="false"
        maxlength="8192"
        required
      />
      <button
        type="button"
        :aria-label="reveal ? '隐藏登录信息' : '显示登录信息'"
        @click="reveal = !reveal"
      >
        {{ reveal ? '隐藏' : '显示' }}
      </button>
    </div>
    <label for="login-uid">账号 ID</label>
    <input id="login-uid" v-model="uid" autocomplete="off" maxlength="128" />
    <IonButton expand="block" type="submit" :disabled="session.state.busy">登录</IonButton>
  </form>
  <div v-else-if="title === '图形验证码'">
    <canvas
      v-if="session.state.sheet?.body.ready"
      class="captcha"
      width="720"
      height="360"
      role="slider"
      tabindex="0"
      aria-label="拖动拼图完成验证"
      aria-valuemin="0"
      aria-valuenow="0"
    />
    <IonButton fill="clear" @click="session.modalAction('new-captcha')">换一张</IonButton>
    <IonButton fill="clear" @click="session.modalAction('code')">已有短信验证码</IonButton>
    <IonButton fill="clear" @click="session.modalAction('phone')">更换手机号</IonButton>
  </div>
  <div v-else-if="title === '选择车辆'">
    <button
      v-for="(car, index) in session.state.pending?.vehicles"
      :key="car.vin"
      class="login-car"
      @click="session.modalAction('select', String(index))"
    >
      <span>{{ car.name }}</span
      ><small>尾号 {{ car.vin.slice(-6) }}</small>
    </button>
    <p v-if="!session.state.busy && !session.state.pending?.vehicles.length">
      {{
        session.state.sheet?.body.result?.receivedCount
          ? '车辆信息未识别'
          : session.state.sheet?.body.result
            ? '未找到车辆'
            : session.state.notice || '正在加载'
      }}
    </p>
    <span v-if="session.state.busy" class="skeleton" role="status" aria-label="正在加载"
      >正在加载</span
    >
    <IonButton
      expand="block"
      :disabled="session.state.busy"
      @click="session.modalAction('retry-list')"
      >重新读取</IonButton
    >
    <IonButton fill="clear" :disabled="session.state.busy" @click="session.modalAction('phone')"
      >更换账号</IonButton
    >
  </div>
</template>
<style scoped src="./LoginContent.css"></style>
