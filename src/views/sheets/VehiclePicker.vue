<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import { useSessionStore } from '../../stores/session';
import AppIcon from '../../components/AppIcon.vue';
import { vehicleImageSources } from '../../ui/vehicle-art';
import type { SavedVehicle } from '../../core/accounts';
import { useVehiclePresentation } from '../../stores/presentation';
const session = useSessionStore();
const vehicle = useVehiclePresentation();
const image = (car: SavedVehicle) =>
  vehicleImageSources(
    {
      vin: car.vin,
      name: car.label,
      type: car.type,
      plate: car.plate,
    },
    true,
  )[0];
const mask = (value: string) => value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
</script>
<template>
  <section v-for="account in session.state.accountBook.accounts" :key="account.id">
    <p class="account-name">
      {{ account.label }}　{{ /^1\d{10}$/.test(account.uid) ? mask(account.uid) : '' }}
    </p>
    <button
      v-for="car in account.vehicles"
      :key="car.id"
      class="vehicle-choice"
      :aria-label="car.label"
      :disabled="session.state.busy"
      @click.stop="session.modalAction('saved-vehicle', car.id)"
    >
      <span class="car-art num"
        ><img v-if="image(car)" :src="image(car)" alt="" referrerpolicy="no-referrer" />
        <template v-else>{{ car.type }}</template></span
      >
      <span class="name"
        ><b>{{ car.label }}</b
        ><small>{{
          session.state.accountBook.selectedVehicleId === car.id
            ? `${session.state.reading?.soc ?? '—'}%　${vehicle.lockText}`
            : `尾号 ${car.vin.slice(-6)}`
        }}</small></span
      >
      <AppIcon v-if="session.state.accountBook.selectedVehicleId === car.id" name="check" />
    </button>
  </section>
  <IonButton
    expand="block"
    fill="solid"
    class="secondary"
    @click.stop="
      session.close();
      session.action('route', '/me/accounts');
    "
    >管理账号</IonButton
  >
</template>
<style scoped src="./VehiclePicker.css"></style>
