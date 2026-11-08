<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage,
  IonContent,
  onIonViewWillEnter,
  onIonViewDidEnter,
  onIonViewWillLeave,
} from '@ionic/vue';
import WelcomeView from '../welcome/WelcomeView.vue';
import { useSessionStore } from '../../stores/session';
import { useVehiclePresentation, format } from '../../stores/presentation';
import HomeHeading from './HomeHeading.vue';
import HomeLower from './HomeLower.vue';
import VehicleStage from '../../components/VehicleStage.vue';
import SlideControl from '../../components/SlideControl.vue';
import QuickAction from '../../components/QuickAction.vue';
import MetricValue from '../../components/MetricValue.vue';
import BrandRefresh from '../../components/BrandRefresh.vue';
import { shortcutMap } from '../../app/shortcuts';
import { useHomeButtons } from '../../stores/home-buttons';
const homeButtons = useHomeButtons();
const session = useSessionStore(),
  vehicle = useVehiclePresentation();
onIonViewWillEnter(vehicle.updateClock);
const entered = ref(false);
onIonViewDidEnter(() => (entered.value = true));
onIonViewWillLeave(() => (entered.value = false));
const scrolled = ref(false);
const signedIn = computed(() => session.state.preview || session.state.session);
const loading = computed(() => !vehicle.reading && !session.state.preview && session.state.busy);
const quick = computed(() => [
  ...homeButtons.buttons.map((id) => shortcutMap[id] || shortcutMap.location),
  shortcutMap.more,
]);
function activate(action: string, value?: string) {
  if (!vehicle.online) {
    session.toast('网络不可用');
    return;
  }
  if (session.state.expired) {
    session.toast('登录已过期');
    return;
  }
  if (value === 'seat' && vehicle.daily?.capabilities.seatOpen === false) {
    session.toast('此车型不支持');
    return;
  }
  session.action(action, value);
}
</script>
<template>
  <IonPage data-page="/vehicle" :data-ready="entered">
    <WelcomeView v-if="!signedIn" :ready="entered" />
    <template v-else>
      <div class="folded-header" :class="{ visible: scrolled }">
        <b>{{ vehicle.vehicle?.name }}</b
        ><span>{{ vehicle.reading?.soc ?? '—' }}%　{{ vehicle.lockText }}</span>
      </div>
      <IonContent
        :fullscreen="true"
        :scroll-events="true"
        @ion-scroll="scrolled = $event.detail.scrollTop > 65"
      >
        <BrandRefresh :refresh="session.refresh" />
        <main class="vehicle-home">
          <div class="studio" />
          <HomeHeading :loading="loading" /><VehicleStage />
          <div class="home-metric">
            <span v-if="loading" class="skeleton metric-skeleton" />
            <MetricValue
              v-else
              class="battery-number"
              :value="vehicle.reading?.soc"
              unit="%"
              :class="{ warning: (vehicle.reading?.soc ?? 100) <= 20 }"
            />
            <p v-if="!loading && session.state.preferences.range" class="range-line">
              <template v-if="(vehicle.reading?.soc ?? 100) <= 20">电量低，记得充电</template>
              <template v-else
                >可行驶 <b class="num">{{ format(vehicle.reading?.range) }}</b>
                <span v-if="vehicle.reading?.range != null" class="num unit">km</span></template
              >
            </p>
          </div>
          <div class="home-lever"><SlideControl /></div>
          <div class="quick-actions">
            <QuickAction
              v-for="[icon, label, action, value] in quick"
              :key="label"
              :icon="icon"
              :label="label"
              :unavailable="
                !vehicle.online ||
                session.state.expired ||
                (value === 'seat' && vehicle.daily?.capabilities.seatOpen === false)
              "
              @activate="activate(action, value)"
            />
          </div>
          <HomeLower />
        </main>
      </IonContent>
    </template>
  </IonPage>
</template>
<style scoped src="./VehicleView.css"></style>
