import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installContext } from './pwa';

test('home-screen detection handles iOS standalone and desktop-mode iPad without mislabelling a Mac', () => {
  assert.equal(installContext('iPhone', 5, true, false), 'installed');
  assert.equal(installContext('Android', 5, false, true), 'installed');
  assert.equal(installContext('iPhone', 5, false, false), 'ios');
  assert.equal(installContext('Macintosh', 5, false, false), 'ios');
  assert.equal(installContext('Macintosh', 0, false, false), 'browser');
});
