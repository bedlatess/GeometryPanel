<script setup lang="ts">
import { IonList } from '@ionic/vue';
defineProps<{ title?: string }>();
</script>
<template>
  <section class="group-list">
    <h2 v-if="title">{{ title }}</h2>
    <IonList :inset="true" lines="inset"><slot /></IonList>
  </section>
</template>
<style scoped src="./GroupList.css"></style>
