import { nativeAccounts, type AccountBook } from './accounts';
import { NativeClient, NativeError } from './native';
import { storagePrefix } from './scope';

const consentKey = `${storagePrefix}native-account-consent-v1`;
let memoryConsent = false;
export function nativeAccountsAuthorized() { try { return memoryConsent || localStorage.getItem(consentKey) === 'allowed'; } catch { return memoryConsent; } }
/** Called only by the user's enable/save gesture for a native background feature. */
export async function authorizeNativeAccounts(native: NativeClient, book: AccountBook) {
  if (!book.accounts.length) throw new NativeError('login_required');
  const result = await native.call('accounts.sync', nativeAccounts(book));
  memoryConsent = true; try { localStorage.setItem(consentKey, 'allowed'); } catch { }
  return result;
}
export async function syncNativeAccounts(native: NativeClient, book: AccountBook) {
  if (native.available && nativeAccountsAuthorized()) await native.call('accounts.sync', nativeAccounts(book));
}
export async function revokeNativeAccounts(native: NativeClient) {
  if (native.available && nativeAccountsAuthorized()) await native.call('accounts.sync', { accounts: [], selectedVehicleId: null });
  memoryConsent = false; try { localStorage.removeItem(consentKey); } catch { }
}
export const notificationDefaults = { chargeStart: true, chargeProgress: true, chargeFull: true, chargeStop: true, message: true, lowBattery: false, offline: false, tire: false };
export type BackgroundNotifications = typeof notificationDefaults;
export interface BackgroundPreferences { notifications: BackgroundNotifications; lowBatteryThreshold: number }
export function readBackgroundPreferences(): BackgroundPreferences {
  const defaults = { notifications: { ...notificationDefaults }, lowBatteryThreshold: 20 };
  try {
    const value = JSON.parse(localStorage.getItem(`${storagePrefix}background-preferences`) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    for (const key of Object.keys(notificationDefaults) as (keyof BackgroundNotifications)[]) if (typeof value.notifications?.[key] === 'boolean') defaults.notifications[key] = value.notifications[key];
    if (Number.isInteger(value.lowBatteryThreshold) && value.lowBatteryThreshold >= 5 && value.lowBatteryThreshold <= 80) defaults.lowBatteryThreshold = value.lowBatteryThreshold;
  } catch { }
  return defaults;
}
export function saveBackgroundPreferences(value: BackgroundPreferences) { try { localStorage.setItem(`${storagePrefix}background-preferences`, JSON.stringify(value)); } catch { } }
