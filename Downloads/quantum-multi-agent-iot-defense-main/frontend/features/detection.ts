import type { EventEnvelope, PredictionPayload } from "@/types/api";

export const FROZEN_FEATURE_NAMES = [
  "missed_bytes", "orig_pkts", "orig_ip_bytes", "resp_pkts", "resp_ip_bytes",
  "fwd_pkts_per_sec", "bwd_pkts_per_sec", "flow_pkts_per_sec", "down_up_ratio",
  "fwd_header_size_tot", "fwd_header_size_min", "fwd_header_size_max",
  "bwd_header_size_tot", "bwd_header_size_min", "bwd_header_size_max",
  "fwd_pkts_payload.tot", "fwd_pkts_payload.avg", "bwd_pkts_payload.tot",
  "bwd_pkts_payload.avg", "flow_pkts_payload.tot", "flow_pkts_payload.avg",
  "fwd_iat.tot", "fwd_iat.avg", "bwd_iat.tot", "bwd_iat.avg", "flow_iat.tot", "flow_iat.avg",
] as const;

export type AgreementState = "agreement" | "disagreement" | "awaiting_qml" | "no_prediction";
export interface DetectionEvidence { classicalEvent?: EventEnvelope; quantumEvent?: EventEnvelope; classical?: PredictionPayload; quantum?: PredictionPayload; agreement: AgreementState; }

export function recentPredictionCorrelations(events: EventEnvelope[], focusedCorrelation?: string, limit = 8) {
  return [...new Set(events.filter(event => event.event_type === "classical_prediction" || event.event_type === "quantum_prediction")
    .map(event => event.correlation_id))].reverse()
    .sort((a, b) => Number(b === focusedCorrelation) - Number(a === focusedCorrelation)).slice(0, limit);
}

export function deriveDetectionEvidence(events: EventEnvelope[]): DetectionEvidence {
  const classicalEvent = latest(events, "classical_prediction");
  const classical = classicalEvent?.payload as unknown as PredictionPayload | undefined;
  if (!classicalEvent || !classical) return { agreement: "no_prediction" };
  const classicalVectorId = (classical as PredictionPayload).feature_vector_event_id;
  const latestQuantum = [...events].reverse().find((event) => event.event_type === "quantum_prediction" && event.correlation_id === classicalEvent.correlation_id);
  const quantumEvent = classicalVectorId ? [...events].reverse().find((event) => event.event_type === "quantum_prediction"
    && event.correlation_id === classicalEvent.correlation_id
    && (event.payload as unknown as PredictionPayload).feature_vector_event_id === classicalVectorId) : undefined;
  const visibleQuantumEvent = quantumEvent ?? latestQuantum;
  const quantum = visibleQuantumEvent?.payload as unknown as PredictionPayload | undefined;
  if (!quantumEvent || !quantum) return { classicalEvent, quantumEvent: visibleQuantumEvent, classical, quantum, agreement: "awaiting_qml" };
  return { classicalEvent, quantumEvent, classical, quantum, agreement: classical.binary.predicted_class_id === quantum.binary.predicted_class_id ? "agreement" : "disagreement" };
}

function latest(events: EventEnvelope[], kind: string) { return [...events].reverse().find((event) => event.event_type === kind); }
