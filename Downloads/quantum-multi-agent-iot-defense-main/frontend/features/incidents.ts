import type { DefenseAction, EventEnvelope, PredictionPayload, Recovery, ThreatPayload } from "@/types/api";
import { severityRank } from "@/lib/format";

export interface IncidentGroup {
  incidentId: string; correlationId: string; latest: EventEnvelope<ThreatPayload>;
  history: EventEnvelope<ThreatPayload>[];
}

export interface IncidentModelEvidence {
  classicalEvent?: EventEnvelope<PredictionPayload>;
  quantumEvent?: EventEnvelope<PredictionPayload>;
  comparison: "agreement" | "disagreement" | "awaiting_evidence";
}

export function groupIncidents(events: EventEnvelope[]): IncidentGroup[] {
  const grouped = new Map<string, EventEnvelope<ThreatPayload>[]>();
  events.filter((event) => event.event_type === "threat_assessment").forEach((event) => {
    const typed = event as unknown as EventEnvelope<ThreatPayload>;
    const key = typed.payload.incident_id || typed.correlation_id;
    const history = grouped.get(key) ?? []; history.push(typed); grouped.set(key, history);
  });
  return [...grouped.entries()].map(([incidentId, history]) => {
    history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return { incidentId, correlationId: history.at(-1)!.correlation_id, latest: history.at(-1)!, history };
  }).sort((a, b) => (severityRank[b.latest.payload.severity] - severityRank[a.latest.payload.severity]) ||
    (new Date(b.latest.timestamp).getTime() - new Date(a.latest.timestamp).getTime()));
}

export function incidentTimeline(events: EventEnvelope[], correlationId?: string) {
  const filtered = correlationId ? events.filter((event) => event.correlation_id === correlationId) : events;
  return filtered.filter((event) => ["network_activity", "feature_vector", "classical_prediction",
    "quantum_prediction", "threat_assessment", "attack_started", "attack_activity",
    "defense_action_requested", "defense_action_started", "defense_action_completed",
    "defense_action_failed", "defense_rollback", "human_override", "recovery_started",
    "recovery_progress", "recovery_verified", "recovery_failed", "attack_completed",
    "attack_cancelled"].includes(event.event_type)).sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function modelEvidenceForIncident(events: EventEnvelope[], incident: IncidentGroup): IncidentModelEvidence {
  const correlations = new Set(incident.history.map((revision) => revision.correlation_id));
  const correlated = events.filter((event) => correlations.has(event.correlation_id));
  const classicalEvent = [...correlated].reverse().find((event) => event.event_type === "classical_prediction") as EventEnvelope<PredictionPayload> | undefined;
  const classicalVectorId = classicalEvent?.payload.feature_vector_event_id;
  const quantumEvent = classicalVectorId ? [...correlated].reverse().find((event) => event.event_type === "quantum_prediction"
    && (event.payload as unknown as PredictionPayload).feature_vector_event_id === classicalVectorId) as EventEnvelope<PredictionPayload> | undefined : undefined;
  if (!classicalEvent || !quantumEvent) return { classicalEvent, quantumEvent, comparison: "awaiting_evidence" };
  return { classicalEvent, quantumEvent, comparison: classicalEvent.payload.binary.predicted_class_id === quantumEvent.payload.binary.predicted_class_id ? "agreement" : "disagreement" };
}

export function responseForIncident(incident: IncidentGroup, defenses: DefenseAction[], recoveries: Recovery[]) {
  const correlations = new Set(incident.history.map((revision) => revision.correlation_id));
  const defense = [...defenses].reverse().find((item) => item.incident_id === incident.incidentId || correlations.has(item.correlation_id));
  const recovery = [...recoveries].reverse().find((item) => correlations.has(item.correlation_id)
    && (defense ? item.defense_action_id === defense.action_id : !defenses.some((action) => action.action_id === item.defense_action_id && !correlations.has(action.correlation_id))));
  return { defense, recovery };
}
