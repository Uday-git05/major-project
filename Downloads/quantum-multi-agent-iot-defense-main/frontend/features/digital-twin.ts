import type { Attack, Device, PolicyState, Topology } from "@/types/api";

export type TwinPosition = readonly [number, number, number];
export type DeviceSecurityState = "online" | "offline" | "isolated" | "under_attack";

const TYPE_POSITIONS: Record<string, TwinPosition[]> = {
  gateway: [[-5.2, 1.82, -2.55]],
  soil_moisture_sensor: [[-3.3, 0.23, -1.95], [-0.65, 0.23, -0.65]],
  temperature_sensor: [[2.1, 0.32, -1.75]],
  humidity_sensor: [[3.0, 0.32, 0.85]],
  water_flow_sensor: [[1.7, 0.3, 2.55]],
  pump_controller: [[-2.55, 0.42, 3.1]],
  weather_node: [[5.2, 0.03, -2.9]],
};

export const ATTACK_SOURCE_POSITION: TwinPosition = [-4.7, 0.8, 3.3];

export function positionDevices(devices: Device[]): Map<string, TwinPosition> {
  const counts = new Map<string, number>();
  return new Map(devices.map((device, index) => {
    const typeIndex = counts.get(device.device_type) ?? 0;
    counts.set(device.device_type, typeIndex + 1);
    const configured = TYPE_POSITIONS[device.device_type]?.[typeIndex];
    const fallback: TwinPosition = [-3.5 + (index % 4) * 2.3, 0.4, -2 + Math.floor(index / 4) * 3.7];
    return [device.device_id, configured ?? fallback];
  }));
}

export function deviceSecurityState(device: Device, attacks: Attack[], policy: PolicyState): DeviceSecurityState {
  if (policy.isolated_devices.includes(device.device_id)) return "isolated";
  if (attacks.some((attack) => ["scheduled", "active"].includes(attack.status) && attack.target_device_id === device.device_id)) return "under_attack";
  return device.status === "online" ? "online" : "offline";
}

const READING_LABELS: Record<string, { label: string; unit: string }> = {
  connected_devices: { label: "Connected", unit: "" },
  moisture_percent: { label: "Soil moisture", unit: "%" },
  temperature_c: { label: "Temperature", unit: "°C" },
  humidity_percent: { label: "Humidity", unit: "%" },
  flow_liters_per_minute: { label: "Flow", unit: "L/min" },
  pump_active: { label: "Pump active", unit: "" },
  pump_on: { label: "Pump", unit: "" },
  power_watts: { label: "Power", unit: "W" },
  air_temperature_c: { label: "Air temperature", unit: "°C" },
  wind_speed_mps: { label: "Wind", unit: "m/s" },
  rainfall_mm: { label: "Rainfall", unit: "mm" },
};

export interface TwinReading { key: string; label: string; value: string; }

export function deviceReadings(device: Device): TwinReading[] {
  return Object.entries(device.telemetry_state).flatMap(([key, raw]) => {
    const definition = READING_LABELS[key];
    if (!definition || !["number", "boolean", "string"].includes(typeof raw)) return [];
    const value = typeof raw === "number" ? (Number.isInteger(raw) ? String(raw) : raw.toFixed(1)) : typeof raw === "boolean" ? (raw ? "On" : "Off") : String(raw);
    return [{ key, label: definition.label, value: `${value}${definition.unit ? ` ${definition.unit}` : ""}` }];
  });
}

export interface TwinPath {
  id: string;
  source: TwinPosition;
  target: TwinPosition;
  state: "normal" | "attack" | "blocked";
}

export function buildTwinPaths(topology: Topology, attacks: Attack[], policy: PolicyState, positions: Map<string, TwinPosition>): TwinPath[] {
  const normal = topology.links.flatMap((link, index) => {
    const source = positions.get(link.source_device_id);
    const target = positions.get(link.destination_device_id);
    if (!source || !target) return [];
    return [{ id: `normal-${index}`, source, target, state: policy.isolated_devices.includes(link.source_device_id) ? "blocked" as const : "normal" as const }];
  });
  const hostile = attacks.filter((attack) => attack.status === "active" || (attack.status === "completed"
    && (policy.quarantined_sources.includes(attack.source_device_id) || policy.isolated_devices.includes(attack.target_device_id)))).flatMap((attack) => {
    const target = positions.get(attack.target_device_id);
    if (!target) return [];
    return [{
      id: `attack-${attack.attack_id}`,
      source: ATTACK_SOURCE_POSITION,
      target,
      state: policy.quarantined_sources.includes(attack.source_device_id) ? "blocked" as const : "attack" as const,
    }];
  });
  return [...normal, ...hostile];
}
