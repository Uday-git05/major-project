import type { Attack, DefenseAction, EventEnvelope, Recovery, ThreatPayload } from "@/types/api";
import { dashboardSnapshot } from "./fixtures";

export function scenarioAttack(id = "A", status = "active"): Attack {
  return { attack_id: `attack-${id}`, correlation_id: `corr-${id}`, attack_type: "Port_Scanning", name: "Port Scanning", description: "Fixture", target_device_id: "gateway-01", source_device_id: `source-${id}`, status, start_tick: 5, end_tick: 8, duration_ticks: 4, intensity: "medium", severity_hint: "high", seed: 42, metadata: {}, ticks_active: 2, network_events_generated: 4 };
}
export function scenarioPrediction(id = "A", quantum = false, detected = true): EventEnvelope {
  const prediction = { predicted_class_id: detected ? 1 : 0, predicted_class_name: detected ? "Attack" : "Normal", model_name: "fixture", latency_ms: 3, confidence: .8, created_at: "2026-01-01T00:00:07Z" };
  return { event_id: `prediction-${id}-${quantum}`, event_type: quantum ? "quantum_prediction" : "classical_prediction", timestamp: prediction.created_at, source: quantum ? "quantum-ml-agent" : "classical-ml-agent", correlation_id: `corr-${id}`, payload: { feature_vector_event_id: `feature-${id}`, binary: prediction, multiclass: { ...prediction, predicted_class_name: "HTTP_Flood" }, device_ids: ["gateway-01"] } };
}
export function scenarioAssessment(id = "A"): EventEnvelope {
  const payload: ThreatPayload = { incident_id: `incident-${id}`, affected_devices: ["gateway-01"], detected: true, suspected_attack_family: "HTTP_Flood", severity: id === "A" ? "medium" : "critical", evidence_strength: "primary", evidence: [], disagreement: true, decision_reason: `Assessment ${id}`, status: "provisional" };
  return { event_id: `assessment-${id}`, event_type: "threat_assessment", timestamp: "2026-01-01T00:00:07Z", source: "threat-analysis-agent", correlation_id: `corr-${id}`, payload: { ...payload } };
}
export function scenarioDefense(id = "A", status = "completed"): DefenseAction {
  return { action_id: `defense-${id}`, correlation_id: `corr-${id}`, incident_id: `incident-${id}`, action_type: "protect_gateway_mode", target: "gateway-01", reason: `Defense ${id}`, evidence: [], status, requested_at: "2026-01-01T00:00:07Z", started_at: null, completed_at: null, result: {}, reversible: true, rollback_state: "not_requested", initiated_by: "defense-agent", human_override_state: status === "planned" ? "pending" : "none" };
}
export function scenarioRecovery(id = "A", state = "manual_review", verified = false): Recovery {
  return { recovery_id: `recovery-${id}`, correlation_id: `corr-${id}`, defense_action_id: `defense-${id}`, state, verified, created_tick: 8, state_tick: 10, verification_ticks: 2, normal_events_observed: 3, high_assessment_seen: true, reason: `Recovery ${id}` };
}
export function scenarioData() {
  const data = dashboardSnapshot(); data.attacks = [scenarioAttack(), scenarioAttack("B")]; data.activeAttacks = data.attacks;
  data.events = [scenarioPrediction(), scenarioPrediction("A", true, false), scenarioAssessment(), scenarioPrediction("B"), scenarioAssessment("B")];
  data.defenses = [scenarioDefense(), scenarioDefense("B", "running")]; data.recoveries = [scenarioRecovery(), scenarioRecovery("B", "recovered", true)];
  data.attackTypes = ["Arp_Spoofing", "HTTP_Flood", "ICMP_Flood", "MQTT_Flood", "Port_Scanning", "TCP_Flood", "UDP_Flood"].map((attack_type) => ({ attack_type, name: attack_type.replaceAll("_", " "), description: "Fixture only", default_target_types: ["gateway"], default_duration_ticks: 4, default_intensity: "medium", protocol: "TCP", service: "test", behavior_summary: "Fixture" }));
  return data;
}
