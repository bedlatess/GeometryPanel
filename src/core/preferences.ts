export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  accent: 'green' | 'blue' | 'orange';
  voltage: boolean;
  range: boolean;
  startPage: 'vehicle' | 'daily';
  foregroundRefresh: boolean;
  shortcut: 'horn' | 'seat' | 'daily';
}
export const defaultPreferences: Readonly<Preferences> = Object.freeze({
  theme: 'system', accent: 'green', voltage: true, range: true,
  startPage: 'vehicle', foregroundRefresh: true, shortcut: 'horn',
});
const choices = {
  theme: ['system', 'light', 'dark'], accent: ['green', 'blue', 'orange'],
  startPage: ['vehicle', 'daily'], shortcut: ['horn', 'seat', 'daily'],
};
function valid(key: keyof Preferences, value: unknown): boolean {
  return key in choices ? (choices[key as keyof typeof choices] as readonly unknown[]).includes(value) : typeof value === 'boolean';
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function normalizePreferences(value: unknown): Preferences {
  const result = { ...defaultPreferences };
  if (!record(value)) return result;
  for (const key of Object.keys(result) as (keyof Preferences)[]) {
    if (valid(key, value[key])) Object.assign(result, { [key]: value[key] });
  }
  return result;
}
export function readPreferences(key: string): Preferences {
  try { return normalizePreferences(JSON.parse(localStorage.getItem(key) || '{}')); }
  catch { return { ...defaultPreferences }; }
}
export function writePreferences(value: Preferences, key: string): boolean {
  try { localStorage.setItem(key, JSON.stringify(normalizePreferences(value))); return true; }
  catch { return false; }
}
export function exportPreferences(value: Preferences): string {
  return JSON.stringify({ app: 'GeometryPanel', schema: 1, preferences: normalizePreferences(value) }, null, 2);
}
export function importPreferences(text: string): Preferences {
  if (text.length > 4096) throw new Error('preferences');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('preferences'); }
  if (!record(data) || data.app !== 'GeometryPanel' || data.schema !== 1
    || Object.keys(data).some(key => !['app', 'schema', 'preferences'].includes(key)) || !record(data.preferences)) throw new Error('preferences');
  const values = data.preferences;
  if (Object.keys(values).some(key => !Object.hasOwn(defaultPreferences, key) || !valid(key as keyof Preferences, values[key]))
    || Object.keys(defaultPreferences).some(key => !Object.hasOwn(values, key))) throw new Error('preferences');
  return normalizePreferences(values);
}
