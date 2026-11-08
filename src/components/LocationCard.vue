<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import AppIcon from './AppIcon.vue';
import { useVehiclePresentation, age } from '../stores/presentation';
import { useSessionStore } from '../stores/session';
const vehicle = useVehiclePresentation(),
  session = useSessionStore();
</script>
<template>
  <section class="location-card">
    <button class="map" aria-label="车辆位置" @click="session.action('route', '/vehicle/location')">
      <svg viewBox="0 0 358 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g fill="none" stroke="var(--line)" stroke-width="1.4">
          <path d="M-10 30 C60 10 120 50 190 30 S320 0 380 20" />
          <path d="M-10 54 C70 36 130 76 200 54 S320 26 380 46" />
          <path d="M-10 80 C80 64 140 104 210 80 S320 54 380 74" />
          <path d="M-10 106 C90 90 150 128 220 104 S320 82 380 100" />
          <path d="M-10 132 C100 116 160 152 230 128 S330 108 380 126" />
        </g>
        <path
          d="M110 160 L170 96 L230 52 L300 -6"
          fill="none"
          stroke="var(--fill2)"
          stroke-width="9"
          stroke-linecap="round"
        /></svg
      ><span class="pin"><i /></span>
    </button>
    <div class="info">
      <div>
        <b>{{ vehicle.daily?.location?.address || '停车位置' }}</b>
        <span>{{ age(vehicle.daily?.location?.reportedAt, '') }}</span>
      </div>
      <IonButton
        size="small"
        :disabled="!vehicle.daily?.location || session.state.preview"
        @click="session.action('walk')"
        ><AppIcon name="walk" />步行找车</IonButton
      >
    </div>
  </section>
</template>
<style scoped src="./LocationCard.css"></style>
