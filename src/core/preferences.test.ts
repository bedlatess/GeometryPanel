import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, normalizePreferences, exportPreferences, importPreferences } from './preferences';

test('legacy preferences migrate without changing already chosen appearance or voltage', () => {
  assert.deepEqual(normalizePreferences({ theme: 'dark', accent: 'blue', voltage: false }), {
    ...defaultPreferences, theme: 'dark', voltage: false,
  });
  assert.deepEqual(normalizePreferences({ theme: 'invalid', range: 0, shortcut: '../command' }), defaultPreferences);
});
test('configuration export strips account data and round trips supported settings', () => {
  const value = { ...defaultPreferences, startPage: 'records' as const, shortcut: ['tires','rides','battery','more'] as typeof defaultPreferences.shortcut, range: false, token: 'synthetic-token', vin: 'synthetic-vehicle' };
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

test('old exported preferences retain chosen options and migrate removed navigation and shortcuts', () => {
 const legacy={theme:'light',accent:'blue',voltage:false,range:false,startPage:'daily',foregroundRefresh:false,shortcut:'seat'};
 const result=importPreferences(JSON.stringify({app:'GeometryPanel',schema:1,preferences:legacy}));
 assert.deepEqual(result,{...defaultPreferences,theme:'light',voltage:false,range:false,foregroundRefresh:false});
 assert.equal(Object.hasOwn(result,'accent'),false);
 assert.deepEqual(normalizePreferences({shortcut:['tires','rides','battery','more']}).shortcut,['tires','rides','battery','more']);
});
