import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const walk = (root) =>
  readdirSync(root).flatMap((name) => {
    const file = `${root}/${name}`;
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
const canonical = (source) => source.toString('utf8').replaceAll('\r\n', '\n');
const digest = (source) => createHash('sha256').update(canonical(source)).digest('hex');
const files = ['src/app', 'src/stores', 'src/components', 'src/views', 'src/theme']
  .flatMap(walk)
  .filter((file) => /\.(?:ts|css|vue)$/.test(file));
const lineViolations = [],
  vueViolations = [],
  colorViolations = [],
  htmlViolations = [];
const storeViolations = [];
const nativeControls = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8'),
    lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if ([...line].length > 100)
      lineViolations.push({ file, line: index + 1, length: [...line].length });
    if (!file.endsWith('tokens.css') && /#[\da-f]{3,8}\b|rgba?\(\s*\d|hsla?\(/i.test(line))
      colorViolations.push({ file, line: index + 1 });
    if (/\.innerHTML\s*=|insertAdjacentHTML|v-html/.test(line))
      htmlViolations.push({ file, line: index + 1 });
    if (
      file.endsWith('.vue') &&
      /<(select|details|table)\b|type=["'](?:number|date|month)["']/.test(line)
    )
      nativeControls.push({ file, line: index + 1 });
  });
  if (file.includes('/stores/') && lines.length > 400)
    storeViolations.push({ file, lines: lines.length });
  if (file.endsWith('.vue') && lines.length > 300)
    vueViolations.push({ file, lines: lines.length });
}
const baseline = Object.fromEntries(
  execFileSync('git', ['ls-tree', '-r', '--name-only', 'pre-0.9.0', '--', 'src/api', 'src/core'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((file) => [file, digest(execFileSync('git', ['show', `pre-0.9.0:${file}`]))]),
);
const hashes = Object.entries(baseline).map(([file, before]) => {
  const source = readFileSync(file);
  const after = digest(source);
  const onlyHaptic =
    file === 'src/core/native.ts' &&
    canonical(source).replace(", 'haptic'", '') ===
      canonical(execFileSync('git', ['show', `pre-0.9.0:${file}`]));
  return { file, before, after, unchanged: before === after, permitted: onlyHaptic };
});
const unexpectedBusinessFiles = ['src/api', 'src/core']
  .flatMap(walk)
  .filter((file) => !Object.hasOwn(baseline, file));
const baselinePackage = JSON.parse(
  execFileSync('git', ['show', 'pre-0.9.0:package.json'], { encoding: 'utf8' }),
);
const currentPackage = JSON.parse(readFileSync('package.json', 'utf8'));
const permitted = [
  'vue',
  '@ionic/vue',
  '@ionic/vue-router',
  'vue-router',
  'pinia',
  'ionicons',
  '@vitejs/plugin-vue',
  'vue-tsc',
  'eslint',
  'eslint-plugin-vue',
  'prettier',
];
const additions = ['dependencies', 'devDependencies'].flatMap((group) =>
  Object.entries(currentPackage[group])
    .filter(([name]) => !baselinePackage[group][name])
    .map(([name, version]) => ({ group, name, version, permitted: permitted.includes(name) })),
);
const references = walk('../docs/design/v2/screens').concat(walk('../docs/design/reference'));
const prohibitedHashes = new Set(
  references.map((file) => createHash('sha256').update(readFileSync(file)).digest('hex')),
);
const images = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter((file) => {
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  })
  .filter((file) => /\.(?:png|jpe?g|webp|svg)$/i.test(file));
const copiedReferences = images.filter((file) =>
  prohibitedHashes.has(createHash('sha256').update(readFileSync(file)).digest('hex')),
);
const result = {
  generatedAt: new Date().toISOString(),
  newCodeFiles: files.length,
  businessHashNormalization: 'CRLF converted to LF; no other source normalization',
  vueFiles: files.filter((file) => file.endsWith('.vue')).length,
  lineViolations,
  vueViolations,
  storeViolations,
  colorViolations,
  htmlViolations,
  nativeControls,
  additions,
  businessFileHashes: hashes,
  unexpectedBusinessFiles,
  copiedReferences,
  maxVueLines: Math.max(
    ...files
      .filter((file) => file.endsWith('.vue'))
      .map((file) => readFileSync(file, 'utf8').split(/\r?\n/).length),
  ),
};
writeFileSync('../docs/audit/0.9.0/工程检查/源码检查.json', JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({ ...result, businessFileHashes: hashes.filter((x) => !x.unchanged) }, null, 2),
);

if (
  [
    lineViolations,
    vueViolations,
    storeViolations,
    colorViolations,
    htmlViolations,
    nativeControls,
    copiedReferences,
    unexpectedBusinessFiles,
  ].some((items) => items.length) ||
  additions.some((x) => !x.permitted) ||
  hashes.some((x) => !x.unchanged && !x.permitted)
)
  process.exitCode = 1;
