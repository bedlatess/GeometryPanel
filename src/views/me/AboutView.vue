<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionStore } from '../../stores/session';
import { privacy, disclaimer, lucide } from '../../app/legal';
import license from '../../../LICENSE?raw';
import barlow from '../../../public/fonts/OFL-Barlow.txt?raw';
import vueLicense from '../../../node_modules/vue/LICENSE?raw';
import ionicLicense from '../../../node_modules/@ionic/core/LICENSE?raw';
import piniaLicense from '../../../node_modules/pinia/LICENSE?raw';
import routerLicense from '../../../node_modules/vue-router/LICENSE?raw';
import { version } from '../../../package.json';
import PageFrame from '../../components/PageFrame.vue';
import BrandAsset from '../../components/BrandAsset.vue';
import GroupList from '../../components/GroupList.vue';
import ListRow from '../../components/ListRow.vue';
const route = useRoute(),
  path = route.path,
  session = useSessionStore();
const title = String(route.meta.title);
const kind = path.split('/').at(-1) || '';
const licenses: Record<string, [string, string]> = {
  mit: ['几何面板　MIT', license],
  barlow: ['Barlow　SIL OFL', barlow],
  lucide: ['Lucide　ISC', lucide],
  vue: ['Vue　MIT', vueLicense],
  ionic: ['Ionic　MIT', ionicLicense],
  pinia: ['Pinia　MIT', piniaLicense],
  router: ['Vue Router　MIT', routerLicense],
};
const copy = computed(() =>
  kind === 'privacy' ? privacy : kind === 'disclaimer' ? disclaimer : [],
);
const legal = computed(() => licenses[kind]?.[1] || '');
</script>
<template>
  <PageFrame :title="title">
    <template v-if="path === '/me/about'">
      <div class="about-brand">
        <BrandAsset name="mark" />
        <h2>几何面板</h2>
        <button @click="session.action('version')">版本 {{ version }}</button>
      </div>
      <GroupList>
        <a
          class="workflow-row"
          href="https://github.com/bedlatess/GeometryPanel"
          target="_blank"
          rel="noopener noreferrer"
          >项目主页</a
        >
        <a
          class="workflow-row"
          href="https://github.com/bedlatess/GeometryPanel/issues/new/choose"
          target="_blank"
          rel="noopener noreferrer"
          >问题反馈</a
        >
        <ListRow label="隐私说明" to="/me/about/privacy" />
        <ListRow label="免责声明" to="/me/about/disclaimer" />
        <ListRow label="开源许可" to="/me/about/licenses" />
        <ListRow v-if="session.state.developer" label="开发者选项" to="/me/developer" />
      </GroupList>
      <p class="foot">几何面板不是极核官方应用</p>
    </template>
    <GroupList v-else-if="kind === 'licenses'">
      <ListRow
        v-for="([title], id) in licenses"
        :key="id"
        :label="title"
        :to="'/me/about/licenses/' + id"
    /></GroupList>
    <article v-else class="legal-copy">
      <p v-for="line in copy" :key="line">{{ line }}。</p>
      <pre v-if="legal">{{ legal }}</pre>
    </article>
  </PageFrame>
</template>
<style scoped>
.about-brand {
  text-align: center;
  padding: 32px 0 20px;
}
.about-brand :deep(img) {
  width: 76px;
  height: 76px;
}
.about-brand h2 {
  font-size: 24px;
}
.about-brand button {
  min-height: 44px;
  border-radius: 24px;
  background: var(--fill);
  padding: 8px 20px;
  font-size: 15px;
  color: var(--t2);
}
a {
  text-decoration: none;
}
.legal-copy {
  padding: 4px 16px;
  font-size: 17px;
  line-height: 1.6;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-family: inherit;
}
</style>

<style scoped src="../../theme/workflows.css"></style>
