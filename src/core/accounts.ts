import { validVehicleId, type Session, type Vehicle } from './model';

export interface SavedVehicle { id: string; vin: string; label: string; type: string; plate: string; epoch: number; enabled: boolean }
export interface SavedAccount { id: string; uid: string; token: string; label: string; epoch: number; enabled: boolean; vehicles: SavedVehicle[] }
export interface AccountBook { schema: 1; accounts: SavedAccount[]; selectedVehicleId: string | null }
export const emptyAccounts = (): AccountBook => ({ schema: 1, accounts: [], selectedVehicleId: null });
const text = (value: unknown, maximum: number) => typeof value === 'string' && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const epoch = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function validateAccounts(value: unknown): AccountBook {
  if (!value || typeof value !== 'object') throw new Error('storage');
  const book = value as AccountBook;
  if (book.schema !== 1 || !Array.isArray(book.accounts) || book.accounts.length > 8 || !(book.selectedVehicleId === null || id(book.selectedVehicleId))) throw new Error('storage');
  const seenAccounts = new Set<string>(), seenVehicles = new Set<string>();
  for (const account of book.accounts) {
    if (!account || !id(account.id) || seenAccounts.has(account.id) || !epoch(account.epoch) || !text(account.uid, 128)
      || !text(account.token, 8192) || !account.token || /\s/.test(account.token) || !text(account.label, 80) || typeof account.enabled !== 'boolean'
      || !Array.isArray(account.vehicles) || account.vehicles.length > 16) throw new Error('storage');
    seenAccounts.add(account.id);
    const vins = new Set<string>();
    for (const car of account.vehicles) {
      if (!car || !id(car.id) || seenVehicles.has(car.id) || typeof car.vin !== 'string' || !validVehicleId(car.vin) || vins.has(car.vin)
        || !epoch(car.epoch) || typeof car.enabled !== 'boolean' || !text(car.label, 80) || !text(car.type, 80) || !text(car.plate, 32)) throw new Error('storage');
      seenVehicles.add(car.id); vins.add(car.vin);
    }
  }
  if (book.selectedVehicleId !== null && !seenVehicles.has(book.selectedVehicleId)) throw new Error('storage');
  return { schema: 1, selectedVehicleId: book.selectedVehicleId, accounts: book.accounts.map(({ id, uid, token, label, epoch, enabled, vehicles }) => ({ id, uid, token, label, epoch, enabled, vehicles: vehicles.map(({ id, vin, label, type, plate, epoch, enabled }) => ({ id, vin, label, type, plate, epoch, enabled })) })) };
}
export function activeAccount(book: AccountBook) { return book.accounts.find(account => account.vehicles.some(car => car.id === book.selectedVehicleId)) ?? null; }
export function accountSession(book: AccountBook, vehicleId = book.selectedVehicleId): Session | null {
  for (const account of book.accounts) {
    const car = account.vehicles.find(item => item.id === vehicleId);
    if (car) return { token: account.token, uid: account.uid, vehicle: { vin: car.vin, name: car.label, type: car.type, plate: car.plate } };
  }
  return null;
}
export function rememberAccount(book: AccountBook, session: Session, vehicles?: Vehicle[], makeId: () => string = () => crypto.randomUUID()): AccountBook {
  const result = validateAccounts(book);
  let account = result.accounts.find(item => session.uid ? item.uid === session.uid : item.token === session.token);
  if (!account) {
    if (result.accounts.length >= 8) throw new Error('account_limit');
    account = { id: makeId(), epoch: 0, token: session.token, uid: session.uid, label: `账号 ${result.accounts.length + 1}`, enabled: true, vehicles: [] };
    result.accounts.push(account);
  } else if (account.token !== session.token) { account.epoch++; account.token = session.token; account.enabled = true; }
  const prior = account.vehicles;
  const source = vehicles ?? prior.map(car => ({ vin: car.vin, name: car.label, type: car.type, plate: car.plate }));
  const unique = new Map(source.map(car => [car.vin, car])); unique.set(session.vehicle.vin, session.vehicle);
  if (unique.size > 16) throw new Error('vehicle_limit');
  // An explicit fresh cloud list replaces this account's vehicles; a one-car
  // session update retains the other known vehicles.
  account.vehicles = [...unique.values()].map(car => {
    const old = prior.find(value => value.vin === car.vin);
    return { id: old?.id ?? makeId(), vin: car.vin, label: car.name.slice(0, 80), type: car.type.slice(0, 80), plate: car.plate.slice(0, 32), epoch: old?.epoch ?? 0, enabled: old?.enabled ?? true };
  });
  result.selectedVehicleId = account.vehicles.find(car => car.vin === session.vehicle.vin)!.id;
  return validateAccounts(result);
}
export function removeAccount(book: AccountBook, accountId: string): AccountBook {
  const result = validateAccounts(book); result.accounts = result.accounts.filter(account => account.id !== accountId);
  if (!result.accounts.some(account => account.vehicles.some(car => car.id === result.selectedVehicleId))) result.selectedVehicleId = result.accounts[0]?.vehicles[0]?.id ?? null;
  return result;
}
export function changeAccountPreferences(book: AccountBook, before: AccountBook, desired: AccountBook): AccountBook {
  const result = validateAccounts(book); validateAccounts(before); validateAccounts(desired);
  for (const edited of desired.accounts) {
    const original = before.accounts.find(item => item.id === edited.id);
    const current = result.accounts.find(item => item.id === edited.id);
    if (!original || !current || original.token !== current.token) throw new Error('storage_changed');
    if (original.label !== edited.label) current.label = edited.label;
    if (original.enabled !== edited.enabled) { current.enabled = edited.enabled; current.epoch++; }
    for (const car of edited.vehicles) {
      const oldCar = original.vehicles.find(item => item.id === car.id), currentCar = current.vehicles.find(item => item.id === car.id);
      if (!oldCar || !currentCar) throw new Error('storage_changed');
      if (oldCar.enabled !== car.enabled) { currentCar.enabled = car.enabled; currentCar.epoch++; }
    }
  }
  return validateAccounts(result);
}
export function nativeAccounts(book: AccountBook) {
  const checked = validateAccounts(book);
  return { accounts: checked.accounts.map(account => ({ ...account, vehicles: account.vehicles.map(({ id, vin, label, epoch, enabled }) => ({ id, vin, label, epoch, enabled })) })), selectedVehicleId: checked.selectedVehicleId };
}
