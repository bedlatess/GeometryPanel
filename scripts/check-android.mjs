// No upstream requests or Android device. Exercise the exact JS used by native system back.
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const activity = await readFile(new URL('../android/app/src/main/java/app/geometrypanel/mobile/MainActivity.java', import.meta.url), 'utf8');
const script = activity.match(/CLOSE_DIALOG_SCRIPT = """([\s\S]*?)""";/)?.[1];
assert.ok(script, 'Native back must use the reviewed dialog script');
assert.ok(activity.includes('evaluateJavascript(CLOSE_DIALOG_SCRIPT,'));
let clicks = 0;
const run = dialog => runInNewContext(script, { document: { querySelector(selector) {
  assert.equal(selector, 'dialog[open]');
  return dialog;
} } });
const dialog = close => ({ querySelector(selector) {
  assert.equal(selector, '[data-action="close"]');
  return close;
}, close() { throw new Error('Native back must not bypass web cancellation and cleanup'); } });

assert.equal(run(null), false, 'No dialog lets the native host handle back');
assert.equal(run(dialog({ disabled: false, click() { clicks++; } })), true);
assert.equal(clicks, 1, 'An enabled close goes through the shared web click handler');
assert.equal(run(dialog({ disabled: true, click() { throw new Error('Commit protection bypassed'); } })), true,
  'Disabled close must consume back while the web app commits local state');
assert.equal(run(dialog(null)), true, 'An open dialog without a close control must still consume back');
console.log('Android native-back checks: 4 synthetic dialog scenarios passed; no device or vehicle request.');

// Use the real TypeScript client so generated ids and method names cannot silently drift.
const nativeSource = await readFile(new URL('../src/core/native.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(nativeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(compiled.outputText, { exports, crypto: webcrypto, setTimeout, clearTimeout, DOMException });
const contract = await readFile(new URL('../android/app/src/main/java/app/geometrypanel/mobile/BridgeContract.java', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../android/app/src/main/java/app/geometrypanel/mobile/NativeBridge.java', import.meta.url), 'utf8');
const idPattern = new RegExp(`^${contract.match(/REQUEST_ID = "([^"]+)";/)[1]}$`);
assert.ok(bridge.includes('BridgeContract.validId(id)'));
const seen = new Set();
let client;
client = new exports.NativeClient({ send(message) {
  assert.equal(idPattern.test(message.id), true, 'Actual NativeClient id must be accepted by Android');
  assert.equal(seen.has(message.id), false); seen.add(message.id);
  assert.ok(bridge.includes(`case "${message.method}"`), 'Android must route every web contract method');
  client.receive(JSON.stringify({ id: message.id, ok: true, result: { synthetic: true } }));
} });
for (const method of exports.nativeMethods) assert.equal((await client.call(method)).synthetic, true);
client.dispose();
console.log(`Android bridge contract: ${seen.size} real-client synthetic RPC ids/methods passed; no native or upstream calls.`);
