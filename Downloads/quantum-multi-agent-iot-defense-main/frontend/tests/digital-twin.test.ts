import { describe, expect, it } from "vitest";
import { buildTwinPaths, deviceReadings, deviceSecurityState, positionDevices } from "@/features/digital-twin";
import type { Attack, Device, PolicyState, Topology } from "@/types/api";

const device = (id: string, type: string, state: Record<string, number | string | boolean> = {}): Device => ({
  device_id: id, device_type: type, name: id, address: `10.42.0.${id.length}`, protocol: "TCP", service: "mqtt", status: "online", health: "healthy", last_seen: null, telemetry_state: state,
  network_profile: { telemetry_interval_ticks: 1, source_port: 20_001, destination_port: 1883, protocol: "TCP", service: "mqtt", nominal_packet_count: 2, nominal_payload_bytes: 32, header_bytes_per_packet: 40 },
});

const devices = [device("gateway-01", "gateway", { connected_devices: 2 }), device("soil-01", "soil_moisture_sensor", { moisture_percent: 44.25 }), device("soil-02", "soil_moisture_sensor", { moisture_percent: 46 })];
const topology: Topology = { gateway_id: "gateway-01", nodes: devices.map((item) => ({ device_id: item.device_id, device_type: item.device_type, name: item.name, address: item.address })), links: devices.slice(1).map((item) => ({ source_device_id: item.device_id, destination_device_id: "gateway-01", relationship: "telemetry" })) };
const basePolicy: PolicyState = { isolated_devices: [], quarantined_sources: [], rate_limited_services: {}, restricted_ports: [], gateway_protection: false, counters: {}, action_count: 0 };
const attack = { attack_id: "attack-1", target_device_id: "soil-01", source_device_id: "synthetic-1", status: "active", metadata: {}, name: "Safe test", attack_type: "port_scanning", description: "", severity_hint: "medium", start_tick: 1, end_tick: 4, duration_ticks: 3, intensity: "low", seed: 1, correlation_id: "corr", ticks_active: 1, network_events_generated: 1 } as Attack;

describe("digital twin truth mapping", () => {
  it("places the two real soil sensors separately and formats real readings", () => {
    const positions = positionDevices(devices);
    expect(positions.get("soil-01")).not.toEqual(positions.get("soil-02"));
    expect(deviceReadings(devices[1])).toEqual([{ key: "moisture_percent", label: "Soil moisture", value: "44.3 %" }]);
  });

  it("shows attack and blocked paths only when runtime state calls for them", () => {
    const positions = positionDevices(devices);
    expect(buildTwinPaths(topology, [], basePolicy, positions).map((path) => path.state)).toEqual(["normal", "normal"]);
    expect(buildTwinPaths(topology, [attack], basePolicy, positions).map((path) => path.state)).toContain("attack");
    const blocked = { ...basePolicy, isolated_devices: ["soil-02"], quarantined_sources: ["synthetic-1"] };
    expect(buildTwinPaths(topology, [attack], blocked, positions).filter((path) => path.state === "blocked")).toHaveLength(2);
    expect(deviceSecurityState(devices[0], [attack], blocked)).toBe("online");
    expect(deviceSecurityState(devices[1], [attack], blocked)).toBe("under_attack");
    expect(deviceSecurityState(devices[2], [attack], blocked)).toBe("isolated");
  });
});
