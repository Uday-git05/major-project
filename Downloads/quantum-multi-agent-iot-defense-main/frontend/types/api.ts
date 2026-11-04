export type SimulationState = "stopped" | "running" | "paused";
export type Severity = "informational" | "low" | "medium" | "high" | "critical";

export interface Health { status: "ok"; service: string; version: string }
export interface ModelInfo { feature_count: number; feature_names: string[]; qml_device: string; models: Record<string, string>; thresholds: Record<string, number> }
export interface SimulationStatus { state: SimulationState; seed: number; tick_number: number; simulation_time: string; tick_duration_seconds: number; simulation_speed: number; device_count: number; online_devices: number; event_count: number }
export interface SimulationAction { action: string; status: SimulationStatus; events_emitted: number }
export interface NetworkProfile { telemetry_interval_ticks: number; source_port: number; destination_port: number; protocol: string; service: string; nominal_packet_count: number; nominal_payload_bytes: number; header_bytes_per_packet: number }
export interface Device { device_id: string; device_type: string; name: string; address: string; protocol: string; service: string; status: string; health: string; last_seen: string | null; telemetry_state: Record<string, number | string | boolean>; network_profile: NetworkProfile }
export interface TopologyNode { device_id: string; device_type: string; name: string; address: string }
export interface TopologyLink { source_device_id: string; destination_device_id: string; relationship: string }
export interface Topology { gateway_id: string; nodes: TopologyNode[]; links: TopologyLink[] }

export interface EventEnvelope<T = Record<string, unknown>> { event_id: string; timestamp: string; event_type: string; source: string; correlation_id: string; payload: T }
export interface TelemetryPayload { device_id: string; readings: Record<string, number | string | boolean>; unit_map: Record<string, string> }
export interface NetworkPayload { source_device_id: string; destination_device_id: string; source_address: string; destination_address: string; source_port: number; destination_port: number; protocol: string; service: string; direction: string; packet_count: number; byte_count: number; success: boolean }
export interface PredictionPayload { feature_vector_event_id?: string; binary: PredictionEvidence; multiclass: PredictionEvidence; device_ids: string[] }
export interface PredictionEvidence { predicted_class_id: number; predicted_class_name: string; confidence: number; threshold?: number; model_name: string; latency_ms: number; created_at: string }
export interface ThreatPayload { incident_id: string; affected_devices: string[]; detected: boolean | null; suspected_attack_family: string | null; severity: Severity; evidence_strength: string; evidence: { source: string; category: string; summary: string; strength: string }[]; disagreement: boolean; decision_reason: string; status: string }

export interface FeatureStatus { running: boolean; extractor_version: string; active_flow_count: number; flows_created: number; vectors_emitted: number; invalid_events: number; duplicate_events: number; out_of_order_events: number; minimum_packets: number }
export interface ActiveFlow { flow_id: string; source_address: string; destination_address: string; source_port: number; destination_port: number; protocol: string; source_device_id: string; destination_device_id: string; flow_start: string; flow_end: string; packet_count: number; source_event_count: number }

export interface Agent { agent_id: string; agent_type: string; name: string; role: string; status: string; health: string; started_at: string | null; last_activity_at: string | null; processed_event_count: number; error_count: number; subscriptions: string[]; dependencies: Record<string, string>; state: Record<string, unknown> }
export interface AgentHealth { total_agents: number; healthy_agents: number; degraded_agents: number; unhealthy_agents: number; agents: Agent[] }
export interface AuditEntry { sequence: number; agent_id: string; timestamp: string; action: string; status: string; correlation_id: string | null; event_type: string | null; detail: string; error: string | null }

export interface AttackType { attack_type: string; name: string; description: string; default_target_types: string[]; default_duration_ticks: number; default_intensity: string; protocol: string; service: string; behavior_summary: string }
export interface Attack { attack_id: string; attack_type: string; name: string; description: string; target_device_id: string; source_device_id: string; status: string; severity_hint: Severity; start_tick: number; end_tick: number; duration_ticks: number; intensity: string; seed: number; correlation_id: string; metadata: Record<string, string | number | boolean>; ticks_active: number; network_events_generated: number }

export interface DefenseAction { action_id: string; correlation_id: string; incident_id: string; action_type: string; target: string; reason: string; evidence: string[]; status: string; requested_at: string; started_at: string | null; completed_at: string | null; result: Record<string, string | number | boolean | null>; reversible: boolean; rollback_state: string; initiated_by: string; human_override_state: string }
export interface PolicyState { isolated_devices: string[]; quarantined_sources: string[]; rate_limited_services: Record<string, number>; restricted_ports: number[]; gateway_protection: boolean; counters: Record<string, number>; action_count: number }
export interface Recovery { recovery_id: string; defense_action_id: string; correlation_id: string; state: string; created_tick: number; state_tick: number; verification_ticks: number; normal_events_observed: number; high_assessment_seen: boolean; verified: boolean; reason: string }

export interface DashboardSnapshot {
  health: Health; models: ModelInfo; simulation: SimulationStatus; devices: Device[];
  topology: Topology; events: EventEnvelope[]; featureStatus: FeatureStatus;
  flows: ActiveFlow[]; recentFeatures: EventEnvelope[]; agents: Agent[];
  agentHealth: AgentHealth; audit: AuditEntry[]; attackTypes: AttackType[];
  attacks: Attack[]; activeAttacks: Attack[]; defenses: DefenseAction[];
  policy: PolicyState; recoveries: Recovery[];
  epoch: number; sequence: number; runtimeStatus: RuntimeStatus;
}

export type LiveConnectionState = "live" | "connecting" | "degraded" | "offline" | "paused";
export interface RuntimeStatus { active: boolean; initialized: boolean; overall: string; epoch: number; sequence: number; simulation: SimulationStatus; runner: { running: boolean; tick_errors: number; tick_interval_seconds: number }; components: Record<string, string>; websocket: Record<string, unknown>; startup_order: string[]; checked_at: string }
export interface LiveEnvelope { message_id: string; sequence: number; epoch: number; timestamp: string | null; type: string; correlation_id: string; payload: { event?: EventEnvelope; [key: string]: unknown } }
