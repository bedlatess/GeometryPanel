import {
  exportPreferences as exportCore,
  importPreferences as importCore,
  type Preferences,
} from '../core/preferences';
import { storagePrefix } from '../core/scope';
export const homeChoices = [
  'horn',
  'seat',
  'location',
  'status',
  'settings',
  'rides',
  'high',
  'storage',
  'tires',
  'battery',
  'messages',
];
export const homeKey = `${storagePrefix}home-buttons-v3`;
export function validHome(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length === 3 && value.every((item) => homeChoices.includes(item))
  );
}
export function readHome() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(homeKey) || 'null');
    return validHome(value) ? value : null;
  } catch {
    return null;
  }
}
export function writeHome(value: string[] | null) {
  if (value) localStorage.setItem(homeKey, JSON.stringify(value));
  else localStorage.removeItem(homeKey);
  window.dispatchEvent(new Event('home-layout-change'));
}
export function exportPreferences(value: Preferences, preview = false) {
  const data = JSON.parse(exportCore(value));
  const buttons = preview ? null : readHome();
  if (buttons) data.ui = { homeButtons: buttons };
  return JSON.stringify(data, null, 2);
}
export function importPreferences(text: string, preview = false) {
  if (text.length > 4096) throw new Error('preferences');
  const data = JSON.parse(text),
    ui = data.ui;
  if (
    ui !== undefined &&
    (!ui ||
      typeof ui !== 'object' ||
      Array.isArray(ui) ||
      Object.keys(ui).some((key) => key !== 'homeButtons') ||
      !validHome(ui.homeButtons))
  ) {
    throw new Error('preferences');
  }
  delete data.ui;
  const preferences = importCore(JSON.stringify(data));
  if (!preview) writeHome(ui?.homeButtons || null);
  return preferences;
}
