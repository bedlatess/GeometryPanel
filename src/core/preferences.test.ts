import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, normalizePreferences, exportPreferences, importPreferences } from './preferences';

test('legacy preferences migrate without changing already chosen appearance or voltage', () => {
  assert.deepEqual(normalizePreferences({ theme: 'dark', accent: 'blue', voltage: false }), {
    ...defaultPreferences, theme: 'dark', accent: 'blue', voltage: false,
  });
  assert.deepEqual(normalizePreferences({ theme: 'invalid', range: 0, shortcut: '../command' }), defaultPreferences);
});
test('configuration export strips account data and round trips supported settings', () => {
  const value = { ...defaultPreferences, startPage: 'daily' as const, shortcut: 'seat' as const, range: false, token: 'synthetic-token', vin: 'synthetic-vehicle' };
  const output = exportPreferences(value);
  assert.equal(output.includes('synthetic'), false);
  assert.deepEqual(importPreferences(output), normalizePreferences(value));
});
test('import refuses foreign versions, account fields and malformed values without partial application', () => {
  const data = JSON.parse(exportPreferences({ ...defaultPreferences }));
  for (const value of [[], null, { ...data, schema: 2 }, { ...data, token: 'synthetic' },
    { ...data, preferences: { ...data.preferences, token: 'synthetic' } },
    { ...data, preferences: { ...data.preferences, voltage: 'false' } },
    { ...data, preferences: { ...data.preferences, startPage: 'https://example.org' } },
    { ...data, preferences: {} }]) assert.throws(() => importPreferences(JSON.stringify(value)));
  assert.throws(() => importPreferences(' '.repeat(4097)));
  assert.throws(() => importPreferences('{'));
});
