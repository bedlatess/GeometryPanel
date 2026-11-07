// No upstream requests or Android device. Exercise the exact JS used by native system back.
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

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
