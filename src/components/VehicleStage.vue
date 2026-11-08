<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useVehiclePresentation } from '../stores/presentation';
import { vehicleImageSources } from '../app/vehicle-art';
import BrandAsset from './BrandAsset.vue';
import { useSessionStore } from '../stores/session';
const vehicle = useVehiclePresentation();
const session = useSessionStore();
const index = ref(0);
const swapped = ref(false);
const image = computed(() =>
  !vehicle.reading && session.state.busy
    ? undefined
    : vehicleImageSources(vehicle.vehicle, false)[index.value],
);
watch(
  () => vehicle.vehicle?.vin,
  (_value, old) => {
    index.value = 0;
    swapped.value = Boolean(old);
  },
);
</script>
<template>
  <div
    class="vehicle-stage"
    :class="{
      old: vehicle.stale || !vehicle.online || vehicle.reading?.online === false,
      charging: vehicle.charging,
    }"
  >
    <span class="floor" /><span v-if="vehicle.charging" class="charge-glow" />
    <span v-if="vehicle.charging" class="charge-line" />
    <template v-if="image">
      <Transition :name="swapped ? 'car' : 'arrival'" mode="out-in">
        <img
          :key="vehicle.vehicle?.vin"
          :src="image"
          alt=""
          referrerpolicy="no-referrer"
          class="vehicle-image"
          @error="index++"
        />
      </Transition>
      <img :src="image" alt="" class="reflection" referrerpolicy="no-referrer" />
    </template>
    <span v-else-if="vehicle.vehicle?.type" class="model-mark">{{ vehicle.vehicle.type }}</span>
    <BrandAsset v-else name="mark" class="fallback-mark" />
  </div>
</template>
<style scoped src="./VehicleStage.css"></style>
