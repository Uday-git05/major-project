import type { DashboardSnapshot } from "@/types/api";

export function dashboardSnapshot(): DashboardSnapshot {
  return {
    health: { status: "ok", service: "test", version: "1" },
    models: { feature_count: 27, feature_names: [], qml_device: "default.qubit", models: { binary: "xgboost", qml_binary: "qml" }, thresholds: { binary: 0.012, qml_binary: 0.39 } },
    simulation: { state: "running", seed: 1, tick_number: 7, simulation_time: "2026-01-01T00:00:07Z", tick_duration_seconds: 1, simulation_speed: 1, device_count: 1, online_devices: 1, event_count: 0 },
    devices: [{ device_id: "gateway-01", device_type: "gateway", name: "Farm Gateway", address: "10.42.0.1", protocol: "mqtt", service: "mqtt", status: "online", health: "healthy", last_seen: null, telemetry_state: { connections: 7 }, network_profile: { telemetry_interval_ticks: 1, source_port: 1, destination_port: 1883, protocol: "tcp", service: "mqtt", nominal_packet_count: 1, nominal_payload_bytes: 1, header_bytes_per_packet: 1 } }],
    topology: { gateway_id: "gateway-01", nodes: [{ device_id: "gateway-01", device_type: "gateway", name: "Farm Gateway", address: "10.42.0.1" }], links: [] },
    events: [],
    featureStatus: { running: true, extractor_version: "1", active_flow_count: 0, flows_created: 0, vectors_emitted: 0, invalid_events: 0, duplicate_events: 0, out_of_order_events: 0, minimum_packets: 2 },
    flows: [], recentFeatures: [],
    agents: [{ agent_id: "monitoring-agent", agent_type: "monitoring", name: "Monitoring Agent", role: "Observe", status: "running", health: "healthy", started_at: null, last_activity_at: null, processed_event_count: 0, error_count: 0, subscriptions: [], dependencies: {}, state: { queued_events: 0 } }],
    agentHealth: { total_agents: 6, healthy_agents: 6, degraded_agents: 0, unhealthy_agents: 0, agents: [] },
    audit: [], attackTypes: [], attacks: [], activeAttacks: [], defenses: [],
    policy: { isolated_devices: [], quarantined_sources: [], rate_limited_services: {}, restricted_ports: [], gateway_protection: false, counters: {}, action_count: 0 },
    recoveries: [], epoch: 2, sequence: 5,
    runtimeStatus: { active: true, initialized: true, overall: "live", epoch: 2, sequence: 5, simulation: {} as never, runner: { running: true, tick_errors: 0, tick_interval_seconds: 1 }, components: {}, websocket: {}, startup_order: [], checked_at: "2026-01-01T00:00:00Z" },
  };
}
