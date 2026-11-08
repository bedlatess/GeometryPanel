import type { Session, Snapshot } from '../core/model';
export function widgetSnapshot(session: Session, data: Snapshot) {
  return {
    vehicleLabel: session.vehicle.name.slice(0, 80),
    soc: data.soc,
    range: data.range,
    voltage: data.voltage,
    receivedAt: data.receivedAt,
  };
}
