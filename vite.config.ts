import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import { ionicOnDemand } from './scripts/ionic-on-demand.mjs';

export default defineConfig({
  plugins: [
    ionicOnDemand(),
    vue(),
    {
      name: 'bundle-audit',
      generateBundle(_options, bundle) {
        if (!process.env.BUNDLE_AUDIT) return;
        const chunks = Object.values(bundle).filter((v) => v.type === 'chunk');
        fs.writeFileSync(
          '.tools/ui-v3/bundle.json',
          JSON.stringify(
            chunks.map((c) => ({
              name: c.fileName,
              entry: c.isEntry,
              imports: c.imports,
              modules: Object.entries(c.modules)
                .map(([name, value]) => ({ name, size: value.renderedLength }))
                .sort((a, b) => b.size - a.size),
            })),
            null,
            2,
          ),
        );
      },
    },
  ],
  base: './',
  build: {
    target: 'safari16.4',
    rollupOptions: {
      treeshake: {
        moduleSideEffects: (id) => !id.includes('/@ionic/core/components/'),
      },
    },
  },
  server: { strictPort: true },
  preview: { strictPort: true },
});
